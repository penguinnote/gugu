"use server";

import { generateDigest, showDigest, type ShownDigest } from "@/lib/ai/digest";
import { requirePastor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isWeekKey } from "@/lib/week";

/**
 * AI 주간 정리(2026-11-07) — 목사님이 'AI 정리 만들기'를 누르면(2026-11-08 — 저절로 부르지 않는다). 목사님 세션으로 만들고 저장한다.
 * 실패 · 꺼짐 · 누가 만드는 중이면 null. 보낼 글이 없던 주는 빈 정리(empty)를 돌려준다.
 */
export async function makeDigest(weekKey: string): Promise<ShownDigest | null> {
  await requirePastor();
  if (!isWeekKey(weekKey)) return null;
  const supabase = await createClient();
  const r = await generateDigest(supabase, weekKey);
  if (r.state !== "ready") return null;
  return showDigest(supabase, weekKey, r.digest, r.meta);
}

/**
 * 다시 만들기(2026-11-08) — 만든 뒤 새로 내거나 고친 보고서가 있을 때, 한 주에 많아야 3번.
 * 성공이면 새 정리, 실패면 앞의 정리(lastFail 이 붙는다). 꺼짐 · 정리 없음이면 null
 */
export async function regenDigest(weekKey: string): Promise<ShownDigest | null> {
  await requirePastor();
  if (!isWeekKey(weekKey)) return null;
  const supabase = await createClient();
  const r = await generateDigest(supabase, weekKey, { regen: true });
  if (r.state !== "ready") return null;
  return showDigest(supabase, weekKey, r.digest, r.meta);
}

export type FeedbackPatch = { helpful: boolean | null } | { wrong: boolean };

/** 항목마다 도움 됨 / 아님(다시 누르면 지운다) · 틀린 내용(켜고 끈다) — 목사님 자기 것만 */
export async function digestFeedback(weekKey: string, itemKey: string, patch: FeedbackPatch): Promise<{ ok: boolean }> {
  await requirePastor();
  if (!isWeekKey(weekKey) || !/^[a-z]{1,3}:[0-9a-f-]{1,36}$/.test(itemKey)) return { ok: false };
  const row =
    "wrong" in patch
      ? { wrong: patch.wrong === true }
      : { helpful: patch.helpful === null ? null : patch.helpful === true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pastor_digest_feedback")
    .upsert({ week_key: weekKey, item_key: itemKey, ...row, updated_at: new Date().toISOString() }, { onConflict: "week_key,item_key,user_id" });
  return { ok: !error };
}
