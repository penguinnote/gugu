import "server-only";

import { cache } from "react";

import type { UserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 메뉴의 빨간 숫자 — 승인 대기(가입 + 구구 챗봇 추가 신청). 운영자(겸 리더 포함)만 묻는다.
 * '전체' 화면과 넓은 화면 왼쪽 메뉴(탭 레이아웃)가 같이 쓴다 — 한 요청 안에서는 한 번만 묻는다(cache, 2026-11-27).
 */
export const loadMenuPending = cache(async (role: UserContext["role"]): Promise<number> => {
  if (role !== "admin") return 0;
  const supabase = await createClient();
  const [{ count }, { data: chat }] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.rpc("chat_quota_pending_count"),
  ]);
  return (count ?? 0) + (chat ?? 0);
});
