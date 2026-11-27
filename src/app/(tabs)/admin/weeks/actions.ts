"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, isWeekKey } from "@/lib/week";

export type WeekResult = { ok: true } | { ok: false; message: string };

/**
 * A-1b 휴주 켜기·끄기. 운영자만(2026-11-18 — 화면에서. DB 는 목사님 · 임원진도 허용한 그대로).
 * 지난 주도 최근 12주까지(2026-11-26 — 늦게 정해도 휴주). 정하면 DB 트리거가 휴주 선물 · 쿠폰 돌려주기 · 연속 보너스 채우기를 한다.
 * 사유는 선택. 켜면 그 주는 작성 대상이 아니고 제출률 분모에서 빠지며 streak 을 끊지 않는다(03 §2.4).
 */
export async function setSkippedWeek(weekKey: string, skipped: boolean, reason: string): Promise<WeekResult> {
  await requireRole("admin");
  if (!isWeekKey(weekKey)) return { ok: false, message: "주차가 올바르지 않습니다." };
  if (weekKey < addDays(currentWeekKey(), -7 * 12)) return { ok: false, message: "너무 지난 주차의 휴주는 바꿀 수 없습니다." };

  const supabase = await createClient();
  const trimmed = reason.trim().slice(0, 100);
  const { error } = skipped
    ? await supabase.from("skipped_weeks").upsert({ week_key: weekKey, reason: trimmed || null }, { onConflict: "week_key" })
    : await supabase.from("skipped_weeks").delete().eq("week_key", weekKey);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
