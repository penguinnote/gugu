import "server-only";

import type { createClient } from "@/lib/supabase/server";

import { buildExportModel, type ExportGroup, type ExportModel, type ExportPerson, type ExportRecord, type ExportReport } from "./model";
import type { ExportRange } from "./range";
import { sortGroups } from "@/lib/group-order";

/**
 * 내보내기 데이터 읽기 (Step 10) — 목사님 세션으로, RLS 를 그대로 탄다(tests/rls/export.test.mjs). 서버 키는 쓰지 않는다.
 * 52주 × 12목장이면 주간기록이 수천 행이라 PostgREST 의 한 번 상한(1000행)을 넘는다 — 페이지로 나눠 읽는다.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000;

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadActiveGroups(supabase: Client): Promise<ExportGroup[]> {
  const { data } = await supabase.from("groups").select("id, name, number").eq("status", "active");
  return sortGroups((data ?? []) as ExportGroup[]);
}

export async function loadExportModel(supabase: Client, range: ExportRange, active: ExportGroup[]): Promise<ExportModel> {
  const groups = range.groupIds ? active.filter((g) => range.groupIds!.includes(g.id)) : active;
  const ids = groups.map((g) => g.id);

  const [reports, records, persons, skipped] = await Promise.all([
    readAll<ExportReport>((a, b) =>
      supabase
        .from("reports")
        .select("id, group_id, week_key, submitted_at, is_late, note")
        .in("group_id", ids)
        .gte("week_key", range.from)
        .lte("week_key", range.to)
        .order("id")
        .range(a, b),
    ),
    readAll<ExportRecord>((a, b) =>
      supabase
        .from("weekly_records_visible")
        .select("report_id, person_id, week_key, worship_attended, group_meeting_attended, one_on_one_contacted, prayer_request, worship_online, online_reason, meeting_absent_reason, absent_reason")
        .in("group_id_at_write", ids)
        .gte("week_key", range.from)
        .lte("week_key", range.to)
        .order("id")
        .range(a, b),
    ),
    readAll<ExportPerson>((a, b) => supabase.from("persons").select("id, name, group_role").order("id").range(a, b)),
    supabase.from("skipped_weeks").select("week_key").gte("week_key", range.from).lte("week_key", range.to),
  ]);

  // 다른 목장으로 옮긴 사람 — 명단 읽기 범위 밖이라 '(명단에 없음)' 으로 합쳐졌다. 기록 읽기 범위로 이름을 채운다(2026-11-06)
  const known = new Set(persons.map((p) => p.id));
  const missing = [...new Set(records.map((r) => r.person_id).filter((id): id is string => !!id && !known.has(id)))];
  if (missing.length > 0) {
    const { data } = await supabase.rpc("recorded_person_names", { p_ids: missing });
    persons.push(...((data ?? []) as ExportPerson[]));
  }

  return buildExportModel({
    weeks: range.weeks,
    groups,
    reports,
    records,
    persons,
    skippedWeeks: ((skipped.data ?? []) as { week_key: string }[]).map((s) => s.week_key),
  });
}
