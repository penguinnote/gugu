/**
 * 알림 문구 — 한 곳(PRD §6.4). 잠금 화면에 그대로 뜨므로 **기도제목·이름 목록 같은 내용은 넣지 않는다.**
 * 목장 이름과 할 일만. 누르면 열릴 경로(url)를 같이 둔다.
 */

import { josaFor } from "@/lib/ai/josa";
import { REPORT_STAMP_LABELS, groupLabel } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { formatWeekLabel } from "@/lib/week";

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** 월요일 — 마감 전날. 같은 목장 리더 전원이 같은 문구를 받는다 */
export function reminderMessage(groupName: string, weekKey: string): PushPayload {
  return {
    title: `${groupLabel(groupName)}보고서`,
    body: `${formatWeekLabel(weekKey)} 목장보고서가 아직 제출되지 않았습니다. 마감은 내일(화) 밤 11시 59분입니다.`,
    url: `/reports/${weekKey}`,
    tag: `reminder-${weekKey}`,
  };
}

/** 제출 완료 — 같은 목장의 다른 리더에게. 중복 작성과 재알림을 막는다(PRD §6.4) */
export function submittedMessage(submitterName: string, groupName: string, weekKey: string): PushPayload {
  return {
    title: `${groupLabel(groupName)}보고서 제출`,
    body: `${submitterName} 리더가 ${formatWeekLabel(weekKey)} 목장보고서를 제출했습니다.`,
    url: `/reports/${weekKey}`,
    tag: `submitted-${weekKey}`,
  };
}

/**
 * 목장보고서 제출 → 목사님(2026-11-26 사용자 결정). 처음 제출할 때 한 번 — 다시 내거나 고쳐 내도 다시 보내지 않는다.
 * 마감 뒤에 늦게 낸 것도 보낸다. 누르면 그 보고서 화면.
 */
export function pastorSubmittedMessage(groupName: string, weekKey: string): PushPayload {
  return {
    title: "목장보고서 제출",
    body: `${groupLabel(groupName)}이 목장보고서를 제출하였습니다.`,
    url: `/pastor/reports/${encodeURIComponent(groupName)}?week=${weekKey}`,
    tag: `pastor-submitted-${weekKey}-${groupName}`,
  };
}

/** 목사님 스탬프 — 목장 리더 전원에게. "본 흔적이 리더에게 닿는가" (02 §3.2) */
export function stampedMessage(
  groupName: string,
  weekKey: string,
  stamp: Database["public"]["Enums"]["report_stamp"],
): PushPayload {
  return {
    title: `${groupLabel(groupName)}보고서`,
    body: `목사님이 ${formatWeekLabel(weekKey)} 목장보고서를 확인하셨습니다 · "${REPORT_STAMP_LABELS[stamp]}"`,
    url: `/reports/${weekKey}`,
    tag: `stamped-${weekKey}`,
  };
}

/** 이름 확인 요청 — 운영자에게(2026-11-06). 고른 이름에 다른 계정이 들어가 있다고 한다. 이름 없이 */
export function nameTakenMessage(): PushPayload {
  return { title: "이름 확인 요청", body: "신청 화면에서 '제 이름이 아니에요'가 왔습니다. 명단의 계정 연결을 확인해 주세요.", url: "/admin/people", tag: "name-taken" };
}

/** 새 신청 — 운영자에게(2026-11-05). 이름 없이 */
export function applicationMessage(): PushPayload {
  return { title: "승인 대기", body: "새 신청이 왔습니다. 확인해 주세요.", url: "/approvals", tag: "application" };
}

