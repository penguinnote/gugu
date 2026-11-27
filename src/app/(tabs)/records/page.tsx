import type { Metadata } from "next";

import { TabHeader } from "@/components/tab-header";
import { FixedPage } from "@/components/tab-title";
import { GuguSays } from "@/components/ui";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey } from "@/lib/week";

import { type BoardRow, RecordsList, RecordsMine } from "./records-view";

export const metadata: Metadata = {
  title: "기록 · 구구",
};

/**
 * '기록' 탭(2026-11-10 — 정보 탭 자리) — 모든 목장의 연속 제출 · 열매(group_board). 앱 사용자 누구나 본다(사용자 결정).
 * 머리 그림은 로뎀 월드 마을(여러 목장 집이 모인 풍경).
 */
export default async function Page() {
  const me = await requireAppUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_board", { p_week_key: currentWeekKey() });
  const header = <TabHeader title="기록" photo="/home/hd-records-sym.webp" pin pinMid />;
  if (error || !data) {
    return (
      <>
        {header}
        <main className="mx-auto w-full gg-col px-5 pt-5 pb-10">
          <GuguSays mood="sleepy" lines={["기록을 못 불러왔어요.", "잠시 뒤 다시 열어요."]} />
        </main>
      </>
    );
  }
  const rows = data as BoardRow[];
  const mine = me.leadsGroup ? me.groupId : null;
  // 머리 그림 · 우리 목장 박스는 제자리, 모든 목장 줄만 스크롤(2026-11-15 사용자 요청)
  return (
    <FixedPage header={header} stuck={mine ? <RecordsMine rows={rows} mine={mine} /> : null}>
      <div className="mx-auto w-full gg-col px-4 pb-8">
        <RecordsList rows={rows} mine={mine} />
      </div>
    </FixedPage>
  );
}
