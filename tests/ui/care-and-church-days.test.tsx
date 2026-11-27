import { describe, expect, it } from "vitest";

import { careCount, contactKind } from "@/lib/care-contacts";
import { churchDays, easterSunday, nextChurchDay, nthSunday } from "@/lib/church-days";

/**
 * 돌봄 수 · 교회 절기 디데이(2026-11-15)
 *   · 돌봄 = 사각지대 ∪ 지난 예배 결석 · 온라인(겹치면 한 번)
 *   · 절기는 50일 안으로 다가왔을 때만
 */
describe("돌봄 — 지난 예배 결석 · 온라인", () => {
  it("결석 · 온라인만 연락할 사람이다 — 현장 예배(목장만 불참 포함)는 아니다 ★", () => {
    expect(contactKind({ worship_attended: false, worship_online: false })).toBe("absent");
    expect(contactKind({ worship_attended: true, worship_online: true })).toBe("online");
    expect(contactKind({ worship_attended: true, worship_online: false })).toBeNull();
  });

  it("사각지대와 합쳐 사람 수로 — 둘 다에 있는 사람은 한 번 ★", () => {
    const contacts = { weekKey: "2026-11-08", people: [{ id: "a", name: "가", kind: "absent" as const }, { id: "b", name: "나", kind: "online" as const }] };
    expect(careCount(new Set(["a", "c"]), contacts)).toBe(3);
    expect(careCount(new Set(["c"]), null)).toBe(1);
    expect(careCount(new Set(), { weekKey: "2026-11-08", people: [] })).toBe(0);
  });
});

describe("교회 절기", () => {
  it("부활절 · n번째 주일 셈", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(nthSunday(2026, 11, 3)).toBe("2026-11-15");
    expect(nthSunday(2026, 7, 1)).toBe("2026-07-05");
    expect(nthSunday(2027, 11, 3)).toBe("2027-11-21");
  });

  it("한 해의 절기 다섯", () => {
    expect(churchDays(2026).map((d) => `${d.title} ${d.date}`)).toEqual([
      "부활절 2026-04-05",
      "맥추감사절 2026-07-05",
      "추수감사절 2026-11-15",
      "크리스마스 2026-12-25",
      "송구영신예배 2026-12-31",
    ]);
  });

  it("50일 안으로 다가온 가장 가까운 절기만 — 당일 포함, 해를 넘겨서도 ★", () => {
    expect(nextChurchDay("2026-11-15")?.title).toBe("추수감사절");
    expect(nextChurchDay("2026-11-16")?.title).toBe("크리스마스");
    expect(nextChurchDay("2026-11-05")?.title).toBe("추수감사절");
    // 크리스마스 50일 전 = 11월 5일. 9월에는 추수감사절(11/15)도 50일 밖
    expect(nextChurchDay("2026-09-20")).toBeNull();
    expect(nextChurchDay("2026-09-26")?.title).toBe("추수감사절");
    // 1월에는 부활절(2027-03-28)이 50일 밖, 2월 6일부터 안
    expect(nextChurchDay("2027-01-10")).toBeNull();
    expect(nextChurchDay("2027-02-06")?.title).toBe("부활절");
  });
});
