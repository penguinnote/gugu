"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { notifyApplication, notifyNameTaken } from "@/lib/push/notify";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

/** 신청이 들어갔으면 운영자에게 알린다(2026-11-05) — 응답 뒤에, 실패해도 신청은 그대로 */
async function tellAdmins() {
  const me = await getUserContext();
  if (!me) return;
  after(() => notifyApplication(me.userId, kstToday()).then(() => undefined, () => undefined));
}

/**
 * 신청 제출. 실제 검증(pending 인가, 대상이 미연결인가, 대기 건이 이미
 * 있는가)은 전부 apply_for_person() 안에서 한다. 여기서는 값을 넘기고
 * 결과에 따라 화면만 고른다.
 */
export async function submitApplication(formData: FormData) {
  const personId = String(formData.get("person_id") ?? "");
  const group = String(formData.get("group") ?? "");

  if (!personId) redirect(`/apply?mode=leader&group=${encodeURIComponent(group)}&error=pick`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_for_person", { p_person_id: personId });

  // 실패하면 고른 사람을 같이 돌려보낸다 — 그 이름이 점유돼 있으면 화면이
  // "처음 쓴 로그인 방법으로" 안내를 띄우고, 아니면 일반 오류를 보인다.
  if (error) {
    redirect(
      `/apply?mode=leader&group=${encodeURIComponent(group)}&claimed=${encodeURIComponent(personId)}&error=apply`,
    );
  }
  await tellAdmins();
  redirect("/apply");
}

/**
 * 목사님 신청(2026-10-30). 임원진 신청은 없앴다(2026-11-16).
 * 나머지 검증은 request_role() 안에서 한다.
 */
export async function submitRoleRequest(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const personId = String(formData.get("person_id") ?? "") || null;
  const group = String(formData.get("group") ?? "");
  // 임원진은 신청으로 받지 않는다(2026-11-16) — 운영자가 '계정 권한' 에서 리더에게 맡긴다
  if (role !== "pastor") redirect("/apply");

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_role", personId ? { p_role: role, p_person_id: personId } : { p_role: role });
  if (error) {
    const back = personId
      ? `/apply?mode=${role}&group=${encodeURIComponent(group)}&claimed=${encodeURIComponent(personId)}&error=apply`
      : `/apply?mode=${role}&error=apply`;
    redirect(back);
  }
  await tellAdmins();
  redirect("/apply");
}

/** 신청 취소(2026-11-05) — 이름을 잘못 골랐을 때 다시 고른다 */
export async function cancelApplication() {
  const supabase = await createClient();
  await supabase.rpc("cancel_my_application");
  redirect("/apply");
}

/**
 * '제 이름이 아니에요'(2026-11-06) — 고른 이름이 이미 다른 계정에 연결돼 있는데 본인이 아니라고 한다.
 * 운영자에게 알린다(이름 없이). 운영자는 명단 관리에서 연결을 풀어 준다.
 */
export async function reportNameTaken(formData: FormData) {
  const group = String(formData.get("group") ?? "");
  const mode = String(formData.get("mode") ?? "leader") || "leader";
  const personId = String(formData.get("person_id") ?? "");
  const me = await getUserContext();
  if (me) after(() => notifyNameTaken(me.userId, kstToday()).then(() => undefined, () => undefined));
  redirect(`/apply?mode=${encodeURIComponent(mode)}&group=${encodeURIComponent(group)}&claimed=${encodeURIComponent(personId)}&reported=1`);
}
