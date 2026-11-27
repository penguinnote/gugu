import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuguChat } from "@/components/ai/gugu-chat";
import { loadQuota } from "@/lib/ai/chat-quota";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { requestMoreChat } from "./actions";

export const metadata: Metadata = {
  title: "구구에게 물어보기 · 구구",
};

/** 처음 화면의 물어볼 거리 — 역할마다 */
const SUGGEST = {
  leader: ["우리 목장 이번 주 목장보고서 정리해 줘", "요즘 결석이 이어지는 사람 있어?", "챙김이 필요한 양 알려 줘", "목장보고서 마감이 언제야?"],
  pastor: ["이번 주 아직 안 낸 목장은?", "챙김이 필요한 양 알려 줘", "지난주 기도제목 모아 줘", "이번 주 출석 몇 명이야?"],
};

/**
 * 구구 챗봇(2026-11-12) — 탭바 옆 구구 단추 · 전체 메뉴 맨 위 '구구에게 물어보기' 에서 연다. 탭 그룹 밖이라 탭바가 없다(입력 칸이 아래).
 * 리더(자기 목장) · 목사님만, 구구 AI 가 켜져 있을 때만. 대화는 이 폰에만(계정마다 따로).
 */
export default async function GuguPage() {
  const me = await requireAppUser();
  if (!(me.leadsGroup || me.role === "pastor") || !guguAiEnabled()) notFound();
  // 이번 달 질문 횟수(2026-11-12) — 리더만 숫자 · 소진 카드. 목사님은 unlimited
  const quota = await loadQuota(await createClient());
  return (
    <GuguChat
      storageKey={`gg-gugu-chat:${me.userId}`}
      suggestions={me.role === "pastor" ? SUGGEST.pastor : SUGGEST.leader}
      quota={quota}
      requestMore={requestMoreChat}
    />
  );
}
