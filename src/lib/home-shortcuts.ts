import type { UserContext } from "@/lib/auth/session";

// 홈 바로가기(shortcutsFor)는 2026-11-10 '전체' 탭으로 옮겼다(lib/all-menu.ts). 여기는 월드의 '보고서 쓰기' 갈 곳만 남았다

/** 월드 안 '보고서 쓰기' 가 갈 곳 — 리더는 이번 주 작성 화면, 목사님은 제출 현황, 그 외는 없음(단추를 무시). */
export function worldReportHref(me: Pick<UserContext, "role" | "leadsGroup">, weekKey: string): string | null {
  if (me.leadsGroup) return `/reports/${weekKey}`;
  if (me.role === "pastor") return "/pastor";
  return null;
}
