/**
 * 돌봄 사각지대 — `care_blind_spots()` 결과를 화면용으로 정리한다(03 §3.1).
 *
 * 함수는 사람마다 한 줄을 판정 값만으로 돌려준다. 이름은 화면이 명단(persons)에서 붙인다 —
 * 함수가 돌려주는 것을 숫자·날짜·참거짓으로 묶어 두기 위해서다.
 *
 * 기준(2026-10-30 v2) — 컨택이 있었어도, 예배를 드렸어도 사각지대다.
 *   2주 연속 결석    최근 두 주(휴주 제외) 모두 결석
 *   4주 목장 불참    4주 동안 목장 모임 참석 0회 — 온라인 예배도 불참으로 센다
 * 순서: 둘이 겹친 사람(최우선) → 연속 결석 → 목장 불참. 같은 묶음 안은 함수의 순서
 * (목장 번호 → 역할) 그대로. 색으로 경고하지 않는다 — 사실을 적는 것으로 충분하다.
 */

import type { Database } from "@/lib/supabase/database.types";
import { formatWeekLabel } from "@/lib/week";

export type BlindSpotRow = Database["public"]["Functions"]["care_blind_spots"]["Returns"][number];
export type BlindSpotPerson = BlindSpotRow & { name: string; groupName: string | null };

export type BlindSpotSummary =
  | {
      state: "collecting";
      windowStart: string | null;
      windowEnd: string | null;
      /** 집계 중 기간의 출발점 — 명단 도입 때 확인이 필요하다고 표시된 사람(04 v0.12) */
      needsCheck: BlindSpotPerson[];
    }
  | {
      state: "judged";
      windowStart: string | null;
      windowEnd: string | null;
      /** 사각지대 = 2주 연속 결석 ∪ 4주 목장 불참. 최우선이 앞 */
      spots: BlindSpotPerson[];
      priority: number;
      /** 단독 연결 — 공백은 아니지만 컨택을 기록한 리더가 한 명뿐 */
      singleLinks: BlindSpotPerson[];
      /** 판정한 사람 수. 0 이면 '없다' 고 말할 수 없다 — 전원 신규일 수 있다 */
      judged: number;
      newcomers: number;
    };

function rank(p: BlindSpotRow): number {
  if (p.absent_streak && p.meeting_gap) return 0;
  if (p.absent_streak) return 1;
  return 2;
}

/** 사각지대인가 — 판정한 사람만 값이 있다 */
export function isBlindSpot(p: BlindSpotRow): boolean {
  return p.state === "judged" && (!!p.absent_streak || !!p.meeting_gap);
}

export function summarizeBlindSpots(people: BlindSpotPerson[]): BlindSpotSummary {
  const first = people[0];
  const windowStart = first?.window_start ?? null;
  const windowEnd = first?.window_end ?? null;

  // 집계 중은 전원에게 같은 값이다 — 창이 데이터 시작보다 앞선다.
  if (people.some((p) => p.state === "collecting")) {
    return { state: "collecting", windowStart, windowEnd, needsCheck: people.filter((p) => p.needs_check) };
  }

  const judged = people.filter((p) => p.state === "judged");
  const spots = judged
    .filter(isBlindSpot)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);

  return {
    state: "judged",
    windowStart,
    windowEnd,
    spots,
    priority: spots.filter((p) => p.absent_streak && p.meeting_gap).length,
    singleLinks: judged.filter((p) => !p.contact_gap && p.contact_leaders === 1),
    judged: judged.length,
    newcomers: people.filter((p) => p.state === "new").length,
  };
}

/** 어느 공백인가 — 한 단어로 */
export function blindSpotTag(p: BlindSpotRow): string {
  if (p.absent_streak && p.meeting_gap) return "결석 · 목장 불참";
  if (p.absent_streak) return "2주 연속 결석";
  return "4주 목장 불참";
}

/** 마지막으로 있었던 일 — 창 밖의 기록까지 본 값이다. "근거가 언제였나" 만 알려준다 */
export function lastSeenLine(p: BlindSpotRow): string {
  const parts: string[] = [];
  if (p.absent_streak) parts.push(p.last_worship_week ? `마지막 예배 ${shortWeek(p.last_worship_week)}` : "예배 기록 없음");
  if (p.meeting_gap) parts.push(p.last_meeting_week ? `마지막 목장 ${shortWeek(p.last_meeting_week)}` : "목장 참석 기록 없음");
  return parts.join(" · ");
}

/** "9월 13일 (주일)" → "9월 13일" */
export function shortWeek(weekKey: string): string {
  return formatWeekLabel(weekKey).replace(/\s*\(.*\)$/, "");
}

/**
 * '돌봄 사각지대' 화면에 이름이 뜨는 사람(2026-11-11 보고서 순서용) — 집계 중이면 확인 필요로 표시된 사람,
 * 판정이 났으면 사각지대. 화면(BlindSpotSection)과 같은 목록이어야 순서가 화면과 맞는다.
 */
export function listedBlindSpotIds(rows: BlindSpotRow[]): Set<string> {
  const s = summarizeBlindSpots(rows.map((r) => ({ ...r, name: "", groupName: null })));
  return new Set((s.state === "collecting" ? s.needsCheck : s.spots).map((p) => p.person_id));
}
