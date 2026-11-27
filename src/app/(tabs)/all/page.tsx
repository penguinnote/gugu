import type { Metadata } from "next";

import { aiDigestEnabled } from "@/lib/ai/digest";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { allMenuFor } from "@/lib/all-menu";
import { requireAppUser } from "@/lib/auth/session";
import { loadMenuPending } from "@/lib/menu-badges";
import { currentWeekKey } from "@/lib/week";

import { AllMenu } from "./all-menu";

export const metadata: Metadata = {
  title: "전체 · 구구",
};

/**
 * '전체' 탭(2026-11-10) — 토스 '전체' 화면처럼. 맨 위 내 이름, 검색, 흰 카드 안에 묶음별 메뉴 줄.
 * 홈의 바로가기 칸을 없애고 갈 곳을 모두 여기 모았다(lib/all-menu.ts). 상점도 탭바에서 여기로 옮겼다.
 */
export default async function Page() {
  const me = await requireAppUser();
  // 승인 대기 수 — 운영자(겸 리더 포함)만 묻는다. '승인' 아이콘의 빨간 숫자. 구구 챗봇 추가 신청 대기도 더한다(2026-11-12 — 같은 승인 화면에서 처리)
  const pending = await loadMenuPending(me.role);
  return <AllMenu name={me.displayName} diag={me.role === "admin"} sections={allMenuFor(me, { pending, ai: guguAiEnabled(), digest: aiDigestEnabled(), week: currentWeekKey() })} />;
}
