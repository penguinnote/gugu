import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARE_STATUS_LABELS, PERSON_STATUS_LABELS } from "@/lib/labels";
import { explainDbError, groupSections, matchesFilter, personFlags, validatePatch, type PersonAdminRow } from "@/lib/people-admin";

/**
 * A-1 명단 관리 (Step 9b) — 순수 규칙과 폼 배선.
 *   · 목록: 목장 순, 목장장 → 리더 → 청년, 떠난 사람 맨 아래. 표시는 기본값이 아닌 것만
 *   · 저장 전에 말로 막는 조합(계정 있는 리더 → 청년, 청년 목장장, 기록 제외의 들고남)
 *   · 폼: 바뀐 게 없으면 저장이 안 나간다. 바꾸면 액션에 (id, patch, stamp). 연결 해제는 두 번
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { PersonAdminForm } = await import("@/app/(tabs)/admin/people/[id]/person-admin-form");

const person = (over: Partial<PersonAdminRow> = {}): PersonAdminRow => ({
  id: "p1",
  name: "가",
  group_id: "g1",
  group_role: "member",
  is_group_head: false,
  status: "active",
  care_status: "active",
  needs_check: null,
  user_id: null,
  birth_year: 2001,
  ...over,
});

const labels = { status: PERSON_STATUS_LABELS, care: CARE_STATUS_LABELS };

describe("목록 규칙", () => {
  it("목장은 받은 순서 · 목장장 → 리더 → 청년 → 떠난 사람, 이름순", () => {
    const people = [
      person({ id: "1", name: "하", group_role: "member" }),
      person({ id: "2", name: "나", group_role: "leader" }),
      person({ id: "3", name: "가", status: "left" }),
      person({ id: "4", name: "다", group_role: "leader", is_group_head: true }),
      person({ id: "5", name: "라", group_id: "g2" }),
    ];
    const groups = [
      { id: "g2", name: "둘", number: 2 },
      { id: "g1", name: "하나", number: 1 },
    ];
    // 목장은 받은 순서 그대로 — 순서는 부르는 화면이 정한다(lib/group-order, 2026-11-17)
    const s = groupSections(people, groups, "all");
    expect(s.map((x) => x.group.name)).toEqual(["둘", "하나"]);
    s.reverse();
    expect(s[0].people.map((p) => p.name)).toEqual(["다", "나", "하", "가"]);
    expect(s[0]).toMatchObject({ leaders: 2, members: 1 });
    // 필터를 걸면 빈 목장은 빠진다
    expect(groupSections(people, groups, "leaders").map((x) => x.group.name)).toEqual(["하나"]);
  });

  it("필터와 표시", () => {
    const p = person({ is_group_head: true, group_role: "leader", care_status: "military", needs_check: true, user_id: "u1" });
    // '확인 필요' 는 표시하지 않는다(2026-11-11)
    expect(personFlags(p, labels)).toEqual(["목자", "군 복무", "계정"]);
    expect(personFlags(person(), labels)).toEqual([]);
    expect(personFlags(person({ status: "opted_out" }), labels)).toEqual(["기록 제외"]);
    expect(matchesFilter(person({ status: "dormant" }), "flagged")).toBe(true);
    expect(matchesFilter(person(), "flagged")).toBe(false);
  });
});

describe("저장 전에 말로 막는 것", () => {
  const base = { group_id: "g1", group_role: "member" as const, is_group_head: false, status: "active" as const, care_status: "active" as const, needs_check: null };
  it("계정 있는 리더 → 청년", () => {
    expect(validatePatch(person({ group_role: "leader", user_id: "u1" }), { ...base, group_role: "member" })).toContain("연결을 해제");
    expect(validatePatch(person({ group_role: "leader" }), { ...base, group_role: "member" })).toBeNull();
  });
  it("청년 목장장 · 기록 제외의 들고남", () => {
    expect(validatePatch(person(), { ...base, is_group_head: true })).toContain("리더여야");
    expect(validatePatch(person({ status: "dormant" }), { ...base, status: "opted_out" })).toContain("활동 중인");
    expect(validatePatch(person({ status: "opted_out" }), { ...base, status: "dormant" })).toContain("먼저 활동");
    expect(validatePatch(person({ status: "opted_out" }), { ...base, status: "active" })).toBeNull();
  });
  it("DB 오류를 사람 말로", () => {
    expect(explainDbError("23514", "청년에게는 앱 계정을 붙일 수 없습니다")).toContain("연결을 해제");
    expect(explainDbError("23505", 'duplicate key value violates unique constraint "persons_one_head_per_group"')).toContain("목자");
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

function saveButton(): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find((b) => /^(저장|저장 중…)$/.test(b.textContent?.trim() ?? ""))!;
}

const GROUPS = [
  { id: "g1", name: "하나", number: 1 },
  { id: "g2", name: "둘", number: 2 },
];

describe("사람 수정 폼", () => {
  it("바뀐 게 없으면 저장이 나가지 않는다. 바꾸면 (id, patch, stamp) ★", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    await render(<PersonAdminForm person={person()} groups={GROUPS} expectedUpdatedAt="t1" linked={null} save={save} unlink={vi.fn()} />);
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    await act(async () => saveButton().click());
    expect(save).not.toHaveBeenCalled();

    const select = container.querySelector<HTMLSelectElement>("#care")!;
    await act(async () => {
      select.value = "military";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saveButton().getAttribute("aria-disabled")).toBe("false");
    await act(async () => saveButton().click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(save).toHaveBeenCalledWith("p1", expect.objectContaining({ care_status: "military", group_id: "g1" }), "t1");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("저장했습니다.");
  });

  it("계정 있는 리더를 청년으로 바꾸면 저장 전에 막힌다", async () => {
    const save = vi.fn();
    await render(
      <PersonAdminForm
        person={person({ group_role: "leader", user_id: "u1" })}
        groups={GROUPS}
        expectedUpdatedAt="t1"
        linked={{ name: "계정이름", providerLabel: "구글", roleLabel: "리더" }}
        save={save}
        unlink={vi.fn()}
      />,
    );
    const member = container.querySelector<HTMLInputElement>('input[name="role"][value="member"]')!;
    await act(async () => member.click());
    await act(async () => saveButton().click());
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("연결을 해제");
  });

  it("연결 해제는 두 번 — 첫 클릭은 확인 문구, 둘째에 액션 (잠금 여부 포함) ★", async () => {
    const unlink = vi.fn().mockResolvedValue({ ok: true });
    await render(
      <PersonAdminForm
        person={person({ group_role: "leader", user_id: "u1" })}
        groups={GROUPS}
        expectedUpdatedAt="t1"
        linked={{ name: "계정이름", providerLabel: "카카오", roleLabel: "리더" }}
        save={vi.fn()}
        unlink={unlink}
      />,
    );
    const btn = () => container.querySelector<HTMLButtonElement>('[data-testid="unlink"]')!;
    expect(btn().textContent).toBe("연결 해제");
    await act(async () => btn().click());
    expect(unlink).not.toHaveBeenCalled();
    expect(btn().textContent).toContain("정말 해제");
    const lock = container.querySelector<HTMLInputElement>('[data-testid="linked"] input[type="checkbox"]')!;
    await act(async () => lock.click());
    await act(async () => btn().click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(unlink).toHaveBeenCalledWith("p1", true);
  });

  it("충돌이면 저장이 잠긴다", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, conflict: true, message: "다른 운영자가 방금 고쳤습니다. 다시 열어 주세요." });
    await render(<PersonAdminForm person={person()} groups={GROUPS} expectedUpdatedAt="t1" linked={null} save={save} unlink={vi.fn()} />);
    const select = container.querySelector<HTMLSelectElement>("#status")!;
    await act(async () => {
      select.value = "dormant";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => saveButton().click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("다시 열어");
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
  });
});
