import type { ReactNode } from "react";

import { previewWritesBlocked } from "@/lib/preview-guard";

import { TabTitle } from "./tab-title";

/**
 * 탭 첫 화면(홈 · 목장 · 상점 · 정보)의 맨 위 — 왼쪽 위 큰 제목 하나(디자인 1, 2026-10-12).
 * 홈은 "Ninetynine", 다른 탭은 그 탭 이름. 오른쪽(aside)에는 그 화면의 작은 것 하나(열매 · 프로필 링크 등).
 * 안쪽 화면(보고서 작성 · 프로필 · 운영 …)은 작은 고정 헤더(AppHeader) 그대로 — 탭 첫 화면은 이동을 탭바가 맡아 고정 헤더가 필요 없다.
 * 출시 뒤 프리뷰는 읽기 전용이다(Step 9c) — 그 표시는 여기서도 보인다. photo 는 TabTitle 참고(목장 · 상점 머리 그림).
 */
export function TabHeader(props: { title: string; sub?: ReactNode; aside?: ReactNode; photo?: string; photoLabel?: string; photoHref?: string; compact?: boolean; pin?: boolean; pinDrop?: number; pinTop?: boolean; pinMid?: boolean }) {
  return <TabTitle {...props} readOnly={previewWritesBlocked()} />;
}
