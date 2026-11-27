"use client";

import { ErrorView } from "@/components/error-view";

/** 탭 화면의 오류 — 탭바는 레이아웃에 있어 그대로 남는다(components/error-view) */
export default function TabsError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} />;
}
