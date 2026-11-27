import { describe, expect, it } from "vitest";

import { sortBoard } from "@/app/(tabs)/records/records-view";

/** 기록 탭 순서(2026-11-11) — 연속이 긴 순, 같으면 열매가 많은 순, 그것도 같으면 목장 번호 순 */
describe("기록 탭 순서", () => {
  it("연속 → 열매 → 번호", () => {
    const row = (number: number, streak: number, berries: number) => ({ group_id: `g${number}`, number, name: `목장${number}`, streak, berries });
    const out = sortBoard([row(1, 2, 100), row(2, 5, 50), row(3, 2, 300), row(4, 0, 900), row(5, 2, 100)]);
    expect(out.map((r) => r.number)).toEqual([2, 3, 1, 5, 4]);
  });
});
