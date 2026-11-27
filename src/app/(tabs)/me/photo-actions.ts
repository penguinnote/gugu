"use server";

import { revalidatePath } from "next/cache";

import { PHOTO_PREFIXES } from "@/lib/profile-photo";
import { createClient } from "@/lib/supabase/server";

/** 내 프로필 사진 저장(2026-11-11) — 브라우저가 줄인 data URL. 판정은 DB 함수가 한다 */
export async function saveProfilePhoto(image: unknown): Promise<{ ok: boolean; message?: string }> {
  const prefix = typeof image === "string" ? PHOTO_PREFIXES.find((p) => image.startsWith(p)) : undefined;
  if (typeof image !== "string" || !prefix || image.length > 420_000) return { ok: false, message: "사진을 읽지 못했어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_profile_photo", { p_image: image.slice(prefix.length) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/me");
  revalidatePath("/groups", "layout");
  return { ok: true };
}

export async function clearProfilePhoto(): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_profile_photo");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/me");
  revalidatePath("/groups", "layout");
  return { ok: true };
}
