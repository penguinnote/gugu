import { describe, expect, it } from "vitest";

import { formatUntilDeadline } from "@/lib/week";

/**
 * 홈 카운트다운 문구 — 마감은 수요일 00:00 KST(화요일 23:59 까지). '지금' 은 호출자가 넘긴다(06 §4.5).
 */
describe("formatUntilDeadline", () => {
  const week = "2026-09-27"; // 일요일. 마감 = 2026-09-30 00:00 KST
  it("마감 전", () => {
    expect(formatUntilDeadline(week, new Date("2026-09-27T21:00:00+09:00"))).toBe("제출까지 2일 3시간");
    expect(formatUntilDeadline(week, new Date("2026-09-29T10:00:00+09:00"))).toBe("제출까지 14시간");
    expect(formatUntilDeadline(week, new Date("2026-09-29T23:30:00+09:00"))).toBe("제출까지 1시간 미만");
  });
  it("마감 후", () => {
    expect(formatUntilDeadline(week, new Date("2026-09-30T00:00:00+09:00"))).toBe("이번 주 마감됨");
    expect(formatUntilDeadline(week, new Date("2026-10-02T12:00:00+09:00"))).toBe("이번 주 마감됨");
  });
});
