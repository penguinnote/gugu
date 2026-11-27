import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey } from "@/lib/week";

import { callClaude, resolveDigestModel } from "./digest-call";
import {
  basisLine,
  fillNames,
  idsIn,
  isStoredDigest,
  pseudonymize,
  validateDigest,
  type DigestSource,
  type StoredDigest,
  type StoredSource,
} from "./digest-core";

/**
 * 목사님 주간 정리 v2 — AI 정리(2026-11-07). 순서는 정해져 있다(에이전트가 아니다):
 *   목사님이 'AI 정리 만들기'를 누른다(2026-11-08 — 저절로 만들지 않는다 · 마감 전에도) → digest_claim(한 번만) → 목사님 세션으로 자료 읽기(RLS) → 가명 → Claude 1회
 *   → 검사 → digest_save(자리표시만 저장) → 화면이 이름을 붙여 보여 준다. 실패하면 한 번 더, 그래도 안 되면 v1 만.
 * 다시 만들기(2026-11-08): 만든 뒤 새로 내거나 고친 보고서가 있으면 digest_regen(한 주에 많아야 3번) → 같은 순서.
 *   다시 만드는 동안 · 실패하면 앞의 정리를 그대로 보여 준다. 제출된 보고서가 없는 주는 만들지 않는다(빈 정리 없음).
 *
 * 켜는 조건(모두): DIGEST_AI_ENABLED=true · ANTHROPIC_API_KEY · Vercel Production.
 * 미리보기가 운영 DB 를 쓰므로 Production 밖에서는 만들지 않는다. 키는 Vercel Production 환경에만 둔다.
 * 로그에는 토큰 수 · 걸린 시간 · 실패 까닭 코드만 — 프롬프트 · 응답 · 기도제목은 남기지 않는다.
 */

export function aiDigestEnabled(): boolean {
  return process.env.DIGEST_AI_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY && process.env.VERCEL_ENV === "production";
}

type Client = Awaited<ReturnType<typeof createClient>>;
type PrayerRow = Database["public"]["Functions"]["prayer_streaks"]["Returns"][number];

/** 그 주 자료 — 목사님 세션으로 읽는다. 제출된 보고서만. reportCount 는 넣은 보고서 수 */
export async function loadDigestSource(supabase: Client, weekKey: string): Promise<(DigestSource & { reportCount: number }) | null> {
  const [groupsRes, reportsRes, personsRes, streakRes] = await Promise.all([
    supabase.from("groups").select("id, name").eq("status", "active").order("number"),
    supabase.from("reports").select("id, group_id, note").eq("week_key", weekKey).not("submitted_at", "is", null),
    supabase.from("persons").select("id, name, status, ai_excluded, group_id"),
    supabase.rpc("prayer_streaks", { p_week_key: weekKey }),
  ]);
  if (groupsRes.error || reportsRes.error || personsRes.error) return null;
  const reports = reportsRes.data ?? [];
  if (reports.length === 0) return null;
  const { data: recs, error } = await supabase
    .from("weekly_records_visible")
    .select("id, person_id, group_id_at_write, report_id, prayer_request, prayer_status, absent_reason, meeting_absent_reason, online_reason, note")
    .eq("week_key", weekKey)
    .in("report_id", reports.map((r) => r.id));
  if (error) return null;
  const streak = new Map(((streakRes.data ?? []) as PrayerRow[]).map((r) => [r.person_id, r.weeks]));
  return {
    weekKey,
    reportCount: reports.length,
    groups: groupsRes.data ?? [],
    persons: (personsRes.data ?? []).map((p) => ({ id: p.id, name: p.name, excluded: p.ai_excluded || p.status === "opted_out", groupId: p.group_id })),
    records: (recs ?? []).flatMap((r) =>
      r.id && r.person_id && r.group_id_at_write
        ? [{
            id: r.id,
            personId: r.person_id,
            groupId: r.group_id_at_write,
            prayer: r.prayer_request,
            prayerStatus: r.prayer_status,
            streakWeeks: r.prayer_request ? (streak.get(r.person_id) ?? 1) : null,
            absentReason: r.absent_reason,
            meetingAbsentReason: r.meeting_absent_reason,
            onlineReason: r.online_reason,
            note: r.note,
          }]
        : [],
    ),
    notes: reports.flatMap((r) => (r.note?.trim() ? [{ groupId: r.group_id, note: r.note }] : [])),
  };
}

/** 다시 만들기 한도 — DB(pastor_digests.regen_count check)와 같다 */
export const REGEN_LIMIT = 3;

