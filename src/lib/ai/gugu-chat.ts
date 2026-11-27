import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import type { UserContext } from "@/lib/auth/session";
import type { BlindSpotRow } from "@/lib/blind-spots";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, formatWeekLabel, isPastDeadline, isWeekKey } from "@/lib/week";

import { sortGroups } from "@/lib/group-order";
import { fixSpacing } from "@/lib/spell/kiwi";
import { dropJamo, fixSpelling } from "@/lib/spell/rules";

import { makeAnon, type Anon } from "./anon";
import {
  answerAbsences,
  answerAppInfo,
  APP_TOPICS,
  type AppRules,
  answerAttendanceCount,
  answerBlindSpots,
  answerGroupWeek,
  answerPeople,
  answerPerson,
  answerPrayers,
  answerWeekStatus,
  weekFrom,
  type AnswerGroup,
  type AnswerPerson,
} from "./chat-answer";
import { scrubBareGiven } from "./gugu-text";
import { anthropic, failReason, failText, guguModel } from "./gugu-ai";

/**
 * 구구 챗봇(2026-11-12, 2026-11-17 다시 짬 — AI 동의 없이 쓰게) — '구구에게 물어보기'. 리더 · 목사님이 앱 기록을 말로 묻는다.
 *   · AI 는 질문을 알아듣고 도구만 고른다. 도구가 읽은 기록(이름 · 출석 · 기도제목)은 AI 로 보내지 않는다 —
 *     앱이 그 기록으로 답을 써서 바로 보여 준다(lib/ai/chat-answer). 그래서 기록되는 청년의 AI 동의가 필요 없다
 *   · AI 로 가는 것은 질문 글뿐이다 — 사람 이름은 P01 같은 기호로 바꾼다(anon.ts). 앞 대화의 구구 답(기록이 든 글)은 보내지 않는다
 *   · 자료는 묻는 사람 세션으로만 읽는다(RLS) — 리더는 자기 목장, 목사님은 전체
 *   · 대화는 서버에 남기지 않는다(폰에만). 도구는 읽기만 한다
 * 해석 · 요약 · 추천(예: 함께 기도할 것 고르기)은 하지 않는다 — 기록을 모아 보여 준다.
 */

export type ChatTurn = { role: "user" | "assistant"; text: string };
export const CHAT_MAX_TURNS = 12;
export const CHAT_MAX_CHARS = 1000;

type Client = Awaited<ReturnType<typeof createClient>>;

export function chatSystem(me: UserContext, today: string): string {
  const scope = me.role === "pastor" ? "담당 목사님 — 모든 목장을 볼 수 있다" : `목장 리더(${me.groupName ?? ""} 목장) — 자기 목장만 볼 수 있다`;
  return `너는 '구구'다. 로뎀 청년부 목장 보고서 앱의 마스코트 비둘기이자 도우미. 지금 묻는 사람: ${scope}. 오늘: ${today}.

일하는 법
- 너는 기록을 볼 수 없다. 사람 · 출석 · 결석 · 기도제목 · 보고서 · 제출 · 챙김이 필요한 양 같은 기록 질문이면 알맞은 도구를 부르기만 한다 — 앱이 기록을 읽어 사용자에게 바로 보여 준다. 도구를 부를 때는 다른 말을 쓰지 않는다.
- 여러 가지를 물으면 도구를 여러 개 불러도 된다. 가장 가까운 도구가 없으면 비슷한 것을 부른다(예: '함께 기도할 것' → 기도제목 모음).
- 사람 이름은 P01 같은 기호로 바뀌어 있다. 사람을 가리키는 도구에는 그 기호를 그대로 넣는다. 기호 없이 '그 사람' 처럼 물으면 누구인지 다시 물어본다.
- 앱 사용법 · 규칙 질문(마감 · 열매 · 연속 제출 · 쿠폰 · 개별 연락으로 교제 · 챙김이 필요한 양 · 출석부 · 기도제목 붙여넣기)은 app_info 도구를 부른다. 날짜 · 숫자를 직접 말하지 않는다.
- 예전 말로 물어도 같은 것으로 알아듣는다: 돌봄 사각지대 = 챙김이 필요한 양, 컨택 = 개별 연락으로 교제, 사람별 기록 = 출석/기도제목 기록, AI로 채우기 = 기도제목 붙여넣기. 답에는 새 말만 쓴다.
- 그 밖(인사 · 되묻기)만 짧게 직접 답한다: 한국어 존댓말 ~해요 체, 1~3문장, 마크다운 없이. 기록 · 규칙을 짐작해서 말하지 않는다.
- 기록을 고치거나 보고서를 내는 일은 할 수 없다 — 그런 부탁이면 어느 화면에서 하는지만 알려 준다.`;
}

