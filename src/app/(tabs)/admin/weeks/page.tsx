import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, upcomingWeeks } from "@/lib/week";

import { WeeksForm, type WeekRow } from "./weeks-form";

export const metadata: Metadata = {
  title: "휴주 · 구구",
};

const WEEKS_AHEAD = 12;
/** 늦게 정해도 휴주(2026-11-26) — 지난 주도 이만큼 고른다 */
const WEEKS_BACK = 12;

/**
 * A-1b 휴주 지정 — 운영자만(2026-11-18 사용자 — 목사님 · 임원진 화면에서는 뺐다. DB 권한은 그대로). 이번 주부터 12주.
 * 지난 주도 최근 12주를 고른다(2026-11-26 — 늦게 정해도 휴주, 정하는 즉시 휴주 선물 · 쿠폰 돌려주기 · 연속 보너스 채우기). 구구 테마.
 */
export default async function SkippedWeeksPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const thisWeek = currentWeekKey();
  const weeks = upcomingWeeks(thisWeek, WEEKS_AHEAD);
  const past = Array.from({ length: WEEKS_BACK }, (_, i) => addDays(thisWeek, -7 * (i + 1)));
  const { data } = await supabase
    .from("skipped_weeks")
    .select("week_key, reason")
    .gte("week_key", past[past.length - 1])
    .lte("week_key", weeks[weeks.length - 1]);
  const skipped = new Map((data ?? []).map((r) => [r.week_key, r.reason]));
  const toRow = (w: string): WeekRow => ({ weekKey: w, skipped: skipped.has(w), reason: skipped.get(w) ?? null });
  const rows: WeekRow[] = weeks.map(toRow);
  const pastRows: WeekRow[] = past.map(toRow);

  return (
    <>
      <AppHeader back="/admin" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">휴주</h1>
        </header>
        <WeeksForm initial={rows} thisWeek={thisWeek} />
        <h2 className="pt-2 text-[17px] font-bold">지난 주</h2>
        <WeeksForm initial={pastRows} thisWeek={thisWeek} testId="weeks-past" />
      </main>
    </>
  );
}
