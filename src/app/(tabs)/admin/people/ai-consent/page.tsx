import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { sortGroups } from "@/lib/group-order";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { saveAiConsents } from "./actions";
import { ConsentBoard, type ConsentPerson } from "./consent-board";

export const metadata: Metadata = {
  title: "AI 동의 · 구구",
};

/**
 * AI 동의 한꺼번에(2026-11-13) — 운영자 전용. 청년 동의서의 'AI 정리를 위한 해외 서버 사용' 항목을 걷은 뒤 여러 사람을 한 화면에서 체크한다.
 * 활동 중 · 휴면인 사람만(기록 제외 · 떠난 사람은 어차피 AI 로 가지 않는다). 한 사람씩은 사람 화면의 'AI 동의' 와 같다.
 */
export default async function AiConsentPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [peopleRes, groupsRes] = await Promise.all([
    supabase.from("persons").select("id, name, group_id, group_role, ai_consented_at").in("status", ["active", "dormant"]),
    supabase.from("groups").select("id, name, number").eq("status", "active"),
  ]);
  const collator = new Intl.Collator("ko");
  const people: ConsentPerson[] = (peopleRes.data ?? [])
    .map((p) => ({ id: p.id, name: p.name, groupId: p.group_id, leader: p.group_role === "leader", consentedAt: p.ai_consented_at }))
    .sort((a, b) => (a.leader === b.leader ? collator.compare(a.name, b.name) : a.leader ? -1 : 1));

  return (
    <>
      <AppHeader back="/admin/people" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">AI 동의</h1>
        <ConsentBoard people={people} groups={sortGroups(groupsRes.data ?? []).map((g) => ({ id: g.id, name: g.name }))} save={saveAiConsents} />
      </main>
    </>
  );
}
