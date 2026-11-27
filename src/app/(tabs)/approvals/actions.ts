"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { bulkApprovePlan } from "@/lib/bulk-approve";
import { createClient } from "@/lib/supabase/server";

/**
 * 승인·거절. 권한 검사는 approve_application() / reject_application() 안에서
 * 한다 — 해당 목장의 리더, 목사님, 운영자만 통과한다. 여기서는 결과만 전달한다.
 */
export async function decideApplication(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approve" && decision !== "reject")) redirect("/approvals?error=input");

  const supabase = await createClient();
  const { error } =
    decision === "approve"
      ? await supabase.rpc("approve_application", { p_application_id: id })
      : await supabase.rpc("reject_application", { p_application_id: id });

  revalidatePath("/approvals");
  if (error) redirect("/approvals?error=decide");
  redirect(`/approvals?done=${decision}`);
}

/**
 * 모두 승인(2026-11-26) — 리더 신청 중 한꺼번에 승인할 수 있는 것만(lib/bulk-approve). 목록은 여기서 다시 읽는다(화면이 본 뒤 바뀌었을 수 있다).
 * 한 건씩 approve_application() 을 부르고, 실패한 건은 대기로 남는다.
 */
export async function approveAllLeaders() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_pending_applications");
  const { approve } = bulkApprovePlan(data ?? []);
  let ok = 0;
  for (const id of approve) {
    const { error } = await supabase.rpc("approve_application", { p_application_id: id });
    if (!error) ok += 1;
  }
  revalidatePath("/approvals");
  redirect(`/approvals?done=bulk&n=${ok}${approve.length > ok ? `&fail=${approve.length - ok}` : ""}`);
}

/**
 * 구구 챗봇 추가 신청 처리(2026-11-12) — amount 5 · 10 · 20 이면 승인, reject 면 거절. 권한(운영자 · 본인 신청 아님)은
 * decide_chat_quota_request() 가 본다. 처리하면 신청한 리더에게 웹 푸시.
 */
export async function decideChatQuota(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const pick = String(formData.get("amount") ?? "");
  const amount = pick === "reject" ? null : Number(pick);
  if (!id || (amount !== null && ![5, 10, 20].includes(amount))) redirect("/approvals?error=input");

  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("decide_chat_quota_request", { p_id: id, p_amount: amount });
  revalidatePath("/approvals");
  if (error || !userId) redirect("/approvals?error=chat");
  after(async () => {
    const { notifyChatQuotaDecision } = await import("@/lib/push/notify");
    await notifyChatQuotaDecision(id, userId, amount).catch(() => null);
  });
  redirect(`/approvals?done=${amount === null ? "chat-reject" : "chat-approve"}`);
}
