import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { PushSettings } from "@/components/push-settings";
import { requireAppUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "알림 · 구구",
};

/** 알림(2026-11-11) — 내 정보에서 떼어 냈다(프로필을 넓게). '전체 → 알림' 에서 온다. 받는 알림이 없는 역할(리더 아닌 임원진)은 안내만 */
export default async function PushPage() {
  const me = await requireAppUser();
  const gets = me.leadsGroup || me.role === "pastor" || me.role === "admin";
  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">알림</h1>
        {gets ? <PushSettings audience={{ role: me.role, leadsGroup: me.leadsGroup }} /> : <p className="text-[15px] text-[var(--gg-hint)]">받는 알림이 없어요.</p>}
      </main>
    </>
  );
}
