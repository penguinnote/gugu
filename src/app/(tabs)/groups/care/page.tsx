import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BlindSpotSection } from "@/components/blind-spots";
import { ContactSection } from "@/components/care-contacts";
import { requireAppUser } from "@/lib/auth/session";
import { loadBlindSpots } from "@/lib/blind-spots-data";
import { loadWeekContacts } from "@/lib/care-contacts";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey } from "@/lib/week";

export const metadata: Metadata = {
  title: "챙김이 필요한 양 · 구구",
};

/**
 * 우리 목장 돌봄(2026-11-15 — 예전 '돌봄 사각지대') — 주중에 연락할 사람. 목장을 맡은 리더만.
 *   위: 지난 예배에 결석했거나 온라인으로 드린 사람(lib/care-contacts)
 *   아래: 돌봄 사각지대(2주 연속 결석 · 4주 목장 불참)
 * 홈 카드의 '돌봄 n명' 은 이 두 목록을 합친 사람 수다.
 */
export default async function CarePage() {
  const me = await requireAppUser();
  if (!me.leadsGroup || !me.groupId) notFound();
  const weekKey = currentWeekKey();
  const [summary, contacts] = await Promise.all([
    loadBlindSpots(weekKey),
    createClient()
      .then((supabase) => loadWeekContacts(supabase, me.groupId!, weekKey))
      .catch(() => null),
  ]);
  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">챙김이 필요한 양</h1>
        <ContactSection contacts={contacts} />
        {summary ? <BlindSpotSection summary={summary} showGroup={false} /> : <p className="text-[15px] text-muted">불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      </main>
    </>
  );
}
