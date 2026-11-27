import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { explainDbError, validateNewPerson, type PersonAdminRow } from "@/lib/people-admin";

/**
 * Step 11 새 사람 등록 · 9b 폼 다듬기.
 *   · 등록 입력: 목장·이름·역할·성별 필수, 출생년도 선택(4자리, 1950~올해), 이름 앞뒤 공백 제거·20자
 *   · DB 오류: 같은 목장 동명이인과 목장장 중복을 구분해 말한다
 *   · 등록 폼: 미리 고른 값 없음 → 저장 전에 막힘, 다 고르면 액션 → 상세로
 *   · 9b 폼: 목장을 옮기면 목장장 해제 + 안내, 졸업·입대 안내, 계정 있는 사람을 이탈로 바꾸면 안내
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: vi.fn() }) })); // 등록 뒤 이동은 갈아 끼우기(replace) — 같은 가짜로 받는다

const { NewPersonForm } = await import("@/app/(tabs)/admin/people/new/new-person-form");
const { PersonAdminForm } = await import("@/app/(tabs)/admin/people/[id]/person-admin-form");

const G1 = "g1";
const GROUPS = [
  { id: G1, name: "하나" },
  { id: "g2", name: "둘" },
];
const ok = { group_id: G1, name: " 새사람 ", group_role: "member" as const, gender: "female" as const, birth_year: "" };

describe("등록 입력 검증", () => {
  it("다 맞으면 이름을 다듬고 출생년도는 null", () => {
    expect(validateNewPerson(ok, [G1], 2026)).toEqual({
      ok: true,
      value: { group_id: G1, name: "새사람", group_role: "member", gender: "female", birth_year: null },
    });
    expect(validateNewPerson({ ...ok, birth_year: "2003" }, [G1], 2026)).toMatchObject({ ok: true, value: { birth_year: 2003 } });
  });

  it("빠진 칸을 차례로 말한다 — 목장 · 이름 · 역할 · 성별 ★", () => {
    expect(validateNewPerson({ ...ok, group_id: "" }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("목장") });
    expect(validateNewPerson({ ...ok, group_id: "x" }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("목장") });
    expect(validateNewPerson({ ...ok, name: "   " }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("이름") });
    expect(validateNewPerson({ ...ok, name: "가".repeat(21) }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("20자") });
    expect(validateNewPerson({ ...ok, group_role: "" }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("역할") });
    expect(validateNewPerson({ ...ok, gender: "" }, [G1], 2026)).toMatchObject({ ok: false, message: expect.stringContaining("성별") });
  });

  it("출생년도 — 네 자리, 1950~올해", () => {
    expect(validateNewPerson({ ...ok, birth_year: "03" }, [G1], 2026).ok).toBe(false);
    expect(validateNewPerson({ ...ok, birth_year: "1949" }, [G1], 2026).ok).toBe(false);
    expect(validateNewPerson({ ...ok, birth_year: "2027" }, [G1], 2026).ok).toBe(false);
    expect(validateNewPerson({ ...ok, birth_year: "1950" }, [G1], 2026).ok).toBe(true);
  });
});

describe("DB 오류를 사람 말로", () => {
  it("같은 목장 동명이인과 목장장 중복을 구분한다 ★", () => {
    expect(explainDbError("23505", 'duplicate key value violates unique constraint "persons_unique_name_in_group"')).toContain("같은 이름");
    expect(explainDbError("23505", 'duplicate key value violates unique constraint "persons_one_head_per_group"')).toContain("목자");
    expect(explainDbError("23514", 'new row violates check constraint "persons_name_ck"')).toContain("1~20자");
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  push.mockReset();
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

const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const change = async (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(async () => {
    if (el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

describe("등록 폼", () => {
  it("미리 고른 값이 없고, 빈 채로 누르면 액션이 불리지 않는다", async () => {
    const save = vi.fn();
    await render(<NewPersonForm groups={GROUPS} thisYear={2026} save={save} />);
    expect(container.querySelector<HTMLSelectElement>("#new-group")!.value).toBe("");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some((r) => r.checked)).toBe(false);
    await act(async () => button("등록").click());
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("목장");
  });

  it("다 고르면 액션에 넘기고 그 사람 상세로 간다. 리더면 신청 안내 ★", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, id: "p9" });
    await render(<NewPersonForm groups={GROUPS} thisYear={2026} save={save} />);
    await change(container.querySelector<HTMLSelectElement>("#new-group")!, G1);
    await change(container.querySelector<HTMLInputElement>("#new-name")!, "새사람");
    await act(async () => container.querySelector<HTMLInputElement>('input[name="group_role"][value="leader"]')!.click());
    expect(container.querySelector('[data-testid="leader-guide"]')?.textContent).toContain("신청");
    await act(async () => container.querySelector<HTMLInputElement>('input[name="gender"][value="male"]')!.click());
    await act(async () => button("등록").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(save).toHaveBeenCalledWith({ group_id: G1, name: "새사람", group_role: "leader", gender: "male", birth_year: "" });
    expect(push).toHaveBeenCalledWith("/admin/people/p9?created=1");
  });

  it("DB 가 거부하면 그 문구를 보인다", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, message: "그 목장에 같은 이름이 있습니다." });
    await render(<NewPersonForm groups={GROUPS} thisYear={2026} save={save} />);
    await change(container.querySelector<HTMLSelectElement>("#new-group")!, G1);
    await change(container.querySelector<HTMLInputElement>("#new-name")!, "서다온");
    await act(async () => container.querySelector<HTMLInputElement>('input[name="group_role"][value="member"]')!.click());
    await act(async () => container.querySelector<HTMLInputElement>('input[name="gender"][value="female"]')!.click());
    await act(async () => button("등록").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("같은 이름");
    expect(push).not.toHaveBeenCalled();
  });
});

const person = (over: Partial<PersonAdminRow> = {}): PersonAdminRow => ({
  id: "p1",
  name: "가",
  group_id: G1,
  group_role: "leader",
  is_group_head: true,
  status: "active",
  care_status: "active",
  needs_check: null,
  user_id: null,
  birth_year: 2001,
  ...over,
});
const GROUP_REFS = [
  { id: G1, name: "하나", number: 1 },
  { id: "g2", name: "둘", number: 2 },
];

describe("9b 폼 다듬기", () => {
  it("목장장을 다른 목장으로 옮기면 목장장이 풀리고 안내가 뜬다 — 저장에도 false 로 간다 ★", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    await render(<PersonAdminForm person={person()} groups={GROUP_REFS} expectedUpdatedAt="t" linked={null} save={save} unlink={vi.fn()} />);
    await change(container.querySelector<HTMLSelectElement>("#group")!, "g2");
    expect(container.querySelector('[data-testid="head-dropped"]')).not.toBeNull();
    await act(async () => button("저장").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(save).toHaveBeenCalledWith("p1", expect.objectContaining({ group_id: "g2", is_group_head: false }), "t");
  });

  it("상태 아래 설명 글은 없다(2026-10-29 — 화면의 작은 설명 글을 모두 뺐다)", async () => {
    await render(<PersonAdminForm person={person({ is_group_head: false })} groups={GROUP_REFS} expectedUpdatedAt="t" linked={null} save={vi.fn()} unlink={vi.fn()} />);
    expect(container.querySelector('[data-testid="status-guide"]')).toBeNull();
  });

  it("계정 있는 사람을 이탈로 바꾸면 연결 안내", async () => {
    await render(
      <PersonAdminForm
        person={person({ is_group_head: false, user_id: "u1" })}
        groups={GROUP_REFS}
        expectedUpdatedAt="t"
        linked={{ name: "계정", providerLabel: "구글", roleLabel: "리더" }}
        save={vi.fn()}
        unlink={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="left-linked"]')).toBeNull();
    await change(container.querySelector<HTMLSelectElement>("#status")!, "left");
    expect(container.querySelector('[data-testid="left-linked"]')?.textContent).toContain("연결을 해제");
  });
});
