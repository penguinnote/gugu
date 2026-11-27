import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { requireExport } from "@/lib/auth/session";
import { loadActiveGroups } from "@/lib/export/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey } from "@/lib/week";

import { ExportForm } from "./export-form";

export const metadata: Metadata = {
  title: "목장보고서 내려받기 · 구구",
};

/** 직접 지정에서 고를 수 있는 주차 — 이번 주부터 보관 기간(2년)만큼 거꾸로. */
const OPTION_WEEKS = 104;

/**
 * P-6 내보내기 — 목사님(전체 목장)과 리더(자기 목장만, 2026-10-14). 그 외 404. 앱 밖으로 데이터가 나가는 유일한 경로다(PRD §6.5).
 * 화면은 범위만 고르고, 로그·검증·내용은 /export/xlsx 와 /export/pdf 가 한다. 구구 테마.
 * 제목은 '보고서 내려받기'(목사님 바로가기 '보고서', 2026-10-29). 명단 엑셀은 전체 명단 화면으로 옮겼다.
 */
export default async function ExportPage() {
  const { ownGroup } = await requireExport();
  const supabase = await createClient();
  const active = await loadActiveGroups(supabase);
  const groups = ownGroup ? active.filter((g) => g.id === ownGroup) : active;
  const thisWeek = currentWeekKey();
  const weekOptions = Array.from({ length: OPTION_WEEKS }, (_, i) => addDays(thisWeek, -7 * i));

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">목장보고서 내려받기</h1>
        </header>
        <ExportForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} ownGroup={ownGroup} thisWeek={thisWeek} weekOptions={weekOptions} />
      </main>
    </>
  );
}
