"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Gugu } from "@/components/gugu";

/**
 * 오류 화면(2026-11-05) — 서버가 잠깐 답하지 않는 등으로 화면을 못 그렸을 때. 예전엔 Next 의 기본 화면이 떠서
 * 탭바도 뒤로가기도 없었고, 홈 화면에 둔 앱에서는 앱을 껐다 켜야 했다. 다시 시도와 홈으로 두 가지만 준다.
 * (tabs)/error.tsx 는 탭바가 남은 채로, app/error.tsx 는 탭바 밖 화면(월드 · 신청)에서 같은 것을 그린다.
 */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full gg-col flex-1 flex-col items-center justify-center gap-6 px-6 pt-16 pb-16 text-center" data-testid="error-view">
      <Gugu mood="sleepy" size={112} />
      <div className="space-y-2">
        <p className="gg-display text-[24px] leading-snug">잠깐 문제가 생겼어요</p>
        <p className="text-[15px] leading-relaxed text-muted">다시 시도해 주세요.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button type="button" onClick={() => retry()} className="gg-btn gg-btn-sky w-full">
          다시 시도
        </button>
        <Link href="/" className="gg-btn gg-btn-white w-full">
          홈으로
        </Link>
      </div>
    </main>
  );
}
