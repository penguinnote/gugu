"use client";

import { roundFont } from "@/app/fonts";
import { goHome } from "@/lib/nav-history";

import { LoadingScreen } from "./world-shell";

/** /world 로 넘어가는 즉시 — 월드 화면이 그려지기 전에도 같은 불러오기 화면(월드 마을 그림 · 구구가 진행 막대를 따라 난다)을 먼저 보인다 */
export default function Loading() {
  return (
    <div className={`${roundFont.variable} fixed inset-0 overflow-hidden bg-[var(--rw-sky-low)]`}>
      <LoadingScreen progress={0.04} leaving={false} failed={false} onRetry={() => {}} onHome={goHome} />
    </div>
  );
}