/** 수요일 아침 — 마감 직후 목사님께 지난주 보고서 정리(2026-11-05). 숫자만, 이름 · 기도제목은 없다 */
export function digestMessage(weekKey: string, submitted: number, total: number): PushPayload {
  const missing = total - submitted;
  return {
    title: `${formatWeekLabel(weekKey)} 목장보고서 정리`,
    body: `${total}목장 중 ${submitted}곳 제출${missing > 0 ? ` · 미제출 ${missing}곳` : ""}. 챙김이 필요한 양과 기도제목도 모아 두었습니다.`,
    url: `/pastor?week=${weekKey}`,
    tag: `digest-${weekKey}`,
  };
}

/**
 * 목사님 한마디(2026-11-10) — 목장 리더 전원에게. 잠금 화면에 뜨므로 **한마디 글은 싣지 않는다**(이름 · 사정이 들어 있을 수 있다).
 * 누르면 홈 — 카드 안에 한마디가 크게 보인다
 */
export function notedMessage(groupName: string, weekKey: string): PushPayload {
  return {
    title: `${groupLabel(groupName)}보고서`,
    body: `목사님이 ${formatWeekLabel(weekKey)} 목장보고서에 한마디를 남기셨어요.`,
    url: "/",
    tag: `noted-${weekKey}`,
  };
}

/** 구구 챗봇 추가 신청(대기) — 운영자에게(2026-11-12). 이름 · 사유 없이 */
export function chatQuotaRequestMessage(): PushPayload {
  return { title: "구구 챗봇 추가 신청", body: "질문 추가 신청이 왔습니다. 확인해 주세요.", url: "/approvals", tag: "chat-quota-request" };
}

/** 구구 챗봇 추가 신청 결과 — 신청한 리더에게(2026-11-12) */
export function chatQuotaDecisionMessage(amount: number | null): PushPayload {
  return amount
    ? { title: "구구 챗봇", body: `질문 추가가 승인됐어요. 이번 달 ${amount}번 더 물을 수 있어요.`, url: "/gugu", tag: "chat-quota-decision" }
    : { title: "구구 챗봇", body: "이번 질문 추가 신청은 어려워요. 다음 달에 다시 20번 물을 수 있어요.", url: "/gugu", tag: "chat-quota-decision" };
}

/**
 * 목장 이동 신청(2026-11-26) → 받는 쪽 목장 리더(그 목장에 앱 쓰는 리더가 없으면 목사님).
 *   보내기(push)  "OO 목장에서 김하늘 님의 목장 이동을 신청했어요"
 *   데려오기(pull) "OO 목장에서 김하늘 님을 데려가고 싶다고 신청했어요"
 */
export function moveRequestMessage(direction: string, personName: string, fromGroup: string, toGroup: string): PushPayload {
  return {
    title: "목장 이동 신청",
    body:
      direction === "pull"
        ? `${groupLabel(toGroup)}에서 ${personName} 님을 데려가고 싶다고 신청했어요`
        : `${groupLabel(fromGroup)}에서 ${personName} 님의 목장 이동을 신청했어요`,
    url: "/groups/members",
    tag: `move-${personName}`,
  };
}

/** 목장 이동 결과 → 신청한 리더 */
export function moveDecisionMessage(accepted: boolean, personName: string, toGroup: string): PushPayload {
  return {
    title: "목장 이동",
    body: accepted ? `${personName} 님이 ${groupLabel(toGroup)}으로 옮겼어요` : `${personName} 님 목장 이동 신청이 거절됐어요`,
    url: "/groups/members",
    tag: `move-${personName}`,
  };
}

/**
 * 새가족(2026-11-26 사용자) — 보고서 화면에서 새가족을 넣는 순간 목사님과 그 목장 리더들에게. 누르면 그 사람의 명단 고치기 화면
 * (나머지 칸을 채우는 곳, 뒤로 가면 그 목장 명단).
 */
export function newFamilyMessage(groupName: string, personName: string, personId: string): PushPayload {
  return {
    title: "새가족",
    body: `${groupLabel(groupName)}에 ${personName}${josaFor(personName, "이")} 새로 들어왔어요!`,
    url: `/groups/members/${personId}`,
    tag: `new-family-${personId}`,
  };
}
