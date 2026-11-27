// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  answerAbsences,
  answerAppInfo,
  APP_TOPICS,
  answerAttendanceCount,
  answerBlindSpots,
  answerGroupWeek,
  answerPeople,
  answerPerson,
  answerPrayers,
  answerWeekStatus,
  weekFrom,
  type AnswerPerson,
  type AnswerRecord,
  type AnswerSpot,
} from "@/lib/ai/chat-answer";

// 가짜 이름만 쓴다
const G = [{ id: "g1", name: "가온" }, { id: "g2", name: "나래" }, { id: "g3", name: "다솜" }];
const person = (id: string, name: string, group_id: string, role: "head" | "sub" | "member" = "member", care_status = "active"): AnswerPerson => ({
  id, name, group_id, group_role: role === "member" ? "member" : "leader", is_group_head: role === "head", care_status, status: "active",
});
const P: AnswerPerson[] = [
  person("d", "박구름", "g1"),
  person("b", "최별", "g1", "sub"),
  person("e", "이바다", "g1", "member", "military"),
  person("a", "김하늘", "g1", "head"),
  person("f", "윤솔", "g1"),
  person("k", "강이슬", "g2", "head"),
  person("s", "서다온", "g2"),
];
const rec = (person_id: string, week_key: string, over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  person_id, week_key, worship_attended: true, worship_online: false, group_meeting_attended: true, one_on_one_contacted: false, prayer_request: null, group_id_at_write: P.find((p) => p.id === person_id)?.group_id ?? null, ...over,
});
const personOf = (id: string) => P.find((p) => p.id === id) ?? null;
const groupName = (id: string | null) => G.find((g) => g.id === id)?.name ?? "";
const spot = (over: Partial<AnswerSpot["row"]> = {}): AnswerSpot["row"] =>
  ({ state: "judged", absent_streak: false, meeting_gap: false, last_worship_week: "", last_meeting_week: "", needs_check: false, contact_gap: false, contact_leaders: 0, ...over }) as AnswerSpot["row"];
const absent = { worship_attended: false, group_meeting_attended: false };
const W = "2026-11-15";