const WEEK = { type: "string", description: "this(이번 주) · last(지난주) · YYYY-MM-DD(그 주 주일)" } as const;
const GROUP = { type: "string", description: "목장 이름(선택)" } as const;

export const CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  { name: "list_people", description: "사람 명단 — 목장 · 목자/목동/양 · 판정 태그.", input_schema: { type: "object", properties: { group: GROUP }, additionalProperties: false } },
  {
    name: "person_records",
    description: "한 사람의 최근 기록(예배 · 목장 출석, 기도제목)과 출석률.",
    input_schema: { type: "object", properties: { person: { type: "string", description: "사람 기호(P01 같은)" }, weeks: { type: "integer", minimum: 1, maximum: 26 } }, required: ["person"], additionalProperties: false },
  },
  { name: "group_week", description: "한 목장의 한 주 보고서 정리 — 사람마다 출석 · 기도제목, 특이사항. 목장을 안 주면 묻는 리더의 목장.", input_schema: { type: "object", properties: { group: GROUP, week: WEEK }, additionalProperties: false } },
  { name: "week_status", description: "한 주의 목장별 제출 현황 — 안 낸 목장 · 늦게 낸 목장.", input_schema: { type: "object", properties: { week: WEEK }, additionalProperties: false } },
  { name: "blind_spots", description: "지금 챙김이 필요한 양(2주 연속 결석 · 4주 목장 불참)인 사람.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "prayers", description: "한 주의 기도제목 모음(목장마다).", input_schema: { type: "object", properties: { week: WEEK, group: GROUP }, additionalProperties: false } },
  {
    name: "absences",
    description: "최근 몇 주 예배 결석한 사람 — 연속 결석이 긴 사람부터.",
    input_schema: { type: "object", properties: { weeks: { type: "integer", minimum: 2, maximum: 12, description: "기본 4" }, group: GROUP }, additionalProperties: false },
  },
  { name: "attendance_count", description: "한 주의 예배 출석 인원(현장 · 온라인 · 결석).", input_schema: { type: "object", properties: { week: WEEK, group: GROUP }, additionalProperties: false } },
  {
    name: "app_info",
    description: "앱 사용법 · 규칙 안내. deadline 보고서 마감 · berries 열매 · streak 연속 제출과 쿠폰 · contact 개별 연락으로 교제 · blind_spot 챙김이 필요한 양 · attendance 출석부 · memo_fill 기도제목 붙여넣기.",
    input_schema: { type: "object", properties: { topic: { type: "string", enum: [...APP_TOPICS] } }, required: ["topic"], additionalProperties: false },
  },
];

type Ctx = {
  supabase: Client;
  me: UserContext;
  anon: Anon;
  groups: AnswerGroup[];
  people: AnswerPerson[];
};

function groupByName(ctx: Ctx, name: unknown): AnswerGroup | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = name.replace(/\s*목장$/, "").trim();
  return ctx.groups.find((g) => g.name === n) ?? null;
}

const REC_COLS = "person_id, week_key, worship_attended, worship_online, group_meeting_attended, one_on_one_contacted, prayer_request, group_id_at_write";

/**
 * 답에 싣는 기도제목 · 특이사항을 다듬는다(2026-11-17) — 메모 채우기와 같은 정리: ㅎㅎ 지우기 · 맞춤법 · 띄어쓰기 ·
 * 기도제목은 '~도록'(감사 제목은 '~ 감사') · 여럿은 ' / '. 우리 서버 안에서만(lib/spell). 분석기를 못 쓰면 규칙만
 */
