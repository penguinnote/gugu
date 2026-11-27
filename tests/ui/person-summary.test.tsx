// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildPersonSummary, rateText, type SummaryRecord } from "@/lib/person-summary";

const rec = (week_key: string, over: Partial<SummaryRecord> = {}): SummaryRecord => ({
  week_key,
  worship_attended: true,
  worship_online: false,
  group_meeting_attended: true,
  one_on_one_contacted: false,
  prayer_request: null,
  online_reason: null,
  meeting_absent_reason: null,
  absent_reason: null,
  ...over,
});

describe("사람별 기록 정리", () => {
  // 6주 띠: 10/18 · 10/25(휴주) · 11/1(기록 없음) · 11/8(온라인) · 11/15(결석) · 11/22(결석)
  const s = buildPersonSummary({
    weeks: 6,
    upTo: "2026-11-22",
    joinedWeek: "2026-10-18",
    skipped: ["2026-10-25"],
    records: [
      rec("2026-10-18", { prayer_request: " 시험 잘 보도록 ", one_on_one_contacted: true }),
      rec("2026-11-08", { worship_online: true, online_reason: "출장", group_meeting_attended: false, meeting_absent_reason: "야근", prayer_request: "회사 적응" }),
      rec("2026-11-15", { worship_attended: false, group_meeting_attended: false, absent_reason: "감기" }),
      rec("2026-11-22", { worship_attended: false, group_meeting_attended: false, absent_reason: "  " }),
    ],
  });

  it("출석 띠 — 옛날에서 요즘으로, 현장 · 휴주 · 기록 없음 · 온라인 · 결석 ★", () => {
    expect(s.band.map((b) => b.mark)).toEqual(["onsite", "skipped", "none", "online", "absent", "absent"]);
    expect(s.band[0].week).toBe("2026-10-18");
  });

  it("들어오기 전 주는 따로", () => {
    const t = buildPersonSummary({ weeks: 3, upTo: "2026-11-22", joinedWeek: "2026-11-15", skipped: [], records: [rec("2026-11-22")] });
    expect(t.band.map((b) => b.mark)).toEqual(["before", "none", "onsite"]);
  });

  it("출석률은 기록 있는 주 가운데(온라인도 출석) · 최근 4주 · 모임 · 연락", () => {
    expect(s.worship).toEqual({ here: 2, of: 4 });
    expect(s.worshipRecent).toEqual({ here: 1, of: 3 }); // 11/1 ~ 11/22 의 기록 셋
    expect(s.meeting).toEqual({ here: 1, of: 4 });
    expect(s.contact).toEqual({ here: 1, of: 4 });
    expect([rateText(s.worship), rateText({ here: 0, of: 0 })]).toEqual(["50%", "-"]);
  });

  it("연속 결석은 마지막 예배 출석 뒤의 결석 주(기록 없는 주는 건너뛴다)", () => {
    expect(s.absentRun).toBe(2);
    const t = buildPersonSummary({ weeks: 4, upTo: "2026-11-22", joinedWeek: null, skipped: [], records: [rec("2026-11-01", { worship_attended: false }), rec("2026-11-22", { worship_attended: false })] });
    expect(t.absentRun).toBe(2);
  });

  it("사유 모음 · 기도제목은 최근 것부터, 빈 글은 뺀다", () => {
    expect(s.reasons).toEqual([
      { week: "2026-11-15", kind: "결석", text: "감기" },
      { week: "2026-11-08", kind: "온라인", text: "출장" },
      { week: "2026-11-08", kind: "모임 불참", text: "야근" },
    ]);
    expect(s.prayers).toEqual([
      { week: "2026-11-08", text: "회사 적응" },
      { week: "2026-10-18", text: "시험 잘 보도록" },
    ]);
  });
});
