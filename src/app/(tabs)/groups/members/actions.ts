"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth/session";
import { CARE_STATUS_LABELS } from "@/lib/labels";
import { explainDbError } from "@/lib/people-admin";
import { canAddTo, canChooseRole, canEditGroup, ministryDiff, validateRosterForm, type RosterForm, type RosterPersonEditRow } from "@/lib/roster-edit";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

type CareStatus = Database["public"]["Enums"]["care_status"];

export type MemberResult = { ok: true; id?: string } | { ok: false; message: string; conflict?: boolean };

const CONFLICT = "다른 분이 방금 고쳤습니다. 다시 열어 주세요.";
const EDIT_COLUMNS =
  "id, name, group_id, group_role, is_group_head, status, user_id, training_stage, birth_year, gender, occupation, affiliation, campus, attendance_off, youth_member, assembly_member, note, updated_at";

type Client = Awaited<ReturnType<typeof createClient>>;

/** DB 오류 → 사람 말. 권한 거부는 이 화면의 말로(운영자 화면의 '운영자만' 이 아니다) */
const explain = (code: string | null | undefined, message: string) =>
  code === "42501" ? "이 목장의 리더 · 목사님 · 운영자만 고칠 수 있습니다." : explainDbError(code, message);

/** 섬김 부서를 고른 그대로 맞춘다 — 뺄 것 지우고 넣을 것 넣기. 행 권한은 RLS(person_ministries)가 본다 */
async function syncMinistries(supabase: Client, personId: string, wanted: string[]): Promise<string | null> {
  const { data, error } = await supabase.from("person_ministries").select("ministry_id").eq("person_id", personId);
  if (error) return explain(error.code, error.message);
  const { add, remove } = ministryDiff((data ?? []).map((r) => r.ministry_id), wanted);
  if (remove.length) {
    const r = await supabase.from("person_ministries").delete().eq("person_id", personId).in("ministry_id", remove);
    if (r.error) return explain(r.error.code, r.error.message);
  }
  if (add.length) {
    const r = await supabase.from("person_ministries").insert(add.map((ministry_id) => ({ person_id: personId, ministry_id })));
    if (r.error) return explain(r.error.code, r.error.message);
  }
  return null;
}

/**
 * 명단 한 사람 고치기 — 자기 목장 리더 · 목사님 · 운영자. 열 때의 updated_at 과 같을 때만 쓴다(낙관적 잠금).
 * 사람 칸을 먼저 쓰고, 섬김 부서를 맞춘다. 고친 것은 전체 명단 · 명단 엑셀에 바로 나온다.
 */
export async function saveMember(personId: string, form: RosterForm, expectedUpdatedAt: string): Promise<MemberResult> {
  const me = await requireAppUser();
  const supabase = await createClient();
  const { data } = await supabase.from("persons").select(EDIT_COLUMNS).eq("id", personId).maybeSingle();
  const current = data as RosterPersonEditRow | null;
  if (!current || !canEditGroup(me, current.group_id)) return { ok: false, message: "고칠 수 없는 사람입니다." };
  if (current.updated_at !== expectedUpdatedAt) return { ok: false, conflict: true, message: CONFLICT };

  // 구분(리더 · 양)은 목사님 · 운영자만 바꾼다(2026-11-26) — 리더가 보낸 값은 무시하고 지금 값을 둔다
  const v = validateRosterForm(canChooseRole(me) ? form : { ...form, group_role: current.group_role }, Number(kstToday().slice(0, 4)), current);
  if (!v.ok) return v;

  // 목장장(2026-11-06) — 푸는 것은 사람 칸과 한 번에 쓴다(실패하면 함께 되돌아간다). 정하는 것은 쓴 뒤 set_group_head 로
  // (한 목장에 한 명). 정할 수 없는 사람이면 아무것도 쓰기 전에 말한다
  const headOn = form.is_group_head && !current.is_group_head;
  if (headOn && (current.status !== "active" || v.value.group_role !== "leader")) {
    return { ok: false, message: "목자는 활동 중인 리더만 될 수 있습니다." };
  }
  const patch = current.is_group_head && !form.is_group_head ? { ...v.value, is_group_head: false } : v.value;

  const { data: done, error } = await supabase
    .from("persons")
    .update(patch)
    .eq("id", personId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: explain(error.code, error.message) };
  if (!done) return { ok: false, conflict: true, message: CONFLICT };

  if (headOn) {
    const on = await supabase.rpc("set_group_head", { p_person_id: personId, p_on: true });
    // 사람 칸은 이미 저장됐다 — 다시 열어야 다음 저장이 '다른 분이 고쳤다' 로 막히지 않는다
    if (on.error) return { ok: false, conflict: true, message: `저장했지만 목자는 정하지 못했습니다. ${explain(on.error.code, on.error.message)}` };
  }

  const why = await syncMinistries(supabase, personId, form.ministries);
  if (why) return { ok: false, message: why };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** 인원 추가 — 운영자 · 목사님(구분을 골라 리더도, 2026-11-26), 그리고 자기 목장에 양을 넣는 리더. 들어온 날은 오늘(KST), 활동 */
export async function addMember(groupId: string, form: RosterForm, joinedWeek?: string): Promise<MemberResult> {
  const me = await requireAppUser();
  if (!canAddTo(me, groupId)) return { ok: false, message: "이 목장에는 사람을 넣을 수 없습니다." };
  const today = kstToday();
  const v = validateRosterForm(canChooseRole(me) ? form : { ...form, group_role: "member" }, Number(today.slice(0, 4)));
  if (!v.ok) return v;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("persons")
    // 지난 주 보고서에서 넣었으면 들어온 날을 그 주로(2026-11-06) — 데이터베이스가 이번 주 앞 3주 · 오늘 사이로 맞춘다
    .insert({ ...v.value, group_id: groupId, joined_at: joinedWeek && /^\d{4}-\d{2}-\d{2}$/.test(joinedWeek) && joinedWeek < today ? joinedWeek : today, status: "active" })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: explain(error.code, error.message) };
  const id = (data as { id: string } | null)?.id;
  if (!id) return { ok: false, message: "넣지 못했습니다." };

  const why = await syncMinistries(supabase, id, form.ministries);
  if (why) return { ok: false, message: `사람은 넣었지만 섬김 부서를 저장하지 못했습니다. ${why}` };

  revalidatePath("/", "layout");
  return { ok: true, id };
}