describe("구구 챗봇 — 앱이 쓰는 답(AI 로 기록을 보내지 않는다)", () => {
  it("명단 — '가온 목장 5명:' 아래 목자 · 목동 · 양 한 줄씩, 재적이 아니면 괄호에 판정 태그 ★", () => {
    expect(answerPeople(P, G).split("\n")).toEqual([
      "가온 목장 5명:",
      "",
      "* 목자: 김하늘",
      "* 목동: 최별",
      "* 양 3명: 박구름 / 윤솔 / 이바다(군 복무)",
      "",
      "나래 목장 2명:",
      "",
      "* 목자: 강이슬",
      "* 양 1명: 서다온",
    ]);
    // 양이 없으면 양 줄이 없다
    expect(answerPeople([P[3], P[1]], G).split("\n")).toEqual(["가온 목장 2명:", "", "* 목자: 김하늘", "* 목동: 최별"]);
    expect(answerPeople([], G)).toBe("볼 수 있는 사람이 없어요.");
  });

  it("한 사람 — 횟수 한 줄 + 주마다 한 줄(쉬는 주 · 개별 연락), 퍼센트 · '휴주' · 가운뎃점은 쓰지 않는다 ★", () => {
    const weeks = ["2026-11-15", "2026-11-08", "2026-11-01", "2026-10-25"];
    const recs = [
      rec("a", "2026-11-15", { prayer_request: "시험 잘 볼 수 있도록", one_on_one_contacted: true }),
      rec("a", "2026-11-08", { worship_online: true, group_meeting_attended: false }),
      rec("a", "2026-11-01", absent),
    ];
    const out = answerPerson(P[3], recs, weeks, new Set(["2026-10-25"]));
    expect(out.split("\n")).toEqual([
      "김하늘 최근 4주:",
      "",
      "* 기록 3주 중 예배 2번(온라인 1번), 목장 모임 1번, 개별 연락 1번",
      "",
      "주마다:",
      "",
      "* 11월 15일: 현장 예배, 목장 참석, 개별 연락",
      "  시험 잘 볼 수 있도록",
      "* 11월 8일: 온라인 예배, 목장 불참",
      "* 11월 1일: 예배 결석, 목장 불참",
      "* 10월 25일: 쉬는 주",
    ]);
    expect(out).not.toMatch(/%|휴주|·/);
    // 기록이 한 주도 없으면 거기서 끝 — 주마다 '기록 없음' 을 붙이지 않는다(2026-11-18)
    expect(answerPerson(P[3], [], weeks, new Set(["2026-10-25"]))).toBe("김하늘 최근 4주 기록이 없어요.");
  });

  it("목장 한 주 — 제목에 목장보고서 · 'N명 중' · 목자 → 목동 → 양 순 · 특이사항, 없으면 없다고 ★", () => {
    const records = [
      rec("e", W, absent),
      rec("d", W, { worship_online: true, group_meeting_attended: false, prayer_request: "가족 건강" }),
      rec("b", W),
      rec("a", W, { prayer_request: "취업 준비 잘 할 수 있도록" }),
    ];
    const report = { note: "카페에서 모임", submitted_at: "x", is_late: true, no_meeting: false };
    expect(answerGroupWeek({ group: G[0], week: W, report, records, personOf }).split("\n")).toEqual([
      "11월 15일 가온 목장보고서(늦게 냄):",
      "",
      "* 4명 중 예배 3명(온라인 1명), 목장 모임 2명",
      "",
      "사람마다:",
      "",
      "* 김하늘: 현장 예배, 목장 참석",
      "  취업 준비 잘 할 수 있도록",
      "* 최별: 현장 예배, 목장 참석",
      "* 박구름: 온라인 예배, 목장 불참",
      "  가족 건강",
      "* 이바다: 예배 결석, 목장 불참",
      "",
      "특이사항:",
      "",
      "* 카페에서 모임",
    ]);
    // 목장 모임이 없는 주 — 목장 모임 수를 뺀다
    expect(answerGroupWeek({ group: G[0], week: W, report: { ...report, note: null, no_meeting: true }, records: [rec("a", W)], personOf }).split("\n")).toEqual([
      "11월 15일 가온 목장보고서(늦게 냄, 목장 모임 없음):",
      "",
      "* 1명 중 예배 1명",
      "",
      "사람마다:",
      "",
      "* 김하늘: 현장 예배",
    ]);
    expect(answerGroupWeek({ group: G[1], week: W, report: null, records: [], personOf })).toBe("11월 15일 나래 목장보고서가 아직 없어요.");
  });

  it("제출 현황 — 묶음마다 제목 줄 + 이름 줄, 모두 냈으면 한 줄, 쉬는 주 ★", () => {
    const four = [...G, { id: "g4", name: "라온" }];
    const reports = new Map([
      ["g1", { submitted_at: "x", is_late: true, no_meeting: false }],
      ["g4", { submitted_at: "x", is_late: false, no_meeting: false }],
    ]);
    const out = answerWeekStatus({ week: W, skipped: false, pastDeadline: true, groups: four, reports });
    expect(out.split("\n")).toEqual([
      "11월 15일 목장보고서(마감 지남):",
      "",
      "* 4곳 중 2곳 냄",
      "",
      "아직 안 낸 목장 2곳:",
      "",
      "* 나래 / 다솜",
      "",
      "늦게 낸 목장 1곳:",
      "",
      "* 가온",
    ]);
    const all = new Map(four.map((g) => [g.id, { submitted_at: "x", is_late: false, no_meeting: false }]));
    expect(answerWeekStatus({ week: W, skipped: false, pastDeadline: false, groups: four, reports: all }).split("\n")).toEqual(["11월 15일 목장보고서(마감 전):", "", "* 4곳 중 4곳 냄", "* 모든 목장이 냈어요."]);
    expect(answerWeekStatus({ week: W, skipped: true, pastDeadline: true, groups: four, reports })).toBe("11월 15일은 목장보고서를 쉬는 주예요.");
  });

  it("챙김이 필요한 양 — 사람마다 한 줄(태그 · 마지막 기록), 리더는 목장 제목 없이 · 목사님은 목장마다 묶어서 ★", () => {
    const rows: AnswerSpot[] = [
      { name: "박구름", group: "가온", row: spot({ absent_streak: true, meeting_gap: true, last_worship_week: "2026-10-25", last_meeting_week: "2026-10-11" }) },
      { name: "이바다", group: "가온", row: spot({ absent_streak: true, last_worship_week: "2026-11-01" }) },
      { name: "윤솔", group: "가온", row: spot({ meeting_gap: true, last_meeting_week: "2026-10-18" }) },
    ];
    expect(answerBlindSpots(rows, false).split("\n")).toEqual([
      "챙김이 필요한 양 3명:",
      "",
      "* 박구름: 2주 연속 결석, 4주 목장 불참 (마지막 예배 10월 25일, 마지막 목장 10월 11일)",
      "* 이바다: 2주 연속 결석 (마지막 예배 11월 1일)",
      "* 윤솔: 4주 목장 불참 (마지막 목장 10월 18일)",
      "",
      "예배를 2주 연속 빠졌거나 4주 동안 목장 모임에 한 번도 오지 않은 분이에요.",
    ]);
    expect(answerBlindSpots([], false)).toBe("지금 챙김이 필요한 양은 없어요.");
  });

  it("챙김이 필요한 양 — 순서는 화면과 같다(겹친 사람 · 연속 결석 · 목장 불참), 들지 않은 사람은 빼고, 모으는 중이면 확인 필요만 ★", () => {
    // care_blind_spots 가 돌려준 순서 그대로 넘긴다 — 목장 불참 · (해당 없음) · 연속 결석 · 겹침 · 연속 결석
    const rows: AnswerSpot[] = [
      { name: "윤솔", group: "가온", row: spot({ meeting_gap: true, last_meeting_week: "2026-10-18" }) },
      { name: "김하늘", group: "가온", row: spot() },
      { name: "이바다", group: "가온", row: spot({ absent_streak: true, last_worship_week: "2026-11-01" }) },
      { name: "박구름", group: "가온", row: spot({ absent_streak: true, meeting_gap: true, last_worship_week: "2026-10-25", last_meeting_week: "2026-10-11" }) },
      { name: "서다온", group: "나래", row: spot({ absent_streak: true, last_worship_week: "2026-10-25" }) },
    ];
    const out = answerBlindSpots(rows, true);
    expect(out.split("\n")).toEqual([
      "챙김이 필요한 양 4명",
      "",
      "가온 목장:",
      "",
      "* 박구름: 2주 연속 결석, 4주 목장 불참 (마지막 예배 10월 25일, 마지막 목장 10월 11일)",
      "* 이바다: 2주 연속 결석 (마지막 예배 11월 1일)",
      "* 윤솔: 4주 목장 불참 (마지막 목장 10월 18일)",
      "",
      "나래 목장:",
      "",
      "* 서다온: 2주 연속 결석 (마지막 예배 10월 25일)",
      "",
      "예배를 2주 연속 빠졌거나 4주 동안 목장 모임에 한 번도 오지 않은 분이에요.",
    ]);
    expect(out).not.toContain("·");
    // 기록을 모으는 중 — 확인이 필요하다고 표시된 사람만, 그 순서로
    const collecting: AnswerSpot[] = [
      { name: "정새벽", group: "가온", row: spot({ state: "collecting", needs_check: true }) },
      { name: "김하늘", group: "가온", row: spot({ state: "collecting" }) },
      { name: "한가람", group: "가온", row: spot({ state: "collecting", needs_check: true }) },
    ];
    expect(answerBlindSpots(collecting, false).split("\n").slice(0, 4)).toEqual(["챙김이 필요한 양 2명:", "", "* 정새벽: 확인 필요(기록 모으는 중)", "* 한가람: 확인 필요(기록 모으는 중)"]);
  });

  it("기도제목 모음 — 사람마다 한 줄, 목장 제목에 사람 수 · 목장이 하나뿐이면 제목 없이 ★", () => {
    const recs = [rec("d", W, { prayer_request: "가족 건강" }), rec("k", W, { prayer_request: "새 직장 적응" }), rec("a", W, { prayer_request: "취업 준비 잘 할 수 있도록" }), rec("b", W)];
    const groupOf = (r: AnswerRecord) => r.group_id_at_write ?? null;
    expect(answerPrayers(W, G, recs, personOf, groupOf).split("\n")).toEqual([
      "11월 15일 기도제목 3명",
      "",
      "가온 목장 2명:",
      "",
      "* 김하늘: 취업 준비 잘 할 수 있도록",
      "* 박구름: 가족 건강",
      "",
      "나래 목장 1명:",
      "",
      "* 강이슬: 새 직장 적응",
    ]);
    expect(answerPrayers(W, [G[0]], recs, personOf, groupOf).split("\n")).toEqual(["11월 15일 기도제목 2명:", "", "* 김하늘: 취업 준비 잘 할 수 있도록", "* 박구름: 가족 건강"]);
    // 목사님이 한 목장을 골라 물으면 첫 줄에 그 목장(2026-11-18)
    expect(answerPrayers(W, [G[0]], recs, personOf, groupOf, "가온").split("\n")[0]).toBe("11월 15일 가온 목장 기도제목 2명:");
    expect(answerPrayers(W, G, [rec("b", W)], personOf, groupOf)).toBe("11월 15일에 적힌 기도제목이 없어요.");
  });

  it("결석 — 지금 이어지는 결석과 그 밖을 나누고 첫 줄에 기간, 빈 묶음은 뺀다 ★", () => {
    const weeks = ["2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15"];
    const recs = [
      rec("d", "2026-10-25"), rec("d", "2026-11-01", absent), rec("d", "2026-11-08", absent), rec("d", "2026-11-15", absent),
      rec("e", "2026-11-08", absent), rec("e", "2026-11-15", absent),
      rec("f", "2026-10-25", absent), rec("f", "2026-11-01", absent), rec("f", "2026-11-15"),
      rec("s", "2026-11-01", absent), rec("s", "2026-11-15"),
      rec("a", "2026-11-15"),
    ];
    expect(answerAbsences({ weeks, people: P, records: recs, groupName, multi: false }).split("\n")).toEqual([
      "최근 4주 예배 결석 4명(10월 25일~11월 15일)",
      "",
      "지금 이어지는 결석 2명:",
      "",
      "* 박구름: 3주 연속",
      "* 이바다: 2주 연속",
      "",
      "그 밖에 빠진 주가 있는 분 2명:",
      "",
      "* 윤솔: 2번",
      "* 서다온: 1번",
    ]);
    const multi = answerAbsences({ weeks, people: P, records: recs, groupName, multi: true }).split("\n");
    expect(multi[4]).toBe("* 박구름(가온 목장): 3주 연속");
    expect(multi[10]).toBe("* 서다온(나래 목장): 1번");
    // 목사님이 한 목장을 골라 물으면 첫 줄에 그 목장, 사람 줄에는 목장을 붙이지 않는다(2026-11-18)
    const g1 = P.filter((p) => p.group_id === "g1");
    expect(answerAbsences({ weeks, people: g1, records: recs, groupName, multi: false, picked: "가온" }).split("\n").slice(0, 5)).toEqual([
      "최근 4주 가온 목장 예배 결석 3명(10월 25일~11월 15일)",
      "",
      "지금 이어지는 결석 2명:",
      "",
      "* 박구름: 3주 연속",
    ]);
    // 한쪽 묶음이 비면 그 묶음은 없다
    expect(answerAbsences({ weeks, people: P, records: [rec("s", "2026-11-01", absent), rec("s", "2026-11-15")], groupName, multi: false }).split("\n")).toEqual([
      "최근 4주 예배 결석 1명(10월 25일~11월 15일)",
      "",
      "그 밖에 빠진 주가 있는 분 1명:",
      "",
      "* 서다온: 1번",
    ]);
    expect(answerAbsences({ weeks, people: P, records: [rec("a", "2026-11-15")], groupName, multi: false })).toBe("최근 4주 동안 예배에 빠진 사람이 없어요.");
  });

  it("출석 인원 — 줄을 나누고, 기록이 없는 목장이 있으면 한 줄 더 ★", () => {
    const recs = [rec("a", W), rec("b", W, { worship_online: true }), rec("d", W, { worship_attended: false })];
    expect(answerAttendanceCount(W, recs, "청년부", ["나래", "다솜"]).split("\n")).toEqual([
      "11월 15일 청년부 예배:",
      "",
      "* 출석 2명, 결석 1명",
      "* 출석 중 현장 1명, 온라인 1명",
      "* 아직 기록이 없는 목장 2곳: 나래 / 다솜",
    ]);
    expect(answerAttendanceCount(W, recs, "가온 목장").split("\n")).toEqual(["11월 15일 가온 목장 예배:", "", "* 출석 2명, 결석 1명", "* 출석 중 현장 1명, 온라인 1명"]);
    expect(answerAttendanceCount(W, [], "청년부")).toBe("11월 15일 청년부 출석 기록이 아직 없어요.");
    expect(weekFrom("last", "2026-11-15", () => false)).toBe("2026-11-08");
  });

  it("앱 안내 — 챙김이 필요한 양은 기준 v2 그대로, 개별 연락은 판정에 쓰지 않는다, '휴주' 대신 '쉬는 주' ★", () => {
    const ctx = { thisWeek: "2026-11-15", rules: { start: 300, onTime: 80, late: 5, step: 4, max: 12, coupon: 300, perTerm: 2 } };
    const spotInfo = answerAppInfo("blind_spot", ctx);
    expect(spotInfo).not.toContain("켜면 다음부터 빠져요");
    expect(spotInfo).toContain("개별 연락으로 교제한 분도 이 기준에 들면 떠요.");
    expect(spotInfo).toContain("쉬는 주는 건너뛰어요");
    expect(answerAppInfo("contact", ctx)).toContain("판정에는 쓰지 않아요");
    expect(answerAppInfo("contact", ctx)).not.toContain("비율");
    expect(answerAppInfo("streak", ctx)).toContain("쉬는 주는 건너뛰고 이어져요.");
    // 늦게 정해도 쉬는 주 · 쉬는 주 선물(2026-11-26)
    expect(answerAppInfo("streak", ctx)).toContain("늦게 정해져도 쉬는 주로 쳐요");
    expect(answerAppInfo("streak", { ...ctx, rules: { ...ctx.rules, gift: 200 } })).toContain("선물로 열매 200개");
    expect(answerAppInfo("berries", ctx)).toContain("쉬는 주마다 선물로 200개");
    for (const t of APP_TOPICS) expect(answerAppInfo(t, ctx)).not.toMatch(/휴주|·/);
  });

  it("앱 규칙은 정해진 문장 — 마감은 주일이 지나고 화요일 밤, 이번 주 날짜 · 열매 숫자는 규칙 값 그대로 ★", () => {
    const rules = { start: 300, onTime: 80, late: 5, step: 4, max: 12, coupon: 300, perTerm: 2 };
    const d = answerAppInfo("deadline", { thisWeek: "2026-11-15", rules });
    expect(d).toContain("화요일 밤 11시 59분");
    expect(d).toContain("11월 17일 화요일");
    expect(d).not.toContain("다음 날");
    expect(answerAppInfo("berries", { thisWeek: "2026-11-15", rules })).toContain("한 주에 80개");
    for (const t of APP_TOPICS) expect(answerAppInfo(t, { thisWeek: "2026-11-15", rules }).length).toBeGreaterThan(20);
    expect(answerAppInfo("없는 것", { thisWeek: "2026-11-15", rules })).toContain("안내할 수 없어요");
  });
});
