import { useContext, useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 넓은 화면 운영자 명단(2026-11-27, 1024px 이상)
 *   · 표 — 이름 찾기 · 목장 · 구분 · 상태로 거르고, 목장 차례 → 목자 → 목동 → 양, 떠난 사람은 맨 아래
 *   · 고르기 — 'n명 골랐어요' 띠, 임원진 맡기기는 계정이 있는 사람만 지금 임원진 처리(setOfficer)를 사람마다
 *   · 이름을 누르면 ?p= 로(주소에 남는다), 편집 칸에서 고친 채면 버릴지 먼저 묻는다
 */
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const setOfficer = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/app/(tabs)/admin/people/[id]/actions", () => ({ setOfficer: (...a: unknown[]) => setOfficer(...(a as [])) }));

const { PeopleWide, filterPeople } = await import("@/app/(tabs)/admin/people/people-wide");
const { PanelDirty } = await import("@/app/(tabs)/admin/people/panel-dirty");
type WidePerson = Parameters<typeof filterPeople>[0][number];

const groups = [
  { id: "g1", name: "가온", number: 1 },
  { id: "g2", name: "나래", number: 2 },
];
const W = (id: string, name: string, extra: Partial<WidePerson> = {}): WidePerson => ({
  id, name, group_id: "g1", group_role: "member", is_group_head: false, status: "active", care_status: "active", needs_check: false, user_id: null, birth_year: 2000,
  training_stage: null, gender: null, campus: null, is_officer: false, ...extra,
});
const people = [
  W("a", "양가람"),
  W("b", "목자나리", { group_role: "leader", is_group_head: true, user_id: "u1" }),
  W("c", "목동다온", { group_role: "leader", user_id: "u2" }),
  W("d", "떠난라희", { status: "left" }),
  W("e", "나래한별", { group_id: "g2", user_id: "u3", is_officer: true }),
];

describe("표 거르기 · 차례", () => {
  const f = (o: Partial<{ q: string; group: string; role: "" | "head" | "sub" | "member"; status: string }> = {}) =>
    filterPeople(people, groups, { q: "", group: "", role: "", status: "", ...o }).map((p) => p.name);
  it("목장 차례 → 목자 → 목동 → 양, 떠난 사람은 그 목장 맨 아래", () => {
    expect(f()).toEqual(["목자나리", "목동다온", "양가람", "떠난라희", "나래한별"]);
  });
  it("이름(띄어쓰기 무시) · 목장 · 구분 · 상태", () => {
    expect(f({ q: "다 온" })).toEqual(["목동다온"]);
    expect(f({ group: "g2" })).toEqual(["나래한별"]);
    expect(f({ role: "head" })).toEqual(["목자나리"]);
    expect(f({ role: "member", status: "active" })).toEqual(["양가람", "나래한별"]);
    expect(f({ status: "left" })).toEqual(["떠난라희"]);
  });
});

describe("고르기 · 편집 칸", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    replace.mockClear();
    refresh.mockClear();
    setOfficer.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const rows = () => [...container.querySelectorAll<HTMLTableRowElement>("[data-testid=pw-row]")];
  const rowOf = (name: string) => rows().find((r) => r.textContent?.includes(name))!;
  const click = async (el: Element) => act(async () => (el as HTMLElement).click());

  it("머리 — 청년부(떠난 사람 빼고) · 목장 · 계정 연결 수, 임원진은 이름 옆 알약", async () => {
    await act(async () => root.render(<PeopleWide people={people} groups={groups} selectedId={null} panel={null} />));
    expect(container.querySelector("[data-testid=people-wide-sub]")?.textContent).toBe("청년부 4명 · 목장 2곳 · 계정 연결 3명");
    expect(rowOf("나래한별").textContent).toContain("임원진");
  });

  it("고르면 'n명 골랐어요' — 임원진 맡기기는 계정이 있고 아직 임원진이 아닌 사람만", async () => {
    await act(async () => root.render(<PeopleWide people={people} groups={groups} selectedId={null} panel={null} />));
    for (const n of ["양가람", "목자나리", "목동다온", "나래한별"]) await click(rowOf(n).querySelector("input[type=checkbox]")!);
    expect(container.querySelector("[data-testid=pw-picked]")?.textContent).toContain("4명 골랐어요");
    await click(container.querySelector("[data-testid=pw-officer]")!);
    expect(container.querySelector("[data-testid=pw-officer-confirm]")?.textContent).toContain("2명에게 임원진을 맡길까요?");
    await click([...container.querySelectorAll("[data-testid=pw-officer-confirm] button")].find((b) => b.textContent === "맡기기")!);
    expect(setOfficer.mock.calls).toEqual([["b", true], ["c", true]]);
    expect(refresh).toHaveBeenCalled();
    expect(container.querySelector("[role=status]")?.textContent).toContain("2명에게 임원진을 맡겼어요");
  });

  it("이름을 누르면 ?p= 로 — 편집 칸에서 고친 채면 버릴지 먼저 묻는다", async () => {
    function DirtyForm() {
      const report = useContext(PanelDirty);
      useEffect(() => report?.(true), [report]);
      return <p>고치는 중</p>;
    }
    await act(async () => root.render(<PeopleWide people={people} groups={groups} selectedId="a" panel={<DirtyForm />} />));
    await click(rowOf("목자나리").querySelector("[data-testid=pw-name]")!);
    expect(replace).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=pw-leave]")?.textContent).toContain("고친 내용을 버릴까요?");
    await click([...container.querySelectorAll("[data-testid=pw-leave] button")].find((b) => b.textContent === "버리기")!);
    expect(replace).toHaveBeenCalledWith("/admin/people?p=b", { scroll: false });
  });

  it("고친 것이 없으면 바로 간다", async () => {
    await act(async () => root.render(<PeopleWide people={people} groups={groups} selectedId="a" panel={<p>그대로</p>} />));
    await click(rowOf("목동다온").querySelector("[data-testid=pw-name]")!);
    expect(replace).toHaveBeenCalledWith("/admin/people?p=c", { scroll: false });
  });
});
