"use client";

import { Departing, LoadingScreen, WorldShell } from "@/app/world/world-shell";

/** 디자인 확인 — 월드 불러오기 · 실패 · 떠나는 덮개(월드 본체 없이). 개발 서버에서만 열린다 */
export function WorldLoadingPreview({ state, p }: { state: string; p: number }) {
  // shell — 월드 껍데기 그대로(DB 정보 없이 시안 월드). 세로 휴대폰에서 가로로 돌려 그리는지 본다(2026-10-18)
  if (state === "shell") return <div className="fixed inset-0 z-30"><WorldShell reportHref={null} stats /></div>;
  return (
    <div className="fixed inset-0 z-30">
      {state === "report" || state === "home" ? (
        <Departing text={state === "report" ? "목장보고서로 가는 중" : "홈으로 돌아가는 중"} />
      ) : (
        <LoadingScreen progress={p} leaving={false} failed={state === "failed"} onRetry={() => {}} onHome={() => {}} />
      )}
    </div>
  );
}
