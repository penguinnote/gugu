import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth/session";

import { InsetsProbe } from "./insets-probe";

export const metadata: Metadata = { title: "화면 진단 · 구구" };

/**
 * 화면 진단(2026-11-23) — 홈 화면 앱에서 시스템 막대가 화면을 가리는지 재 본다. 운영자만(다른 사람은 404).
 * 홈 화면 앱엔 주소창이 없어 전체 메뉴 맨 아래 작은 줄(운영자에게만 보인다)로 들어온다.
 * 다른 기기에서 가림이 생기면 이 화면으로 값을 받는다.
 */
export default async function InsetsPage() {
  await requireRole("admin");
  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">화면 진단</h1>
        <InsetsProbe />
      </main>
    </>
  );
}
