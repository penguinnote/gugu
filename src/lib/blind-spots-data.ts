import { summarizeBlindSpots, type BlindSpotPerson, type BlindSpotRow, type BlindSpotSummary } from "@/lib/blind-spots";
import { createClient } from "@/lib/supabase/server";

/**
 * 사각지대 판정 + 이름. 함수(`care_blind_spots`)가 범위를 정한다 — 목사님 전체, 리더 자기 목장.
 * 이름은 명단에서 붙인다. 명단의 RLS 범위가 함수의 범위와 같아서(목사님 전체 · 리더 자기 목장)
 * 이름이 비는 행은 없어야 하지만, 비면 그 행은 그리지 않는다.
 */
export async function loadBlindSpots(weekKey: string): Promise<BlindSpotSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("care_blind_spots", { p_week_key: weekKey });
  if (error) return null;
  const rows = (data ?? []) as BlindSpotRow[];
  if (rows.length === 0) return summarizeBlindSpots([]);

  const [personsRes, groupsRes] = await Promise.all([
    supabase.from("persons").select("id, name").in("id", rows.map((r) => r.person_id)),
    supabase.from("groups").select("id, name").in("id", [...new Set(rows.map((r) => r.group_id))]),
  ]);
  const nameById = new Map((personsRes.data ?? []).map((p) => [p.id, p.name]));
  const groupById = new Map((groupsRes.data ?? []).map((g) => [g.id, g.name]));

  const people: BlindSpotPerson[] = rows.flatMap((r) => {
    const name = nameById.get(r.person_id);
    return name ? [{ ...r, name, groupName: groupById.get(r.group_id) ?? null }] : [];
  });
  return summarizeBlindSpots(people);
}
