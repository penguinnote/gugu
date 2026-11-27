import { describe, expect, it } from "vitest";

import { freshShotAt } from "@/lib/room-shot";

/** 집 안 사진 — 2026-11-10 13시(KST) 전에 찍힌 것은 예전 방 모습이라 없는 것으로 친다 */
describe("집 안 사진이 지금 방 모습인가", () => {
  it("기준 전 · 없음은 null, 기준 뒤는 시각", () => {
    expect(freshShotAt(null)).toBeNull();
    expect(freshShotAt("2026-10-24T10:00:00+00:00")).toBeNull();
    expect(freshShotAt("2026-11-10T03:59:00+00:00")).toBeNull();
    expect(freshShotAt("2026-11-10T04:00:00+00:00")).toBe(Date.parse("2026-11-10T04:00:00Z"));
    expect(freshShotAt("2026-11-11T09:00:00+00:00")).toBe(Date.parse("2026-11-11T09:00:00Z"));
  });
});
