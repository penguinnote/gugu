"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ACTIONS = ["pastor_off", "officer_on", "officer_off", "lock", "unlock"] as const;

/** 계정 권한 고치기(2026-11-05) — 검증(운영자만, 자기 자신 · 운영자 계정 제외)은 admin_update_account 안에서 한다 */
export async function updateAccount(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!id || !(ACTIONS as readonly string[]).includes(action)) redirect("/admin/accounts?error=1", RedirectType.replace);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_account", { p_user_id: id, p_action: action });
  revalidatePath("/", "layout");
  // 같은 화면을 갈아 끼운다 — 단추마다 뒤로가기 기록이 쌓이지 않게(2026-11-06)
  redirect(error ? "/admin/accounts?error=1" : `/admin/accounts?done=${action}`, RedirectType.replace);
}
