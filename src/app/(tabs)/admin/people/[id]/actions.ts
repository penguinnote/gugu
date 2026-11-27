"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { explainDbError, validatePatch, type PersonAdminRow, type PersonPatch } from "@/lib/people-admin";
import { createClient } from "@/lib/supabase/server";

export type PersonResult = { ok: true } | { ok: false; message: string; conflict?: boolean };

const CONFLICT = "다른 운영자가 방금 고쳤습니다. 다시 열어 주세요.";

/**
 * A-1 사람 수정 — 운영자만. 열 때의 updated_at 과 같을 때만 쓴다(낙관적 잠금).
 *   · 기록 제외 ↔ 활동 은 set_person_recording 으로 (과거 기록은 건드리지 않는다, 09 §1.5)
 *   · 목장장 지정은 그 목장의 기존 목장장을 먼저 내린다 (목장당 한 명 — 인덱스)
 *   · 나머지는 한 번의 update. DB 가 거부하면 말로 바꿔 돌려준다(explainDbError)
 */
export async function updatePerson(personId: string, patch: PersonPatch, expectedUpdatedAt: string): Promise<PersonResult> {
  await requireRole("admin");
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("persons")
    .select("id, name, group_id, group_role, is_group_head, status, care_status, needs_check, user_id, birth_year, updated_at")
    .eq("id", personId)
    .maybeSingle();
  if (!current) return { ok: false, message: "명단에 없는 사람입니다." };
  if (current.updated_at !== expectedUpdatedAt) return { ok: false, conflict: true, message: CONFLICT };

  const row: PersonAdminRow = current;
  const why = validatePatch(row, patch);
  if (why) return { ok: false, message: why };

  // 기록 제외는 함수로만. 상태 컬럼엔 그 외 값만 직접 쓴다.
  const optOutChange =
    patch.status === "opted_out" && row.status !== "opted_out" ? "off" : row.status === "opted_out" && patch.status !== "opted_out" ? "on" : null;
  if (optOutChange) {
    const { error } = await supabase.rpc("set_person_recording", { p_person_id: personId, p_recording: optOutChange === "on" });
    if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  }

  if (patch.is_group_head && !(row.is_group_head && row.group_id === patch.group_id)) {
    const { error } = await supabase.from("persons").update({ is_group_head: false }).eq("group_id", patch.group_id).eq("is_group_head", true);
    if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  }

  const update: Partial<PersonPatch> = {
    group_id: patch.group_id,
    group_role: patch.group_role,
    is_group_head: patch.is_group_head,
    care_status: patch.care_status,
    needs_check: patch.needs_check,
  };
  if (!optOutChange && patch.status !== "opted_out") update.status = patch.status;

  const { data, error } = await supabase
    .from("persons")
    .update(update)
    .eq("id", personId)
    .eq("updated_at", optOutChange ? (await currentStamp(supabase, personId)) : expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  if (!data) return { ok: false, conflict: true, message: CONFLICT };

  revalidatePath("/", "layout");
  return { ok: true };
}

async function currentStamp(supabase: Awaited<ReturnType<typeof createClient>>, personId: string): Promise<string> {
  const { data } = await supabase.from("persons").select("updated_at").eq("id", personId).maybeSingle();
  return data?.updated_at ?? "";
}

/** 계정 연결 해제 — unlink_person_account. disable 이면 남의 계정이었던 경우로 보고 잠근다(04 §3.3). */
export async function unlinkAccount(personId: string, disable: boolean): Promise<PersonResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_person_account", { p_person_id: personId, p_disable: disable });
  if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * AI 동의(2026-11-13 옵트인) — 청년 동의서의 'AI 정리를 위한 해외 서버 사용' 항목을 받았으면 켠다(동의일 = 지금), 철회하면 끈다.
 * 동의일이 없으면 DB 가 ai_excluded 를 켜 두므로 그 사람 글은 AI 로 가지 않고 글 속 이름도 지운다. 끄면 지난 AI 정리도 소급해 지운다.
 */
export async function setAiConsent(personId: string, consented: boolean): Promise<PersonResult & { at?: string | null }> {
  await requireRole("admin");
  const supabase = await createClient();
  const at = consented ? new Date().toISOString() : null;
  const { error } = await supabase.from("persons").update({ ai_consented_at: at }).eq("id", personId);
  if (error) return { ok: false, message: explainDbError(error.code, error.message) };
  revalidatePath(`/admin/people/${personId}`);
  return { ok: true, at };
}

/**
 * 임원진 맡기기 · 그만두기(2026-11-26) — 명단 화면에서. 계정 권한의 '임원진 맡기기' · '임원진 그만두기' 와 같은 admin_update_account 를 부른다.
 * 앱 계정이 연결된 사람만(목장 리더에게만 — 함수가 본다).
 */
export async function setOfficer(personId: string, on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: p } = await supabase.from("persons").select("user_id").eq("id", personId).maybeSingle();
  if (!p?.user_id) return { ok: false, message: "앱 계정이 연결된 사람만 맡길 수 있어요" };
  const { error } = await supabase.rpc("admin_update_account", { p_user_id: p.user_id, p_action: on ? "officer_on" : "officer_off" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
