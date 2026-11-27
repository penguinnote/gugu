"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { explainDbError } from "@/lib/people-admin";
import { createClient } from "@/lib/supabase/server";

export type ConsentSave = { ok: true; on: number; off: number } | { ok: false; message: string };

const MAX = 500;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * AI 동의 한꺼번에(2026-11-13) — 동의서의 'AI 정리를 위한 해외 서버 사용' 항목을 받은 사람은 켜고(동의일 = 지금, 이미 켠 사람은 날짜 그대로), 철회한 사람은 끈다.
 * 바뀐 사람만 넘어온다. 운영자만 — DB 의 persons_staff_only 도 목사님 · 운영자만 받는다.
 */
export async function saveAiConsents(on: string[], off: string[]): Promise<ConsentSave> {
  await requireRole("admin");
  if (!Array.isArray(on) || !Array.isArray(off) || !on.every(isId) || !off.every(isId) || on.length + off.length > MAX) {
    return { ok: false, message: "고른 사람이 올바르지 않습니다." };
  }
  if (on.some((id) => off.includes(id))) return { ok: false, message: "같은 사람을 켜고 끌 수 없습니다." };
  const supabase = await createClient();
  if (on.length) {
    const { error } = await supabase.from("persons").update({ ai_consented_at: new Date().toISOString() }).in("id", on).is("ai_consented_at", null);
    if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  }
  if (off.length) {
    const { error } = await supabase.from("persons").update({ ai_consented_at: null }).in("id", off);
    if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  }
  revalidatePath("/admin/people/ai-consent");
  return { ok: true, on: on.length, off: off.length };
}
