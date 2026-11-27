import { NextResponse, type NextRequest } from "next/server";

import { notifyDigest } from "@/lib/push/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentWeekKey, deadlineFor, isPastDeadline } from "@/lib/week";

/**
 * 수요일 아침 목사님 알림(2026-11-05) — Vercel Cron 이 수요일 07:00 KST(화 22:00 UTC)에 부른다(vercel.json).
 * 마감(화 23:59) 직후의 지난주 보고서 정리. 숫자만 싣고, 누르면 그 주 제출 현황(/pastor?week=)이 열린다.
 *
 * reminder 와 같은 규칙 — CRON_SECRET 으로 막고(proxy PUBLIC_PATHS), 같은 주에 두 번 불려도 claim_push(digest:<week>) 가 한 번만.
 * 마감 전이거나 마감 뒤 이틀이 지났으면 보내지 않는다 — 손으로 다른 날 불러도 엉뚱한 알림이 가지 않게. 휴주도 보내지 않는다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const week = currentWeekKey();
  const now = new Date();
  if (!isPastDeadline(week, now)) return NextResponse.json({ ok: true, week, skipped: "마감 전" });
  if (now.getTime() - deadlineFor(week).getTime() > 2 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: true, week, skipped: "마감 뒤 이틀 지남" });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: true, week, skipped: "SUPABASE_SECRET_KEY 없음" });
  const { data: skippedWeek } = await admin.from("skipped_weeks").select("week_key").eq("week_key", week).maybeSingle();
  if (skippedWeek) return NextResponse.json({ ok: true, week, skipped: "휴주" });

  const r = await notifyDigest(week);
  if (!r) return NextResponse.json({ ok: true, week, skipped: "받을 목사님 없음" });
  console.log(`[push] digest ${week} users=${r.users} sent=${r.sent} failed=${r.failed} removed=${r.removed}${r.skipped ? ` skipped=${r.skipped}` : ""}`);
  return NextResponse.json({ ok: true, week, ...r });
}
