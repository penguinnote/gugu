"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { explainDbError, validateNewPerson, type NewPersonInput } from "@/lib/people-admin";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

export type RegisterResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Step 11 새 사람 등록 — 운영자만(persons_insert 정책과 같은 규칙). 들어온 날은 오늘(KST) — 4주 동안 '신규' 로
 * 보이고 돌봄 판정은 '아직 판정 전'. 같은 목장 동명이인·이름 꼴은 DB 가 다시 본다(persons_unique_name_in_group ·
 * persons_name_ck) — 걸리면 말로 바꿔 돌려준다.
 */
export async function registerPerson(input: NewPersonInput): Promise<RegisterResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: groups } = await supabase.from("groups").select("id").eq("status", "active");
  const today = kstToday();
  const v = validateNewPerson(input, ((groups ?? []) as { id: string }[]).map((g) => g.id), Number(today.slice(0, 4)));
  if (!v.ok) return v;

  const { data, error } = await supabase
    .from("persons")
    .insert({ ...v.value, joined_at: today, status: "active" })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  if (!data) return { ok: false, message: "등록하지 못했습니다." };

  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id };
}
