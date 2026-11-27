import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/week";

/**
 * 돌봄 — 주중에 연락할 사람(2026-11-15 사용자 요청). 사각지대만이 아니라 **지난 예배에 결석했거나 온라인으로 드린 사람**까지.
 *   '지난 예배' = 우리 목장이 가장 최근에 낸 보고서(이번 주를 냈으면 이번 주, 아니면 지난주). 둘 다 없으면 없다.
 *   결석 = 예배 X, 온라인 = 온라인 예배 O. 활동 중인 사람만(휴면 · 기록 제외 · 떠난 사람은 뺀다).
 * 자료는 리더 세션으로 읽는다(RLS — 자기 목장). 홈 카드의 '돌봄 n명' 과 돌봄 화면이 같은 것을 쓴다.
 */
type Client = Awaited<ReturnType<typeof createClient>>;
type Row = Pick<Database["public"]["Views"]["weekly_records_visible"]["Row"], "person_id" | "worship_attended" | "worship_online">;

export type ContactKind = "absent" | "online";
export type ContactPerson = { id: string; name: string; kind: ContactKind };
export type WeekContacts = { weekKey: string; people: ContactPerson[] };

export const CONTACT_LABEL: Record<ContactKind, string> = { absent: "결석", online: "온라인 예배" };

/** 한 사람의 그 주 기록 → 연락할 까닭(없으면 null) */
export function contactKind(r: Pick<Row, "worship_attended" | "worship_online">): ContactKind | null {
  if (!r.worship_attended) return "absent";
  if (r.worship_online) return "online";
  return null;
}

/** 돌봄 수 — 사각지대와 결석 · 온라인을 합쳐 사람 수로(겹치면 한 번) */
export function careCount(spotIds: Iterable<string>, contacts: WeekContacts | null): number {
  return new Set([...spotIds, ...(contacts?.people ?? []).map((p) => p.id)]).size;
}

export async function loadWeekContacts(supabase: Client, groupId: string, thisWeek: string): Promise<WeekContacts | null> {
  const { data: reports } = await supabase
    .from("reports")
    .select("id, week_key")
    .eq("group_id", groupId)
    .in("week_key", [thisWeek, addDays(thisWeek, -7)])
    .not("submitted_at", "is", null)
    .order("week_key", { ascending: false })
    .limit(1);
  const report = reports?.[0];
  if (!report) return null;

  const { data: rows } = await supabase.from("weekly_records_visible").select("person_id, worship_attended, worship_online").eq("report_id", report.id);
  const kinds = new Map<string, ContactKind>();
  for (const r of (rows ?? []) as Row[]) {
    const k = contactKind(r);
    if (r.person_id && k) kinds.set(r.person_id, k);
  }
  if (kinds.size === 0) return { weekKey: report.week_key, people: [] };

  const { data: persons } = await supabase.from("persons").select("id, name").in("id", [...kinds.keys()]).eq("group_id", groupId).eq("status", "active");
  const collator = new Intl.Collator("ko");
  const people = (persons ?? [])
    .map((p) => ({ id: p.id, name: p.name, kind: kinds.get(p.id)! }))
    // 결석 먼저, 그 안은 가나다
    .sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === "absent" ? -1 : 1));
  return { weekKey: report.week_key, people };
}
