"use server";

import { after } from "next/server";

import { loadQuota, type QuotaView } from "@/lib/ai/chat-quota";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MoreResult = { ok: true; quota: QuotaView } | { ok: false; message: string };

/**
 * 구구 챗봇 추가 신청(2026-11-12) — 다 썼을 때만. 그달 첫 신청은 바로 +5, 그다음은 운영자 승인 대기(사유 100자까지, 선택).
 * 판정은 request_chat_quota() 가 한다. 대기로 가면 운영자에게 웹 푸시(본인 빼고).
 */
export async function requestMoreChat(reason: string | null): Promise<MoreResult> {
  const me = await getUserContext();
  if (!me || !me.leadsGroup) return { ok: false, message: "목장 리더만 신청할 수 있어요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_chat_quota", { p_reason: reason?.trim().slice(0, 100) || null });
  const row = data?.[0];
  if (error || !row) return { ok: false, message: error?.message?.includes("이미") ? "이미 신청했어요. 운영자가 확인하면 알려 드려요." : "신청하지 못했어요. 잠시 뒤 다시 해 주세요." };
  if (row.status === "pending") {
    after(async () => {
      const { notifyChatQuotaRequest } = await import("@/lib/push/notify");
      await notifyChatQuotaRequest(row.request_id, me.userId).catch(() => null);
    });
  }
  const quota = await loadQuota(supabase);
  return quota ? { ok: true, quota } : { ok: false, message: "신청은 됐지만 횟수를 읽지 못했어요. 화면을 다시 열어 주세요." };
}
