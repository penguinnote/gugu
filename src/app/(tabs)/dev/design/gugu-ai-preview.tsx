"use client";

import type { ComponentProps } from "react";

import { GuguChat, type ChatSend, type RequestMore } from "@/components/ai/gugu-chat";
import type { QuotaView } from "@/lib/ai/chat-quota";
import { PersonFlowCard } from "@/components/ai/person-flow-card";
import { ProfileForm } from "../../groups/[name]/edit/profile-form";
import { ReportForm } from "../../reports/report-form";

/**
 * 구구 AI 미리보기(2026-11-12, 개발 서버만) — 서버 · Claude 를 부르지 않고 지어낸 답으로 화면을 그린다. 이름은 모두 지어낸 것.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeSend: ChatSend = async (turns, onEvent) => {
  const q = turns.at(-1)?.text ?? "";
  await wait(400);
  onEvent({ t: "s", v: q.includes("마감") ? "찾는 중…" : "기록을 찾는 중…" });
  await wait(700);
  const answer = q.includes("마감")
    ? "목장보고서 마감은 화요일 밤 12시(수요일 0시)예요. 마감 전에 내면 연속 제출이 이어지고 목장 열매가 쌓여요."
    : "최근 4주를 보면 결석이 이어지는 사람이 두 명 있어요.\n- 박다솜: 2주 연속 예배 결석, 개별 연락으로 교제는 지난주에 있었어요\n- 정마루: 4주 동안 목장 불참이에요\n두 사람 모두 기도제목은 취업 준비 이야기였어요.";
  for (const w of answer.split(/(?<= )/)) {
    onEvent({ t: "d", v: w });
    await wait(35);
  }
  onEvent({ t: "end" });
};

/**
 * 질문 횟수 미리보기 — quota: 12(12/20) · full(20/20, 첫 신청 → 바로 +5) · again(25/25, 두 번째 → 사유 · 신청됨) · pending(신청됨) · rejected
 */
const QUOTA: Record<string, QuotaView> = {
  "12": { unlimited: false, used: 12, quota: 20, canAuto: true, hasPending: false, lastStatus: null },
  full: { unlimited: false, used: 20, quota: 20, canAuto: true, hasPending: false, lastStatus: null },
  again: { unlimited: false, used: 25, quota: 25, canAuto: false, hasPending: false, lastStatus: "auto" },
  pending: { unlimited: false, used: 25, quota: 25, canAuto: false, hasPending: true, lastStatus: "pending" },
  rejected: { unlimited: false, used: 25, quota: 25, canAuto: false, hasPending: false, lastStatus: "rejected" },
};
const fakeMore: RequestMore = async () => {
  await wait(600);
  return { ok: true, quota: { unlimited: false, used: 20, quota: 25, canAuto: false, hasPending: false, lastStatus: "auto" } };
};
const fakeMorePending: RequestMore = async () => {
  await wait(600);
  return { ok: true, quota: { unlimited: false, used: 25, quota: 25, canAuto: false, hasPending: true, lastStatus: "pending" } };
};

export function GuguChatPreview({ quota }: { quota?: string }) {
  const q = quota ? (QUOTA[quota] ?? null) : null;
  return (
    <GuguChat
      key={quota ?? "none"}
      storageKey={`gg-gugu-chat:dev-${quota ?? "none"}`}
      send={fakeSend}
      quota={q}
      requestMore={q?.canAuto ? fakeMore : fakeMorePending}
      back="/dev/design"
      suggestions={["우리 목장 이번 주 목장보고서 정리해 줘", "요즘 결석이 이어지는 사람 있어?", "챙김이 필요한 양 알려 줘", "목장보고서 마감이 언제야?"]}
    />
  );
}

export function PersonFlowPreview({ fail = false }: { fail?: boolean }) {
  return (
    <PersonFlowCard
      personId="c"
      action={async () => {
        await wait(1200);
        return fail
          ? { ok: false, message: "AI가 답하지 못했어요. 잠시 뒤 다시 해 주세요." }
          : {
              ok: true,
              text: "박다솜은 9월까지 현장 예배와 목장에 꾸준히 나왔지만, 최근 4주 중 3주는 온라인 예배였고 목장은 두 번 빠졌어요. 리더의 개별 연락으로 교제는 거의 매주 이어졌어요. 기도제목은 여름부터 취업 준비가 계속 이어졌고, 최근에는 면접을 앞둔 긴장과 가족 건강 이야기가 더해졌어요.",
            };
      }}
    />
  );
}

/** 보고서 받아쓰기 미리보기 — 메모를 넣고 '나눠 보기' 를 누르면 지어낸 결과 */
export function ReportMemoPreview(props: Omit<ComponentProps<typeof ReportForm>, "memoFill">) {
  return (
    <ReportForm
      {...props}
      memoFill={async () => {
        await wait(1200);
        return {
          ok: true,
          prayers: [
            { personId: "b", prayer: "이사 준비가 잘 마무리되도록" },
            { personId: "c", prayer: "다음 주 면접에서 떨지 않고 준비한 만큼 말할 수 있도록" },
            { personId: "d", prayer: "시험 기간에 건강 지키고 집중할 수 있도록" },
          ],
          note: "다음 주는 카페에서 모이기로 했어요. 새 친구 한 명이 함께했어요.",
        };
      }}
    />
  );
}

/** 목장 프로필 편집 미리보기(2026-11-18) — 빈 칸의 예시 문구 · 칸 이름을 본다. 저장은 서버를 부르지 않는다 */
export function ProfileFormPreview({ today }: { today: string }) {
  return (
    <ProfileForm
      save={async () => ({ ok: false, message: "미리보기에서는 저장하지 않습니다." })}
      doneHref="/dev/design?screen=groups"
      initial={{ intro: "", freeText: "", ddays: [], themeSongs: [] }}
      expectedUpdatedAt={null}
      today={today}
    />
  );
}
