import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { sortGroups } from "@/lib/group-order";
import { hasGroupTab, requireAppUser } from "@/lib/auth/session";
import { loadHub } from "@/lib/group-profile-data";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { GroupCards } from "../group-cards";

export const metadata: Metadata = {
  title: "목장 프로필 · 구구",
};

/**
 * 목장 프로필 — 전체 목장(2026-11-06 사용자 요청). 홈의 '목장 프로필' 은 모든 역할이 이 목록부터 연다.
 * 목장 탭(내 목장 화면)의 '전체 목장' 이 여기로 온다(2026-11-11). 카드를 누르면 그 목장 화면(집 안 사진 + 프로필).
 */
export default async function GroupProfilesPage() {
  const me = await requireAppUser();
  const supabase = await createClient();
  const hub = await loadHub(supabase);
  return (
    <>
      <AppHeader back={hasGroupTab(me) ? "/groups" : "/all"} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">전체 목장</h1>
        {/* 청년부 프로필 블록은 2026-11-26 지웠다(사용자 결정) */}
        <GroupCards groups={sortGroups(hub, me.leadsGroup ? me.groupId : null)} myGroupId={me.leadsGroup ? me.groupId : null} today={kstToday()} />
      </main>
    </>
  );
}
