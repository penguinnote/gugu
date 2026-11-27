import "server-only";

import { absenceStreaks, type AbsenceStreak, type StreakRecord } from "@/lib/absence-streaks";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/week";

/** 연속 결석을 볼 주 수 — 이보다 길면 '12주 이상' 이 아니라 12주로 센다(충분히 길다) */
const WINDOW = 12;

/**
 * 목사님 화면의 연속 결석(2026-11-17) — 목사님 세션으로 읽는다(RLS: 목사님은 전체). 제출된 보고서의 기록만.
 * 기록은 사람 × 주라 한 번에 1000줄을 넘을 수 있어 나눠 읽는다. 못 읽으면 null(칸을 그리지 않는다)
 */
export async function loadAbsenceStreaks(weekKey: string): Promise<AbsenceStreak[] | null> {
  const supabase = await createClient();
  const from = addDays(weekKey, -7 * (WINDOW - 1));
  const [peopleRes, groupsRes, reportsRes] = await Promise.all([
    supabase.from("persons").select("id, name, group_id, care_status, status, attendance_off, report_hidden"),
    supabase.from("groups").select("id, name").eq("status", "active"),
    supabase.from("reports").select("id").gte("week_key", from).lte("week_key", weekKey).not("submitted_at", "is", null),
  ]);
  if (peopleRes.error || groupsRes.error || reportsRes.error) return null;
  const ids = (reportsRes.data ?? []).map((r) => r.id);
  const records: StreakRecord[] = [];
  const PAGE = 1000;
  for (let at = 0; ids.length > 0 && at < 100000; at += PAGE) {
    const { data, error } = await supabase
      .from("weekly_records_visible")
      .select("person_id, week_key, worship_attended, one_on_one_contacted")
      .in("report_id", ids)
      .order("week_key")
      .order("person_id")
      .range(at, at + PAGE - 1);
    if (error) return null;
    for (const r of data ?? []) {
      if (r.person_id && r.week_key) records.push({ person_id: r.person_id, week_key: r.week_key, worship_attended: !!r.worship_attended, one_on_one_contacted: !!r.one_on_one_contacted });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return absenceStreaks(peopleRes.data ?? [], groupsRes.data ?? [], records);
}
