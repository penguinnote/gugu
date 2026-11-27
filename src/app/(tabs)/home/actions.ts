"use server";

import { createClient } from "@/lib/supabase/server";
import { isWeekKey } from "@/lib/week";

/**
 * 홈의 '쿠폰으로 지키기'(World 5). 지킬 수 있는 주인지 · 학기 한도 · 쿠폰 수 · 사서 쓰기의 열매는 전부 DB 함수
 * (world_use_freeze)가 판정한다. 오류 문구는 DB 함수의 한국어 문구 그대로.
 */
export type KeepStreakResult = { ok: true } | { ok: false; message: string };

export async function keepStreak(week: string, buy: boolean): Promise<KeepStreakResult> {
  if (!isWeekKey(week)) return { ok: false, message: "주차가 올바르지 않습니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_use_freeze", { p_week: week, p_buy: buy === true });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** 휴주 선물 팝업을 봤다(2026-11-26) — 계정 · 주마다 한 번. 본 기록은 skip_gift_seen(본인 것만 쓴다) */
export async function markSkipGiftSeen(weeks: string[]): Promise<void> {
  const ok = weeks.filter((w) => isWeekKey(w)).slice(0, 20);
  if (ok.length === 0) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_user_context");
  const userId = (data as { user_id: string }[] | null)?.[0]?.user_id;
  if (!userId) return;
  await supabase.from("skip_gift_seen").upsert(ok.map((week_key) => ({ user_id: userId, week_key })), { onConflict: "user_id,week_key", ignoreDuplicates: true });
}
