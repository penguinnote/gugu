"use server";

import { redirect } from "next/navigation";

import { getUserContext, homeFor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * 첫 접속 동의(2026-11-13) — 지금 문구 버전으로 남기고 원래 갈 곳으로(신청 전이면 /apply).
 * ai — 선택 항목(명단과 연결된 계정만, null 이면 건드리지 않는다). 내 명단 행의 AI 동의를 켜거나 끈다.
 */
export async function agreeTerms(ai: boolean | null): Promise<{ ok: false; message: string }> {
  const me = await getUserContext();
  if (!me) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.rpc("agree_terms", { p_version: TERMS_VERSION });
  if (error) return { ok: false, message: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  if (typeof ai === "boolean" && me.personId && me.role !== "pending") {
    const { error: aiError } = await supabase.rpc("set_my_ai_consent", { p_on: ai });
    if (aiError) return { ok: false, message: "AI 선택을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  }
  redirect(homeFor(me));
}