/** 만든 때 · 넣은 보고서 수 · 다시 만들기 남은 횟수. lastFail — 마지막 다시 만들기가 실패했으면 그 까닭 코드 */
export type DigestMeta = { generatedAt: string | null; reportCount: number | null; groupCount: number | null; regenLeft: number; lastFail: string | null };

export type DigestState =
  | { state: "off" }
  | { state: "none" } // 제출된 목장보고서가 없는 주
  | { state: "available" } // 아직 없다 — 만들 수 있다
  | { state: "pending" } // 누가 만드는 중(또는 멈춤 — 5분 뒤 다시 만들 수 있다)
  | { state: "failed" } // 처음 만들기 실패 — 10분 뒤 다시 만들 수 있다
  | { state: "ready"; digest: StoredDigest; meta: DigestMeta };

/** 이번 주까지만 — 뒤의 주는 꺼짐과 같다 */
const inRange = (weekKey: string) => weekKey <= currentWeekKey();

/** 화면이 처음 그릴 때 — 저장된 것만 읽는다(만들지 않는다). 다시 만드는 중(pending)이어도 앞의 정리가 있으면 그것을 */
export async function readDigest(supabase: Client, weekKey: string): Promise<DigestState> {
  if (!aiDigestEnabled() || !inRange(weekKey)) return { state: "off" };
  const { data } = await supabase
    .from("pastor_digests")
    .select("status, content, updated_at, generated_at, report_count, group_count, regen_count, fail_reason")
    .eq("week_key", weekKey)
    .maybeSingle();
  if (!data) {
    // 아직 없다 — 제출된 보고서가 있을 때만 만들기 단추를 보인다
    const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("week_key", weekKey).not("submitted_at", "is", null);
    return count ? { state: "available" } : { state: "none" };
  }
  if ((data.status === "ready" || data.status === "pending") && isStoredDigest(data.content)) {
    return {
      state: "ready",
      digest: data.content,
      meta: {
        generatedAt: data.generated_at,
        reportCount: data.report_count,
        groupCount: data.group_count,
        regenLeft: Math.max(0, REGEN_LIMIT - (data.regen_count ?? 0)),
        lastFail: data.status === "ready" ? data.fail_reason : null,
      },
    };
  }
  if (data.status === "failed") return { state: "failed" };
  return { state: "pending" };
}

/**
 * 만들기 — 목사님 세션. 이미 누가 만드는 중이면 저장된 상태를 그대로 돌려준다.
 * regen: 다시 만들기(digest_regen). 한도 · 새 보고서 없음이면 저장된 그대로
 */
export async function generateDigest(supabase: Client, weekKey: string, opts: { regen?: boolean } = {}): Promise<DigestState> {
  if (!aiDigestEnabled() || !inRange(weekKey)) return { state: "off" };
  const claim = opts.regen
    ? await supabase.rpc("digest_regen", { p_week: weekKey })
    : await supabase.rpc("digest_claim", { p_week: weekKey });
  if (claim.error) return opts.regen ? readDigest(supabase, weekKey) : { state: "failed" };
  if (!claim.data) return readDigest(supabase, weekKey);

  const started = Date.now();
  let counts: [number | null, number | null] = [null, null];
  const save = (ok: boolean, content: StoredDigest | null, tokens: [number, number], reason: string | null) =>
    supabase.rpc("digest_save", {
      p_week: weekKey,
      p_ok: ok,
      p_content: content as unknown as Database["public"]["Tables"]["pastor_digests"]["Row"]["content"],
      p_model: resolveDigestModel(),
      p_input_tokens: tokens[0],
      p_output_tokens: tokens[1],
      p_ms: Date.now() - started,
      p_fail_reason: reason,
      ...(counts[0] === null ? {} : { p_report_count: counts[0] }),
      ...(counts[1] === null ? {} : { p_group_count: counts[1] }),
    });

  const src = await loadDigestSource(supabase, weekKey);
  if (!src) {
    // 차지했는데 읽지 못했다(차지는 제출된 보고서가 있을 때만 된다)
    await save(false, null, [0, 0], "load");
    console.log(`[digest-ai] ${weekKey} fail=load ms=${Date.now() - started}`);
    return readDigest(supabase, weekKey);
  }
  counts = [src.reportCount, src.groups.length];
  const ps = pseudonymize(src);
  if (!ps) {
    // 보고서는 있는데 보낼 글이 없는 주 — 빈 정리로 남겨 두어 다시 부르지 않는다(새 보고서가 오면 다시 만들 수 있다)
    const empty: StoredDigest = { v: 1, highlights: [], thanks: [], groups: [], intercession: [], sent: { records: 0, notes: 0 }, dropped: 0 };
    await save(true, empty, [0, 0], null);
    return readDigest(supabase, weekKey);
  }

  let reason = "unknown";
  let tokens: [number, number] = [0, 0];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callClaude(ps.body);
    if (!r.ok) {
      reason = r.reason;
      if (!r.retry) break;
      continue;
    }
    tokens = [tokens[0] + r.inputTokens, tokens[1] + r.outputTokens];
    const v = validateDigest(r.out, ps);
    if (v.ok) {
      const saved = await save(true, v.digest, tokens, null);
      console.log(`[digest-ai] ${weekKey} ok in=${tokens[0]} out=${tokens[1]} ms=${Date.now() - started} dropped=${v.digest.dropped}${opts.regen ? " regen" : ""}${saved.error ? " save=fail" : ""}`);
      return saved.error ? { state: "failed" } : readDigest(supabase, weekKey);
    }
    reason = v.reason;
  }
  await save(false, null, tokens, reason);
  console.log(`[digest-ai] ${weekKey} fail=${reason} in=${tokens[0]} out=${tokens[1]} ms=${Date.now() - started}${opts.regen ? " regen" : ""}`);
  // 다시 만들다 실패하면 앞의 정리가 남아 있다(lastFail 이 붙어 온다). 처음 만들기 실패면 failed
  return readDigest(supabase, weekKey);
}

