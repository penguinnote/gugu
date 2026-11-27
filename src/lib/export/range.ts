import { addDays, isWeekKey, weeksBetween } from "@/lib/week";

/**
 * 내보내기 범위 (Step 10, 02 §3.3) — 화면·Excel 경로·인쇄 화면이 같은 규칙을 쓴다. DB 의 log_export() 가 한 번
 * 더 본다(주차·시작 ≤ 끝·52주·운영 목장).
 *
 *   쿼리   ?from=YYYY-MM-DD&to=YYYY-MM-DD&groups=all | id,id,…
 *   groups=all 은 '전체 목장' 을 **명시적으로 고른 것**이다 — 기본값이 아니다. 아무것도 고르지 않으면 거부.
 *   끝은 이번 주를 넘지 못한다 — 앞으로의 주는 내보낼 것이 없다.
 */

export const MAX_EXPORT_WEEKS = 52;

export type ExportRange = {
  from: string;
  to: string;
  /** null = 전체 목장(명시적으로 고름) */
  groupIds: string[] | null;
  weeks: string[];
};

export type RangeResult = { ok: true; range: ExportRange } | { ok: false; message: string };

type Params = { from?: string | string[]; to?: string | string[]; groups?: string | string[] };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function weeksIn(from: string, to: string): string[] {
  const n = weeksBetween(from, to) + 1;
  return Array.from({ length: n }, (_, i) => addDays(from, 7 * i));
}

export function parseExportParams(params: Params, thisWeek: string, activeGroupIds: readonly string[]): RangeResult {
  const from = one(params.from);
  const to = one(params.to);
  const groups = one(params.groups);

  if (!from || !to) return { ok: false, message: "기간을 고르세요." };
  if (!isWeekKey(from) || !isWeekKey(to)) return { ok: false, message: "기간은 주차로 고릅니다." };
  if (from > to) return { ok: false, message: "시작이 끝보다 늦습니다." };
  if (to > thisWeek) return { ok: false, message: "이번 주보다 뒤는 고를 수 없습니다." };
  if (weeksBetween(from, to) + 1 > MAX_EXPORT_WEEKS) return { ok: false, message: `한 번에 ${MAX_EXPORT_WEEKS}주까지 내보냅니다.` };

  if (!groups) return { ok: false, message: "목장을 고르세요." };
  let groupIds: string[] | null;
  if (groups === "all") {
    groupIds = null;
  } else {
    groupIds = [...new Set(groups.split(",").map((s) => s.trim()).filter(Boolean))];
    if (groupIds.length === 0) return { ok: false, message: "목장을 고르세요." };
    const known = new Set(activeGroupIds);
    if (groupIds.some((g) => !known.has(g))) return { ok: false, message: "운영 중이 아닌 목장이 섞여 있습니다." };
  }

  return { ok: true, range: { from, to, groupIds, weeks: weeksIn(from, to) } };
}

export function exportQuery(range: { from: string; to: string; groupIds: string[] | null }): string {
  const q = new URLSearchParams({ from: range.from, to: range.to, groups: range.groupIds ? range.groupIds.join(",") : "all" });
  return q.toString();
}

/** 기간 버튼 둘 — 이번 주 / 최근 4주. 직접 지정은 화면이 고른다. */
export function presetRange(preset: "this" | "last4", thisWeek: string): { from: string; to: string } {
  return preset === "this" ? { from: thisWeek, to: thisWeek } : { from: addDays(thisWeek, -21), to: thisWeek };
}

/** "2026년 9월 14일 ~ 10월 4일 (4주)" — 같은 해면 끝 연도를 생략. */
export function rangeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const n = weeksBetween(from, to) + 1;
  const head = `${fy}년 ${fm}월 ${fd}일`;
  if (from === to) return `${head} (1주)`;
  return `${head} ~ ${fy === ty ? "" : `${ty}년 `}${tm}월 ${td}일 (${n}주)`;
}
