import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentWeekKey, isWeekKey } from "@/lib/week";

import { ReportsScreen } from "../reports-screen";

export const metadata: Metadata = {
  title: "주간 목장보고서 · 구구",
};

/** L-2 주간 보고서 작성 — 한 주차. 잘못된 주차·미래 주차는 이번 주로. */
export default async function ReportWeekPage({ params }: PageProps<"/reports/[week]">) {
  const { week } = await params;
  const thisWeek = currentWeekKey();
  if (!isWeekKey(week) || week > thisWeek) redirect(`/reports/${thisWeek}`);
  return <ReportsScreen weekKey={week} thisWeek={thisWeek} />;
}
