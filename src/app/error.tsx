"use client";

import { ErrorView } from "@/components/error-view";

/** 탭바 밖 화면(월드 · 신청 · 로그인)의 오류 — components/error-view */
export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} />;
}
