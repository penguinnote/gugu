"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** 내 AI 동의(2026-11-13) — 명단과 연결된 계정이 자기 행만. 끄면 내가 들어간 지난 AI 정리도 지워진다(DB 소급) */
export async function setMyAiConsent(on: boolean): Promise<{ ok: true; at: string | null } | { ok: false; message: string }> {
  const me = await requireAppUser();
  if (!me.personId) return { ok: false, message: "명단과 연결된 계정만 바꿀 수 있습니다." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_my_ai_consent", { p_on: on });
  if (error) return { ok: false, message: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  revalidatePath("/me/consent");
  return { ok: true, at: data ?? null };
}