async function tidy<T extends { prayer_request: string | null }>(rows: T[]): Promise<T[]> {
  const idx = rows.flatMap((r, i) => (r.prayer_request?.trim() ? [i] : []));
  if (idx.length === 0) return rows;
  const base = idx.map((i) => fixSpelling(dropJamo(rows[i].prayer_request!)));
  const out = (await fixSpacing(base, () => true).catch(() => null)) ?? base;
  const copy = rows.map((r) => ({ ...r }));
  idx.forEach((i, k) => (copy[i].prayer_request = out[k]));
  return copy;
}
async function tidyNote(note: string | null): Promise<string | null> {
  if (!note?.trim()) return note;
  const base = fixSpelling(dropJamo(note));
  return ((await fixSpacing([base]).catch(() => null)) ?? [base])[0];
}

/** 도구 하나 → 화면에 바로 나갈 글(이름 그대로). AI 로는 가지 않는다 */
export async function answerTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<string> {
  const { supabase } = ctx;
  const thisWeek = currentWeekKey();
  const visible = ctx.people.filter((p) => p.status !== "left" && p.status !== "opted_out");
  const known = new Map(visible.map((p) => [p.id, p]));
  const nameOf = (id: string) => known.get(id)?.name ?? null;
  const personOf = (id: string) => known.get(id) ?? null;
  // 보이는 목장이 여럿이면(목사님) 사람마다 목장 이름을 붙인다(2026-11-18)
  const multi = ctx.groups.length > 1;
  // 여러 목장이 보이는 사람이 한 목장을 골라 물었을 때 — 답 첫 줄에 그 목장 이름
  const pickedName = () => (multi ? (groupByName(ctx, input.group)?.name ?? null) : null);
  const gname = new Map(ctx.groups.map((g) => [g.id, g.name]));
  const pickGroup = () => groupByName(ctx, input.group);
  const inScope = (gid: string | null) => !pickGroup() || gid === pickGroup()!.id;

  if (name === "list_people") {
    const g = pickGroup();
    return answerPeople(visible.filter((p) => (g ? p.group_id === g.id : true)), ctx.groups);
  }
  if (name === "person_records") {
    const id = ctx.anon.personOf(String(input.person ?? "").trim());
    const person = id ? known.get(id) : null;
    if (!person) return "누구인지 찾지 못했어요. 이름을 정확히 적어 주세요.";
    const n = Math.min(26, Math.max(1, Number(input.weeks) || 8));
    const from = addDays(thisWeek, -7 * (n - 1));
    const [recRes, skipRes] = await Promise.all([
      supabase.from("weekly_records_visible").select(REC_COLS).eq("person_id", person.id).gte("week_key", from).order("week_key", { ascending: false }),
      supabase.from("skipped_weeks").select("week_key").gte("week_key", from).lte("week_key", thisWeek),
    ]);
    if (recRes.error) return "기록을 읽지 못했어요.";
    const weeks: string[] = [];
    for (let w = thisWeek; w >= from; w = addDays(w, -7)) weeks.push(w);
    return answerPerson(person, await tidy(recRes.data ?? []), weeks, new Set((skipRes.data ?? []).map((s) => s.week_key)));
  }
  if (name === "group_week") {
    const g = pickGroup() ?? (ctx.me.groupId ? (ctx.groups.find((x) => x.id === ctx.me.groupId) ?? null) : null);
    if (!g) return "어느 목장인지 알려 주세요.";
    const week = weekFrom(input.week, thisWeek, isWeekKey);
    const { data: report } = await supabase.from("reports").select("id, note, submitted_at, is_late, no_meeting").eq("group_id", g.id).eq("week_key", week).maybeSingle();
    const recs = report ? ((await supabase.from("weekly_records_visible").select(REC_COLS).eq("report_id", report.id)).data ?? []) : [];
    return answerGroupWeek({ group: g, week, report: report ? { ...report, note: await tidyNote(report.note) } : null, records: await tidy(recs), personOf });
  }
  if (name === "week_status") {
    const week = weekFrom(input.week, thisWeek, isWeekKey);
    const [repRes, skipRes] = await Promise.all([
      supabase.from("reports").select("group_id, submitted_at, is_late, no_meeting").eq("week_key", week),
      supabase.from("skipped_weeks").select("week_key").eq("week_key", week),
    ]);
    return answerWeekStatus({
      week,
      skipped: (skipRes.data ?? []).length > 0,
      pastDeadline: isPastDeadline(week),
      groups: ctx.groups,
      reports: new Map((repRes.data ?? []).map((r) => [r.group_id, r])),
    });
  }
  if (name === "blind_spots") {
    const { data, error } = await supabase.rpc("care_blind_spots", { p_week_key: thisWeek });
    if (error) return "챙김이 필요한 양을 읽지 못했어요.";
    const rows = (data ?? []) as BlindSpotRow[];
    // 누가 · 어떤 순서로 뜨는지는 answerBlindSpots 가 화면과 같은 셈(summarizeBlindSpots)으로 정한다
    return answerBlindSpots(
      rows.flatMap((r) => {
        const n = nameOf(r.person_id);
        return n ? [{ name: n, group: gname.get(r.group_id ?? "") ?? "", row: r }] : [];
      }),
      multi,
    );
  }
  if (name === "prayers") {
    const week = weekFrom(input.week, thisWeek, isWeekKey);
    const { data } = await supabase.from("weekly_records_visible").select(REC_COLS).eq("week_key", week);
    const groups = ctx.groups.filter((g) => inScope(g.id));
    return answerPrayers(week, groups, await tidy(data ?? []), personOf, (r) => r.group_id_at_write ?? known.get(r.person_id ?? "")?.group_id ?? null, pickedName());
  }
  if (name === "absences") {
    const n = Math.min(12, Math.max(2, Number(input.weeks) || 4));
    const from = addDays(thisWeek, -7 * (n - 1));
    const { data } = await supabase.from("weekly_records_visible").select(REC_COLS).gte("week_key", from).lte("week_key", thisWeek);
    const weeks: string[] = [];
    for (let w = from; w <= thisWeek; w = addDays(w, 7)) weeks.push(w);
    return answerAbsences({ weeks, people: visible.filter((p) => inScope(p.group_id)), records: data ?? [], groupName: (id) => gname.get(id ?? "") ?? "", multi: multi && !pickGroup(), picked: pickedName() });
  }
  if (name === "attendance_count") {
    const week = weekFrom(input.week, thisWeek, isWeekKey);
    const g = pickGroup();
    const { data } = await supabase.from("weekly_records_visible").select(REC_COLS).eq("week_key", week);
    const recs = (data ?? []).filter((r) => r.person_id && known.has(r.person_id) && (!g || (r.group_id_at_write ?? known.get(r.person_id)?.group_id) === g.id));
    // 여러 목장을 한꺼번에 볼 때만 — 그 주 기록이 하나도 없는 목장(2026-11-18)
    const has = new Set(recs.map((r) => r.group_id_at_write ?? known.get(r.person_id ?? "")?.group_id ?? null));
    const noRecord = !g && multi ? ctx.groups.filter((x) => !has.has(x.id)).map((x) => x.name) : [];
    return answerAttendanceCount(week, recs, g ? `${g.name} 목장` : ctx.me.role === "pastor" ? "청년부" : `${ctx.me.groupName ?? ""} 목장`, noRecord);
  }
  if (name === "app_info") {
    const [rulesRes, couponRes] = await Promise.all([
      supabase.from("world_rules").select("key, value"),
      supabase.from("world_items").select("price").eq("id", "freeze").maybeSingle(),
    ]);
    const v = new Map((rulesRes.data ?? []).map((x) => [x.key, Number(x.value)]));
    const rules: AppRules = {
      start: v.get("start_berries") ?? 300,
      onTime: v.get("report_on_time") ?? 80,
      late: v.get("report_late") ?? 5,
      step: v.get("streak_step") ?? 4,
      max: v.get("streak_max") ?? 12,
      coupon: Number(couponRes.data?.price ?? 300),
      perTerm: v.get("freeze_per_term") ?? 2,
      gift: v.get("skip_gift") ?? 200,
    };
    return answerAppInfo(String(input.topic ?? ""), { thisWeek, rules });
  }
  return "그 질문은 아직 도와드릴 수 없어요.";
}

