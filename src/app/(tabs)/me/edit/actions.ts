"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** 소개 · 말씀 · 관심사 저장(2026-11-11) — 판정(길이 · 개수 · 본인 칸)은 DB 함수 set_my_profile 이 한다 */
export async function saveMyProfile(bio: string, verse: string, interests: string[]): Promise<{ ok: boolean; message?: string }> {
  if (typeof bio !== "string" || typeof verse !== "string" || !Array.isArray(interests) || interests.some((t) => typeof t !== "string")) {
    return { ok: false, message: "값이 올바르지 않습니다." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_profile", { p_bio: bio, p_verse: verse, p_interests: interests.slice(0, 5) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/me");
  revalidatePath("/profile", "layout");
  return { ok: true };
}
