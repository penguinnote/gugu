import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

/**
 * 구구 챗봇 질문 횟수(2026-11-12) — DB 함수(20261112010000_chat_quota.sql)를 부르는 얇은 층. 세는 것은 전부 DB 가 한다.
 *   리더 한 달 20번(한국 시간 1일 0시 초기화) · 목사님은 세지 않는다 · 다 쓰면 추가 신청(첫 신청 +5, 그다음 운영자 승인)
 * 질문 하나: reserve(부르기 전 — 다 썼으면 AI 를 부르지 않는다) → commit(답을 받았을 때만 +1) / release(못 받았을 때)
 */

type Client = Awaited<ReturnType<typeof createClient>>;
export type ChatRequestStatus = Database["public"]["Enums"]["chat_request_status"];

/** 화면에 넘기는 이번 달 상태 — unlimited 면 숫자를 보이지 않는다 */
export type QuotaView = {
  unlimited: boolean;
  used: number;
  quota: number;
  canAuto: boolean;
  hasPending: boolean;
  lastStatus: ChatRequestStatus | null;
};

export async function loadQuota(supabase: Client): Promise<QuotaView | null> {
  const { data, error } = await supabase.rpc("chat_quota_status");
  const r = data?.[0];
  if (error || !r) return null;
  return { unlimited: r.unlimited, used: r.used, quota: r.quota, canAuto: r.can_auto, hasPending: r.has_pending, lastStatus: r.last_status ?? null };
}

export type Reserve =
  | { kind: "unlimited" }
  | { kind: "hold"; holdId: string; used: number; quota: number }
  | { kind: "exhausted"; used: number; quota: number }
  | { kind: "error" };

export async function reserveQuestion(supabase: Client): Promise<Reserve> {
  const { data, error } = await supabase.rpc("chat_quota_reserve");
  const r = data?.[0];
  if (error || !r) return { kind: "error" };
  if (r.unlimited) return { kind: "unlimited" };
  return r.hold_id ? { kind: "hold", holdId: r.hold_id, used: r.used, quota: r.quota } : { kind: "exhausted", used: r.used, quota: r.quota };
}

export async function commitQuestion(supabase: Client, holdId: string): Promise<{ used: number; quota: number } | null> {
  const { data, error } = await supabase.rpc("chat_quota_commit", { p_hold: holdId });
  const r = data?.[0];
  return error || !r ? null : { used: r.used, quota: r.quota };
}

export async function releaseQuestion(supabase: Client, holdId: string): Promise<void> {
  await supabase.rpc("chat_quota_release", { p_hold: holdId });
}