// ---------------------------------------------------------------------------- 보여 주기

export type ShownSource = { href: string; label: string };
export type ShownItem = { key: string; text: string; source: ShownSource | null };
export type ShownFeedback = { helpful: boolean | null; wrong: boolean };
export type ShownDigest = {
  weekKey: string;
  highlights: ShownItem[];
  thanks: ShownItem[];
  groups: ShownItem[];
  intercession: ShownItem[];
  empty: boolean;
  feedback: Record<string, ShownFeedback>;
  /** "12개 목장 중 9개 기준 · 수요일 08:12" — 만든 때를 모르면(2026-11-08 전 정리) null */
  basis: string | null;
  generatedAt: string | null;
  regenLeft: number;
  lastFail: string | null;
};


/** 자리표시에 이름을 붙이고, 근거는 그 목장 보고서로 잇는다. 이름은 목사님 세션(RLS)으로 읽는다 */
export async function showDigest(supabase: Client, weekKey: string, d: StoredDigest, meta: DigestMeta): Promise<ShownDigest> {
  const ids = idsIn(d);
  const [peopleRes, groupsRes, fbRes] = await Promise.all([
    ids.people.length ? supabase.from("persons").select("id, name").in("id", ids.people) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.groups.length ? supabase.from("groups").select("id, name").in("id", ids.groups) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("pastor_digest_feedback").select("item_key, helpful, wrong").eq("week_key", weekKey),
  ]);
  const people = new Map((peopleRes.data ?? []).map((p) => [p.id, p.name]));
  const groups = new Map((groupsRes.data ?? []).map((g) => [g.id, g.name]));
  const sourceOf = (src: StoredSource[]): ShownSource | null => {
    const first = src[0];
    if (!first) return null;
    const gid = "r" in first ? first.g : first.n;
    const name = groups.get(gid);
    return name ? { href: `/pastor/reports/${encodeURIComponent(name)}?week=${weekKey}`, label: `${name} 목장` } : null;
  };
  const shown = (prefix: string, list: { text: string; src: StoredSource[] }[]) =>
    list.map((it, i) => ({ key: `${prefix}:${i}`, text: fillNames(it.text, people, groups), source: sourceOf(it.src) }));
  return {
    weekKey,
    highlights: shown("h", d.highlights),
    thanks: shown("t", d.thanks),
    groups: d.groups.map((g) => ({ key: `g:${g.g}`, text: fillNames(g.text, people, groups), source: sourceOf(g.src.length ? g.src : [{ n: g.g }]) })),
    intercession: shown("i", d.intercession),
    empty: d.highlights.length + d.thanks.length + d.groups.length + d.intercession.length === 0,
    feedback: Object.fromEntries((fbRes.data ?? []).map((f) => [f.item_key, { helpful: f.helpful, wrong: f.wrong }])),
    basis: basisLine(meta),
    generatedAt: meta.generatedAt,
    regenLeft: meta.regenLeft,
    lastFail: meta.lastFail,
  };
}