/**
 * 목장을 떠났어요 — 명단에서 빠진다(status = 'left'). 지난 기록은 남는다. 양만 — 리더는 계정 · 목장장이 얽혀 운영자가 한다.
 * 운영자 · 목사님은 사람 화면(운영)에서 상태를 고친다.
 */
export async function markLeft(personId: string, expectedUpdatedAt: string): Promise<MemberResult> {
  const me = await requireAppUser();
  const supabase = await createClient();
  const { data } = await supabase.from("persons").select("id, group_id, group_role, status, updated_at").eq("id", personId).maybeSingle();
  if (!data || !canEditGroup(me, data.group_id)) return { ok: false, message: "고칠 수 없는 사람입니다." };
  if (data.group_role !== "member") return { ok: false, message: "리더가 목장을 떠나면 운영자에게 알려 주세요." };
  if (data.updated_at !== expectedUpdatedAt) return { ok: false, conflict: true, message: CONFLICT };

  const { data: done, error } = await supabase
    .from("persons")
    .update({ status: "left" })
    .eq("id", personId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: explain(error.code, error.message) };
  if (!done) return { ok: false, conflict: true, message: CONFLICT };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 떠났어요 되돌리기(2026-11-05) — 잘못 눌렀을 때 바로 되돌린다. 떠난 사람은 고치는 화면이 없어 예전엔 운영자만 살릴 수 있었다.
 * 명단 위 '되돌리기'(undo-left.tsx)가 부른다. 리더는 자기 목장 양만.
 */
export async function undoLeftById(personId: string): Promise<MemberResult> {
  const me = await requireAppUser();
  const supabase = await createClient();
  const { data } = await supabase.from("persons").select("id, group_id, group_role, status").eq("id", personId).maybeSingle();
  if (!data || !canEditGroup(me, data.group_id) || data.group_role !== "member" || data.status !== "left") {
    return { ok: false, message: "되돌릴 수 없습니다." };
  }
  const { error } = await supabase.from("persons").update({ status: "active" }).eq("id", personId).eq("status", "left");
  if (error) return { ok: false, message: explain(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 마을 — 목장에 붙는다. set_group_village 가 그 목장 리더 · 목사님 · 운영자인지 본다 */
export async function saveVillage(groupId: string, village: string): Promise<MemberResult> {
  const me = await requireAppUser();
  if (!canEditGroup(me, groupId)) return { ok: false, message: "이 목장의 마을은 바꿀 수 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_group_village", { p_group_id: groupId, p_village: village });
  if (error) return { ok: false, message: explain(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 상태 바꾸기(2026-11-17 — 휴면 신청을 없앴다) — 그 목장 리더 · 목사님 · 운영자가 양을 활동 ↔ 휴면으로 바로.
 * 리더 자신의 상태 · 기록 제외 · 떠남은 여기서 다루지 않는다(DB 트리거도 막는다)
 */
export async function setPersonStatus(personId: string, status: "active" | "dormant"): Promise<MemberResult> {
  const me = await requireAppUser();
  if (status !== "active" && status !== "dormant") return { ok: false, message: "바꿀 수 없는 상태입니다." };
  const supabase = await createClient();
  const { data } = await supabase.from("persons").select("group_id, group_role, status").eq("id", personId).maybeSingle();
  if (!data || !canEditGroup(me, data.group_id) || data.group_role !== "member" || (data.status !== "active" && data.status !== "dormant")) {
    return { ok: false, message: "이분의 상태는 바꿀 수 없습니다." };
  }
  if (data.status === status) return { ok: true };
  const { error } = await supabase.from("persons").update({ status }).eq("id", personId).in("status", ["active", "dormant"]);
  if (error) return { ok: false, message: explain(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 판정 태그 바꾸기(2026-11-17 — 예전엔 운영자만) — 그 목장 리더 · 목사님 · 운영자 */
export async function setCareStatus(personId: string, careStatus: CareStatus): Promise<MemberResult> {
  const me = await requireAppUser();
  if (!(careStatus in CARE_STATUS_LABELS)) return { ok: false, message: "없는 판정 태그입니다." };
  const supabase = await createClient();
  const { data } = await supabase.from("persons").select("group_id, status").eq("id", personId).maybeSingle();
  if (!data || !canEditGroup(me, data.group_id) || data.status === "left") return { ok: false, message: "이분의 판정 태그는 바꿀 수 없습니다." };
  const { error } = await supabase.from("persons").update({ care_status: careStatus }).eq("id", personId);
  if (error) return { ok: false, message: explain(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 다른 목장으로 옮기기(2026-11-06) — 목사님 · 운영자. 계정이 연결된 리더는 운영자 화면에서 */
export async function movePerson(personId: string, groupId: string): Promise<MemberResult> {
  await requireAppUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_person_group", { p_person_id: personId, p_group_id: groupId });
  if (error) return { ok: false, message: explain(error.code, error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}
