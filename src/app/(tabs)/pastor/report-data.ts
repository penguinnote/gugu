import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import { weeksBetween } from "@/lib/week";

type Client = Awaited<ReturnType<typeof createClient>>;
type Stamp = Database["public"]["Enums"]["report_stamp"];
export type ReportRecord = Database["public"]["Views"]["weekly_records_visible"]["Row"];
export type ReportPerson = { id: string; name: string; group_role: "leader" | "member" };

/**
 * 목사님이 보고서 한 건을 여는 일(2026-11-27 상세 화면에서 떼어 냈다) — 상세(/pastor/reports/[group])와 넓은 화면 제출 현황(?g=)이 같이 쓴다.
 *   읽음  여기서, 한 번(mark_report_read). 실패해도 화면은 그린다 — 흔적이 안 남는 것이 화면이 안 열리는 것보다 낫다
 *   명단  그 주 명단 — 이 보고서에 기록된 사람(2026-11-05). 지금 명단으로 그리면 그 뒤 들어온 사람이 '미입력' 으로 나온다
 *   지난  사람마다 가장 최근의 지난 기도제목(몇 주 전)
 */
export async function loadReportBody(supabase: Client, reportId: string, groupId: string, weekKey: string) {
  const marked = await supabase.rpc("mark_report_read", { p_report_id: reportId });
  const [rowsRes, priorRes, reviewRes] = await Promise.all([
    supabase.from("weekly_records_visible").select("*").eq("report_id", reportId),
    supabase
      .from("weekly_records_visible")
      .select("person_id, week_key, prayer_request")
      .eq("group_id_at_write", groupId)
      .lt("week_key", weekKey)
      .not("prayer_request", "is", null)
      .order("week_key", { ascending: false })
      .limit(400),
    supabase.from("report_reviews").select("stamp, note").eq("report_id", reportId).maybeSingle(),
  ]);
  const recordedIds = (rowsRes.data ?? []).map((r) => r.person_id).filter((id): id is string => !!id);
  const personsRes = recordedIds.length
    ? await supabase.from("persons").select("id, name, group_role").in("id", recordedIds)
    : { data: [] as ReportPerson[] };
  const collator = new Intl.Collator("ko");
  const persons = ((personsRes.data ?? []) as ReportPerson[]).sort((a, b) => {
    if (a.group_role !== b.group_role) return a.group_role === "leader" ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
  const rowByPerson = new Map<string, ReportRecord>((rowsRes.data ?? []).map((r) => [r.person_id ?? "", r]));
  const prev = new Map<string, { text: string; weeksAgo: number }>();
  for (const r of priorRes.data ?? []) {
    if (!r.person_id || !r.week_key || !r.prayer_request || prev.has(r.person_id)) continue;
    prev.set(r.person_id, { text: r.prayer_request, weeksAgo: weeksBetween(r.week_key, weekKey) });
  }
  const review = (reviewRes.data ?? null) as { stamp: Stamp | null; note: string | null } | null;
  return { markFailed: !!marked.error, persons, rowByPerson, prev, review };
}

export type ReportBody = Awaited<ReturnType<typeof loadReportBody>>;

/** 출석 요약 — 예배(그중 온라인) · 목장 모임 · 개별 연락. 분모는 그 주 명단 */
export function attendanceTotals(persons: ReportPerson[], rowByPerson: Map<string, ReportRecord>) {
  const rows = persons.map((p) => rowByPerson.get(p.id));
  return {
    total: persons.length,
    worship: rows.filter((r) => r?.worship_attended).length,
    online: rows.filter((r) => r?.worship_attended && r.worship_online).length,
    meeting: rows.filter((r) => r?.group_meeting_attended).length,
    present: rows.filter((r) => r?.worship_attended && r.group_meeting_attended).length,
    contacted: rows.filter((r) => r?.one_on_one_contacted).length,
  };
}
