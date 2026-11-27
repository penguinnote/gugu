"use client";

import { useRouter } from "next/navigation";

import { addDays, formatWeekLabel } from "@/lib/week";

/** 지난 주를 골라 바로 간다(2026-11-26) — 한 주씩 넘기지 않고. 이번 주부터 1년 전까지 */
export const PICK_WEEKS = 52;

export function WeekPicker({ weekKey, thisWeek, basePath }: { weekKey: string; thisWeek: string; basePath: string }) {
  const router = useRouter();
  const weeks = Array.from({ length: PICK_WEEKS }, (_, i) => addDays(thisWeek, -7 * i));
  if (!weeks.includes(weekKey)) weeks.push(weekKey);
  return (
    <select
      aria-label="주 고르기"
      value={weekKey}
      onChange={(e) => router.replace(`${basePath}?week=${e.target.value}`)}
      className="gg-pill h-9 max-w-[11rem] appearance-none bg-[var(--gg-stone-soft)] text-center text-[var(--gg-stone-ink)]"
      data-testid="week-picker"
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          {w === thisWeek ? "이번 주" : formatWeekLabel(w)}
        </option>
      ))}
    </select>
  );
}
