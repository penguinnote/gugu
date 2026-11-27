import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { attendRate, latestWeek, onlineRate, weekColumns, AttendanceWide } from "@/app/(tabs)/attendance/attendance-wide";
import { bookWeeks, buildBook } from "@/lib/attendance-book";

/**
 * 넓은 화면 출석부(2026-11-27) — 휴대폰 출석부와 같은 계산(lib/attendance-book)으로 한 장짜리 표.
 *   · 주 열은 최근 주부터, 휴주는 빈 열로 끼운다
 *   · 타일 — 최근 주(기록 있는 마지막 주) 현장 · 온라인 · 목장 · 명단 수
 *   · 현장 예배 출석부는 온라인도 결석, 현장 + 온라인은 '온'
 *   · 출석률은 휴대폰 '출석' 칸과 같은 값(보는 출석부대로)
 *   · 온라인 비율은 휴대폰 '온라인' 칸과 같은 값(어느 출석부든 같다), 노란 강조는 없다
 *   · 휴대폰과 같은 정보만 — 회원 자격 · 온라인 비율 강조 · 회원 자격 규칙은 화면에 없다(엑셀에만, 2026-11-16 결정)
 */
const ALL = bookWeeks("2026-09-06", "2026-11-22");
const SKIP = ["2026-10-04"];
const weeks = ALL.filter((w) => !SKIP.includes(w));
const groups = [{ id: "g1", name: "가온", number: 1 }];
const P = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, group_id: "g1", group_role: "member", is_group_head: false, care_status: "active", assembly_member: true, campus: null, ...extra });
const people = [P("a", "가람"), P("b", "나리", { assembly_member: false }), P("c", "다온", { care_status: "military" })];
const records = weeks.flatMap((w, i) => [
  // 가람 — 늘 현장, 마지막 주만 온라인
  { person_id: "a", week_key: w, onsite: i < weeks.length - 1, online: i === weeks.length - 1 },
  // 나리 — 8주 넘게 결석(회원이 아니라 자격 중지는 없다)
  { person_id: "b", week_key: w, onsite: false, online: false },
]);
const book = buildBook({ weeks, groups, people, records });

describe("표 계산", () => {
  it("주 열 — 최근 주부터, 휴주는 빈 열(index null)로 끼운다", () => {
    const cols = weekColumns(book, SKIP);
    expect(cols.map((c) => c.week)).toEqual([...ALL].reverse());
    expect(cols.find((c) => c.week === "2026-10-04")?.index).toBeNull();
    expect(cols[0]).toEqual({ week: "2026-11-22", index: weeks.length - 1 });
  });
  it("최근 주 — 기록이 있는 마지막 주의 현장 · 온라인", () => {
    expect(latestWeek(book)).toEqual({ week: "2026-11-22", onsite: 0, online: 1 });
  });
  it("출석률 — 휴대폰 '출석' 칸과 같은 값, 세지 않는 사람은 '-'", () => {
    const [ga, nr, dn] = book.groups[0].rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    expect(attendRate(ga, false)).toBe(`${Math.round(((weeks.length - 1) / weeks.length) * 100)}%`);
    expect(attendRate(ga, true)).toBe("100%");
    expect(attendRate(nr, true)).toBe("0%");
    expect(attendRate(dn, true)).toBe("-");
  });
  it("온라인 비율 — 휴대폰 '온라인' 칸과 같은 식(온라인 ÷ 현장 + 온라인), 세지 않는 사람은 '-'", () => {
    const [ga, nr, dn] = book.groups[0].rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    expect(onlineRate(ga)).toBe(`${Math.round((1 / weeks.length) * 100)}%`);
    expect(onlineRate(nr)).toBe("0%");
    expect(onlineRate(dn)).toBe("-");
  });
});

describe("그리기", () => {
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

  it("현장 예배 출석부는 온라인도 결석, 현장 + 온라인은 '온' — 출석 횟수도 보는 출석부대로", async () => {
    await act(async () => root.render(<AttendanceWide book={book} skipped={SKIP} thisWeek="2026-11-22" />));
    const first = () => container.querySelector("[data-testid=attw-row]")!;
    const cell = () => first().querySelectorAll("td")[1]!;
    expect(cell().textContent).toBe("결");
    expect(first().querySelector("[data-testid=attw-count]")?.textContent).toBe(`${Math.round(((weeks.length - 1) / weeks.length) * 100)}%`);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-testid=attw-both]")!.click());
    expect(cell().textContent).toBe("온");
    expect(first().querySelector("[data-testid=attw-count]")?.textContent).toBe("100%");
  });

  it("휴주 열은 머리에 '휴주', 출석을 세지 않는 사람은 '-', 이름 찾기 · 목장 고르기 · 회원 자격 · 온라인 비율은 없다", async () => {
    await act(async () => root.render(<AttendanceWide book={book} skipped={SKIP} thisWeek="2026-11-22" />));
    expect(container.querySelector("[data-testid=attw-skip-head]")?.textContent).toContain("휴주");
    const rows = () => [...container.querySelectorAll("[data-testid=attw-row]")];
    expect(rows().find((r) => r.textContent?.includes("다온"))?.querySelector("[data-testid=attw-count]")?.textContent).toBe("-");
    const input = container.querySelector<HTMLInputElement>("[data-testid=attw-search]")!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(input, "나리");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toHaveLength(1);
    for (const id of ["attw-rule", "attw-share", "attw-member"]) expect(container.querySelector(`[data-testid=${id}]`)).toBeNull();
    expect(container.textContent).not.toMatch(/회원|요건/);
    // 온라인 비율 칸은 있되 노랗게 강조하지 않는다
    const online = container.querySelector("[data-testid=attw-online]")!;
    expect(online.className).not.toMatch(/sun/);
  });
});
