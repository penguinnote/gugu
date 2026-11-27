import { loadBlindSpots } from "@/lib/blind-spots-data";
import type { BlindSpotSummary } from "@/lib/blind-spots";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/week";

/**
 * 목사님 주간 정리 v1(2026-11-05) — AI 없이 코드만. 제출 현황 화면(/pastor) 아래에 붙는 세 가지.
 *   사각지대 변화  지난주 판정과 견줘 새로 든 사람 · 벗어난 사람 수
 *   기도제목       그 주 기도제목 수 · 처음 낸 사람 수 · 연속 4주 이상 낸 사람(같은 내용인지는 보지 않는다)
 *   특이사항       목장 보고서의 특이사항(reports.note)
 * 범위는 DB 가 정한다(prayer_streaks · care_blind_spots · reports RLS) — 이 화면은 목사님만 연다.
 */

/** 연속 몇 주부터 따로 모아 보여 주나 */
export const PRAYER_LONG_WEEKS = 4;

export type BlindSpotChange = { added: Set<string>; left: number };

/** 지난주 판정과 견준 변화. 두 주 모두 판정 상태일 때만 — 집계 중이면 견줄 것이 없다 */
export async function loadBlindSpotChange(current: BlindSpotSummary | null): Promise<BlindSpotChange | null> {
  if (!current || current.state !== "judged" || !current.windowEnd) return null;
  const prev = await loadBlindSpots(addDays(current.windowEnd, -7));
  if (!prev || prev.state !== "judged" || prev.judged === 0) return null;
  const before = new Set(prev.spots.map((p) => p.person_id));
  const now = new Set(current.spots.map((p) => p.person_id));
  return {
    added: new Set([...now].filter((id) => !before.has(id))),
    left: [...before].filter((id) => !now.has(id)).length,
  };
}

type PrayerRow = Database["public"]["Functions"]["prayer_streaks"]["Returns"][number];

export type PrayerLong = { personId: string; name: string; groupName: string | null; weeks: number; text: string };
export type PrayerFlow = { total: number; firstEver: number; long: PrayerLong[] };

export async function loadPrayerFlow(weekKey: string): Promise<PrayerFlow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prayer_streaks", { p_week_key: weekKey });
  if (error) return null;
  const rows = (data ?? []) as PrayerRow[];
  const longRows = rows.filter((r) => r.weeks >= PRAYER_LONG_WEEKS);
  const [personsRes, groupsRes] = longRows.length
    ? await Promise.all([
        supabase.from("persons").select("id, name").in("id", longRows.map((r) => r.person_id)),
        supabase.from("groups").select("id, name").in("id", [...new Set(longRows.map((r) => r.group_id))]),
      ])
    : [{ data: [] }, { data: [] }];
  const nameById = new Map((personsRes.data ?? []).map((p) => [p.id, p.name]));
  const groupById = new Map((groupsRes.data ?? []).map((g) => [g.id, g.name]));
  return {
    total: rows.length,
    firstEver: rows.filter((r) => r.first_ever).length,
    long: longRows.flatMap((r) => {
      const name = nameById.get(r.person_id);
      return name ? [{ personId: r.person_id, name, groupName: groupById.get(r.group_id) ?? null, weeks: r.weeks, text: r.prayer_request }] : [];
    }),
  };
}

export type GroupNote = { groupName: string; note: string };

/** 그 주에 제출된 보고서의 특이사항 — groups 순서(목장 번호 순)대로 */
export async function loadGroupNotes(weekKey: string, groups: { id: string; name: string }[]): Promise<GroupNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("group_id, note")
    .eq("week_key", weekKey)
    .not("submitted_at", "is", null)
    .not("note", "is", null);
  const noteByGroup = new Map((data ?? []).map((r) => [r.group_id, r.note?.trim() ?? ""]));
  return groups.flatMap((g) => {
    const note = noteByGroup.get(g.id);
    return note ? [{ groupName: g.name, note }] : [];
  });
}
