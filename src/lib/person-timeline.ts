/**
 * 사람 상세(L-4a / P-4a)의 기록 타임라인 — 한 주에 한 줄.
 *
 * 출석은 두 축을 나란히 쓴다("현장 예배 · 목장", "온라인 예배", 둘 다 없으면 "결석"). 사유가 있으면 그 아래. 컨택은 그 주 보고서를 쓴 리더가
 * 연락한 것이다(03 §3.2 — 작성자가 곧 접촉한 리더). 기도제목은 그 아래 한 줄.
 * 다른 목장에서 쓰인 기록(목사님만 본다)에는 그 목장 이름을 붙인다.
 */

import type { BlindSpotRow } from "@/lib/blind-spots";
import { CARE_STATUS_LABELS } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { shortWeek } from "@/lib/blind-spots";

export type TimelineRecord = {
  id: string;
  week_key: string;
  worship_attended: boolean;
  group_meeting_attended: boolean;
  one_on_one_contacted: boolean;
  prayer_request: string | null;
  /** 온라인 예배(2026-10-30) — 없으면 현장 */
  worship_online?: boolean;
  /** 온라인 · 불참 · 결석 사유 중 적힌 것 */
  reason?: string | null;
  authorName: string | null;
  /** 지금 소속과 다른 목장에서 쓰인 기록이면 그 목장 이름 */
  otherGroupName: string | null;
};

export function attendanceText(r: Pick<TimelineRecord, "worship_attended" | "group_meeting_attended" | "worship_online">): string {
  const worship = r.worship_attended ? (r.worship_online ? "온라인 예배" : "현장 예배") : null;
  const parts = [worship, r.group_meeting_attended ? "목장" : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "결석";
}

export function contactText(r: Pick<TimelineRecord, "one_on_one_contacted" | "authorName">): string | null {
  if (!r.one_on_one_contacted) return null;
  return r.authorName ? `개별 연락으로 교제 · ${r.authorName}` : "개별 연락으로 교제";
}

/**
 * 판정 요약 한 줄. care_blind_spots 의 그 사람 행이 없으면(판정 제외) care_status 로 말한다.
 * 기록 제외(opted_out)·휴면 같은 persons.status 는 여기서 말하지 않는다 — 리더 화면의 낙인이 된다.
 */
export function judgmentText(
  spot: BlindSpotRow | null,
  careStatus: Database["public"]["Enums"]["care_status"],
): string | null {
  if (!spot) {
    return careStatus === "active" || careStatus === "long_absent" ? null : `판정 제외 · ${CARE_STATUS_LABELS[careStatus]}`;
  }
  if (spot.state === "collecting") return "최근 4주 판정 · 집계 중";
  if (spot.state === "new") return "명단에 오른 지 4주가 안 되어 아직 판정하지 않습니다";
  const range = `${shortWeek(spot.window_start)} ~ ${shortWeek(spot.window_end)}`;
  const parts = [range];
  if (spot.absent_streak) parts.push("2주 연속 결석");
  parts.push(spot.meeting_gap ? "목장 불참 4주" : "목장 참석 있음");
  parts.push(spot.contact_gap ? "개별 연락으로 교제 없음" : `개별 연락으로 교제한 리더 ${spot.contact_leaders}명`);
  return parts.join(" · ");
}
