import "server-only";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, formatWeekLabel } from "@/lib/week";

import { makeAnon } from "./anon";
import { flowLines } from "./gugu-text";
import { askText, failText, guguAiEnabled } from "./gugu-ai";

/**
 * 사람별 흐름 요약(2026-11-12) — 사람 화면에서 'AI 요약 만들기' 를 누르면 그 사람의 최근 6개월 기록(출석 · 컨택 · 기도제목)을
 * 몇 줄로 정리한다. 보는 사람은 사람 화면과 같다(목사님 전체 · 리더는 지금 자기 목장 사람만). 자료는 보는 사람 세션으로 읽는다(RLS).
 * 저장하지 않는다 — 누를 때마다 새로 만든다. AI 에서 뺀 사람은 만들지 않는다.
 */

const WEEKS = 26;

export const FLOW_SYSTEM = `너는 교회 청년부 목장 리더와 담당 목사님을 돕는 비서다. 한 사람의 최근 몇 달 기록(주마다 예배 · 목장 출석, 리더의 개별 연락으로 교제, 기도제목)을 읽고, 그 사람의 흐름을 짧게 정리한다.

쓰는 법
- 한국어 존댓말(~해요 체)로 3~4문장, 한 문단. 마크다운 · 목록 · 제목 없이 글만.
- 사람은 기호(P01 같은)로만 부른다. 이름을 지어내지 않는다.
- 기록에 있는 사실만 쓴다. 추측 · 진단 · 평가 · 조언은 쓰지 않는다('힘들어 보여요', '관심이 필요해요' 같은 말 금지).
- 다룰 것: 최근 4주와 그 전의 출석 흐름(온라인 예배 포함), 개별 연락으로 교제가 이어졌는지, 기도제목에서 되풀이되는 주제와 최근 바뀐 주제.
- 날짜는 '10월 첫 주'처럼 대략으로. 기록이 적으면 적다고만 쓴다.`;

export type FlowResult = { ok: true; text: string } | { ok: false; message: string };

export async function summarizePersonFlow(personId: string): Promise<FlowResult> {
  const me = await getUserContext();
  if (!me || !(me.leadsGroup || me.role === "pastor")) return { ok: false, message: "볼 수 없는 사람이에요." };
  if (!guguAiEnabled()) return { ok: false, message: failText("off") };

  const supabase = await createClient();
  const { data: person } = await supabase.from("persons").select("id, name, group_id, group_role, status, ai_excluded").eq("id", personId).maybeSingle();
  if (!person || !person.group_id) return { ok: false, message: "볼 수 없는 사람이에요." };
  if (me.role !== "pastor" && person.group_id !== me.groupId) return { ok: false, message: "볼 수 없는 사람이에요." };
  if (person.ai_excluded || person.status === "opted_out") return { ok: false, message: "AI에서 뺀 사람이라 요약하지 않아요." };

  const thisWeek = currentWeekKey();
  const from = addDays(thisWeek, -7 * (WEEKS - 1));
  const [recRes, skipRes, peopleRes] = await Promise.all([
    supabase
      .from("weekly_records_visible")
      .select("week_key, worship_attended, worship_online, group_meeting_attended, one_on_one_contacted, prayer_request, group_id_at_write")
      .eq("person_id", personId)
      .gte("week_key", from)
      .order("week_key", { ascending: false }),
    supabase.from("skipped_weeks").select("week_key").gte("week_key", from).lte("week_key", thisWeek),
    supabase.from("persons").select("id, name, status, ai_excluded, group_id"),
  ]);
  if (recRes.error || peopleRes.error) return { ok: false, message: failText("load") };
  const recs = recRes.data ?? [];
  if (recs.length === 0) return { ok: false, message: "아직 기록이 없어요." };

  const anon = makeAnon((peopleRes.data ?? []).map((p) => ({ id: p.id, name: p.name, excluded: p.ai_excluded || p.status === "opted_out", groupId: p.group_id })));
  const me0 = anon.token(person.id)!;
  // 처음 기록한 주부터 이번 주까지
  const oldest = recs.map((r) => r.week_key ?? "").filter(Boolean).sort()[0] ?? thisWeek;
  const weeks: string[] = [];
  for (let w = thisWeek; w >= oldest; w = addDays(w, -7)) weeks.push(w);
  const skipped = new Set((skipRes.data ?? []).map((s) => s.week_key));
  const body = [
    `사람: ${me0} (${person.group_role === "leader" ? "리더" : "목장원"})`,
    `기간: ${formatWeekLabel(weeks.at(-1)!)} ~ ${formatWeekLabel(thisWeek)} (이번 주는 아직 안 냈을 수 있음)`,
    "주별 기록(최근부터):",
    ...flowLines(recs, weeks, skipped, anon.scrub),
  ].join("\n");

  const res = await askText(FLOW_SYSTEM, body, 1500);
  if (!res.ok) return { ok: false, message: failText(res.reason) };
  return { ok: true, text: anon.fill(res.text) };
}