/**
 * 줄 단위 이벤트 — d 답 조각 · s 찾는 중 안내 · e 실패 문구 · end 끝
 *   q 이번 달 쓴 횟수/한도(답을 받아 센 뒤, 리더만) · x 이번 달 다 씀(AI 를 부르지 않았다)
 */
export type ChatEvent =
  | { t: "d"; v: string }
  | { t: "s"; v: string }
  | { t: "e"; v: string }
  | { t: "q"; used: number; quota: number }
  | { t: "x"; used: number; quota: number }
  | { t: "end" };

const STATUS: Record<string, string> = {
  list_people: "명단을 보는 중…",
  person_records: "기록을 찾는 중…",
  group_week: "목장보고서를 보는 중…",
  week_status: "제출 현황을 보는 중…",
  blind_spots: "챙김이 필요한 양을 보는 중…",
  prayers: "기도제목을 모으는 중…",
  absences: "결석을 찾는 중…",
  attendance_count: "출석을 세는 중…",
  app_info: "안내를 찾는 중…",
};

/** 앞 대화의 구구 답 대신 보내는 말 — 답에는 기록이 들어 있어 AI 로 보내지 않는다 */
const ANSWERED = "(앞 질문에는 앱이 기록으로 답했어요)";

/** 대화 한 번 — 이벤트를 send 로 흘려보낸다. 답을 제대로 냈으면 true(끝 이벤트는 부르는 쪽이 횟수를 센 뒤 보낸다) */
export async function runChat(me: UserContext, turns: ChatTurn[], send: (e: ChatEvent) => void, signal?: AbortSignal, client0?: Client): Promise<boolean> {
  const supabase = client0 ?? (await createClient());
  const [gRes, pRes] = await Promise.all([
    supabase.from("groups").select("id, name").eq("status", "active"),
    supabase.from("persons").select("id, name, group_id, group_role, is_group_head, care_status, status"),
  ]);
  if (gRes.error || pRes.error) {
    send({ t: "e", v: failText("load") });
    return false;
  }
  // 리더는 자기 목장 사람만 다룬다(운영자 겸 리더는 persons 를 전부 읽는다 — 사람 화면과 같은 규칙)
  const people = (pRes.data ?? []).filter((p) => me.role === "pastor" || p.group_id === me.groupId) as AnswerPerson[];
  const groups = sortGroups(me.role === "pastor" ? (gRes.data ?? []) : (gRes.data ?? []).filter((g) => g.id === me.groupId), me.leadsGroup ? me.groupId : null);
  // 기호는 모두에게 — 기록을 보내지 않으므로 동의와 상관없다. 질문 속 이름만 가린다
  const anon = makeAnon(people.map((p) => ({ id: p.id, name: p.name, excluded: false, groupId: p.group_id })));
  const members = people.map((p) => ({ id: p.id, name: p.name }));
  const ctx: Ctx = { supabase, me, anon, groups, people };

  const messages: Anthropic.Messages.MessageParam[] = turns.slice(-CHAT_MAX_TURNS).map((t) => ({
    role: t.role,
    content: t.role === "assistant" ? ANSWERED : scrubBareGiven(anon.scrub(t.text.slice(0, CHAT_MAX_CHARS), me.groupId), members, anon) || "(빈 말)",
  }));
  const today = formatWeekLabel(currentWeekKey()) + " 주";

  try {
    const msg = await anthropic().messages.create(
      { model: guguModel(), max_tokens: 800, output_config: { effort: "low" }, system: chatSystem(me, today), tools: CHAT_TOOLS, messages },
      { signal },
    );
    if (msg.stop_reason === "refusal") {
      send({ t: "e", v: failText("refusal") });
      return false;
    }
    const uses = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    console.info("[gugu-chat] done", uses.map((u) => u.name).join(",") || "text", msg.usage.input_tokens, msg.usage.output_tokens);
    if (uses.length === 0) {
      // 기록 질문이 아닌 답(앱 사용법 · 인사 · 되묻기) — AI 가 본 것은 질문뿐이다. 질문 속 기호만 이름으로 되돌린다
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      if (!text || msg.stop_reason === "max_tokens") {
        send({ t: "e", v: failText("max_tokens") });
        return false;
      }
      send({ t: "d", v: anon.fill(text) });
      return true;
    }
    const parts: string[] = [];
    for (const u of uses.slice(0, 4)) {
      send({ t: "s", v: STATUS[u.name] ?? "찾는 중…" });
      parts.push(await answerTool(ctx, u.name, (u.input ?? {}) as Record<string, unknown>).catch(() => "기록을 읽지 못했어요."));
    }
    send({ t: "d", v: parts.join("\n\n") });
    return true;
  } catch (e) {
    const reason = failReason(e);
    console.error("[gugu-chat] failed", reason);
    send({ t: "e", v: failText(reason) });
    return false;
  }
}
