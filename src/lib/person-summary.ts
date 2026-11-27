import { addDays } from "@/lib/week";

/**
 * 사람별 기록 정리(2026-11-16) — AI 없이 코드로. 사람 화면 맨 위에 한눈에 보이는 정리.
 *
 *   출석 띠      최근 26주를 한 칸씩(옛날 → 요즘): 현장 · 온라인 · 결석 · 기록 없음 · 휴주 · 들어오기 전
 *   숫자         예배 출석률(최근 4주 · 6개월, 온라인도 출석) · 목장 모임 참석률 · 리더 연락 비율 — 모두 기록 있는 주 가운데
 *   연속 결석    마지막 예배 출석 뒤로 이어진 결석 주(기록 없는 주는 건너뛴다 — 출석부와 같은 규칙)
 *   사유 모음    결석 · 온라인 · 모임 불참 사유를 최근 것부터
 *   기도제목     기도제목만 최근 것부터 이어서
 * 해석 · 요약 문장은 만들지 않는다 — 기록에 있는 것만 모아 보인다. 보는 범위는 사람 화면과 같다(RLS 로 읽은 줄만 받는다).
 */

export const SUMMARY_WEEKS = 26;
export const RECENT_WEEKS = 4;

export type SummaryRecord = {
  week_key: string;
  worship_attended: boolean;
  worship_online: boolean;
  group_meeting_attended: boolean;
  one_on_one_contacted: boolean;
  prayer_request: string | null;
  online_reason: string | null;
  meeting_absent_reason: string | null;
  absent_reason: string | null;
};

export type BandMark = "onsite" | "online" | "absent" | "none" | "skipped" | "before";
export type Rate = { here: number; of: number };
export type ReasonKind = "결석" | "온라인" | "모임 불참";
export type PersonSummary = {
  band: { week: string; mark: BandMark }[];
  worshipRecent: Rate;
  worship: Rate;
  meeting: Rate;
  contact: Rate;
  absentRun: number;
  reasons: { week: string; kind: ReasonKind; text: string }[];
  prayers: { week: string; text: string }[];
};

/** 여러 주 기록 → 정리. upTo — 띠의 마지막 주(마감이 지난 주), joinedWeek — 들어온 주(그 앞은 '들어오기 전') */
export function buildPersonSummary(input: { records: SummaryRecord[]; upTo: string; joinedWeek: string | null; skipped: Iterable<string>; weeks?: number }): PersonSummary {
  const n = input.weeks ?? SUMMARY_WEEKS;
  const skipped = new Set(input.skipped);
  const byWeek = new Map(input.records.map((r) => [r.week_key, r]));
  const from = addDays(input.upTo, -7 * (n - 1));
  const band: PersonSummary["band"] = [];
  for (let w = from; w <= input.upTo; w = addDays(w, 7)) {
    const r = byWeek.get(w);
    const mark: BandMark = r
      ? !r.worship_attended
        ? "absent"
        : r.worship_online
          ? "online"
          : "onsite"
      : skipped.has(w)
        ? "skipped"
        : input.joinedWeek && w < input.joinedWeek
          ? "before"
          : "none";
    band.push({ week: w, mark });
  }

  const inRange = input.records.filter((r) => r.week_key >= from && r.week_key <= input.upTo).sort((a, b) => (a.week_key < b.week_key ? 1 : -1));
  const recentFrom = addDays(input.upTo, -7 * (RECENT_WEEKS - 1));
  const rate = (list: SummaryRecord[], ok: (r: SummaryRecord) => boolean): Rate => ({ here: list.filter(ok).length, of: list.length });
  // 결석한 주는 목장 모임 참석률 · 연락 비율에도 들어간다(기록 있는 주 전부)
  let absentRun = 0;
  for (const r of inRange) {
    if (r.worship_attended) break;
    absentRun++;
  }
  const reasons: PersonSummary["reasons"] = [];
  for (const r of inRange) {
    const t = (s: string | null) => s?.trim() || null;
    if (!r.worship_attended && t(r.absent_reason)) reasons.push({ week: r.week_key, kind: "결석", text: t(r.absent_reason)! });
    if (r.worship_online && t(r.online_reason)) reasons.push({ week: r.week_key, kind: "온라인", text: t(r.online_reason)! });
    if (!r.group_meeting_attended && t(r.meeting_absent_reason)) reasons.push({ week: r.week_key, kind: "모임 불참", text: t(r.meeting_absent_reason)! });
  }
  return {
    band,
    worshipRecent: rate(
      inRange.filter((r) => r.week_key >= recentFrom),
      (r) => r.worship_attended,
    ),
    worship: rate(inRange, (r) => r.worship_attended),
    meeting: rate(inRange, (r) => r.group_meeting_attended),
    contact: rate(inRange, (r) => r.one_on_one_contacted),
    absentRun,
    reasons,
    prayers: inRange.flatMap((r) => (r.prayer_request?.trim() ? [{ week: r.week_key, text: r.prayer_request.trim() }] : [])),
  };
}

/** 3/4 → '75%', 기록이 없으면 '-' */
export const rateText = (r: Rate) => (r.of === 0 ? "-" : `${Math.round((r.here / r.of) * 100)}%`);
