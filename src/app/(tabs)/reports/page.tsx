import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { Chevron, ICON, Icon, SOLID, TINT } from "@/components/ui";
import { requireReportAccess } from "@/lib/auth/session";
import { REPORT_STAMP_LABELS, groupLabel } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, formatKstWhen, formatWeekLabel, kstWeekday } from "@/lib/week";

export const metadata: Metadata = {
  title: "지난 목장보고서 · 구구",
};

/**
 * `/reports` — 지난 기록 보기. 2단계(2026-09-30)의 분리:
 *   /               이번 주 한 건에 집중 — "지금 뭘 해야 하나"
 *   /reports        과거 목록 — "지난 기록 보기"
 *   /reports/[week] 한 주차 작성·열람
 * 리더가 매주 목록을 스캔하지 않도록 홈은 이번 주만 보여주고, 목록은 여기로 내려왔다.
 * 구구 테마: 카드 한 장 안의 주차 줄 — 앞 동그라미가 상태(제때 · 지각 · 미제출 · 이번 주 아직)를 색으로 말한다.
 */
export default async function ReportsListPage() {
  const me = await requireReportAccess();
  if (!me.leadsGroup || !me.groupId) redirect("/pastor"); // 목사님은 제출 현황(P-1)에서 본다

  const supabase = await createClient();
  const thisWeek = currentWeekKey();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, week_key, submitted_at, is_late")
    .eq("group_id", me.groupId)
    .lte("week_key", thisWeek)
    .order("week_key", { ascending: false })
    .limit(52);
  const rows = reports ?? [];
  const { data: reviews } = await supabase
    .from("report_reviews")
    .select("report_id, first_read_at, stamp")
    .in("report_id", rows.map((r) => r.id));
  type Review = { report_id: string; first_read_at: string; stamp: Database["public"]["Enums"]["report_stamp"] | null };
  const reviewByReport = new Map<string, Review>(((reviews ?? []) as Review[]).map((r) => [r.report_id, r]));
  const now = new Date();

  // 주차를 날짜로 늘어놓는다(2026-11-05) — 예전엔 보고서 행이 있는 주만 나와서, 아예 안 연 주(놓친 주)와 휴주가 빠졌다.
  // 처음 보고서가 생긴 주부터 이번 주까지. 놓친 주는 다시 쓸 수 있으면(이번 주 앞 3주까지) 열리고, 그보다 앞이면 표시만.
  const firstWeek = rows.at(-1)?.week_key ?? thisWeek;
  const { data: skipped } = await supabase.from("skipped_weeks").select("week_key").gte("week_key", firstWeek).lte("week_key", thisWeek);
  const skippedSet = new Set((skipped ?? []).map((s) => s.week_key));
  const reportByWeek = new Map(rows.map((r) => [r.week_key, r]));
  const writableFrom = addDays(thisWeek, -21);
  const weeks: string[] = [];
  for (let w = thisWeek; w >= firstWeek && weeks.length < 52; w = addDays(w, -7)) weeks.push(w);

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">지난 목장보고서</h1>
          <p className="text-[13px] text-muted">{groupLabel(me.groupName)}</p>
        </header>

        <ul className="gg-card divide-y divide-[var(--gg-line)] overflow-hidden">
          {weeks.map((w) => {
            const r = reportByWeek.get(w);
            const review = r ? reviewByReport.get(r.id) : undefined;
            const skippedWeek = skippedSet.has(w) && !r?.submitted_at;
            const kind: MarkKind = skippedWeek ? "skipped" : r?.submitted_at ? (r.is_late ? "late" : "done") : w === thisWeek ? "todo" : "missed";
            const status = skippedWeek
              ? "휴주"
              : r?.submitted_at
                ? `제출 ${formatKstWhen(r.submitted_at, now)}${r.is_late ? " · 지각" : ""}`
                : w === thisWeek
                  ? "아직 안 씀"
                  : "미제출";
            // 휴주와, 다시 쓸 수 없는 오래된 놓친 주는 열 곳이 없다
            // 아직 안 낸 주는 열어 둔 빈 보고서가 있어도 같다 — 열려도 제출이 막혀 쓸모가 없다(2026-11-05)
            const href = skippedWeek || (!r?.submitted_at && w < writableFrom) ? null : `/reports/${w}`;
            const body = (
              <>
                <Mark kind={kind} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block text-[15px] font-bold">
                    {formatWeekLabel(w)}
                    {w === thisWeek ? " · 이번 주" : ""}
                  </span>
                  <span className={`block text-[12px] font-semibold ${kind === "todo" ? "text-[var(--gg-sky-ink)]" : "text-muted"}`}>{status}</span>
                  {review ? (
                    <span className="block text-[12px] font-semibold text-[var(--gg-leaf-ink)]">
                      ✓ 목사님 확인 · {kstWeekday(review.first_read_at)}
                      {review.stamp ? ` · "${REPORT_STAMP_LABELS[review.stamp]}"` : ""}
                    </span>
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={w} data-testid="report-week">
                {href ? (
                  <Link href={href} className="flex items-center gap-3 px-4 py-3.5">
                    {body}
                    <Chevron className="h-5 w-5 text-muted" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}

type MarkKind = "done" | "late" | "missed" | "todo" | "skipped";
/** 주차 앞 동그라미 — 제때 제출 라임 ✓ · 지각 해빛 ✓ · 미제출 돌빛 – · 이번 주 아직 옅은 라임 연필 · 휴주 돌빛 달 */
function Mark({ kind }: { kind: MarkKind }) {
  const cls = kind === "done" ? SOLID.sky : kind === "late" ? SOLID.sun : kind === "todo" ? TINT.sky : TINT.stone;
  const d = kind === "todo" ? ICON.write : kind === "missed" ? "M7 12h10" : kind === "skipped" ? "M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z" : ICON.check;
  return (
    <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${cls}`}>
      <Icon d={d} className="h-5 w-5" strokeWidth={2.8} />
    </span>
  );
}
