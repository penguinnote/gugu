import { NextResponse, type NextRequest } from "next/server";

import { notifyReminder } from "@/lib/push/notify";
import { currentWeekKey, isPastDeadline } from "@/lib/week";

/**
 * 월요일 미제출 알림 — Vercel Cron 이 월요일 20:00 KST(11:00 UTC)에 부른다(vercel.json).
 *
 * 로그인 없이 열리는 경로라(proxy PUBLIC_PATHS) CRON_SECRET 으로 막는다 — Vercel 이 Authorization 헤더에
 * `Bearer <CRON_SECRET>` 을 실어 보낸다. 비밀이 설정돼 있지 않으면 아무도 못 부른다.
 * 마감이 이미 지난 주에는 보내지 않는다 — 손으로 다른 날 불러도 엉뚱한 알림이 가지 않게.
 * 같은 주에 두 번 불려도 claim_push(reminder:<week>) 가 한 번만 보낸다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const week = currentWeekKey();
  if (isPastDeadline(week)) {
    return NextResponse.json({ ok: true, week, skipped: "마감 지남" });
  }

  const result = await notifyReminder(week);
  if (!result) return NextResponse.json({ ok: true, week, skipped: "SUPABASE_SECRET_KEY 없음" });

  const sum = result.results.reduce(
    (a, r) => ({ users: a.users + r.users, sent: a.sent + r.sent, failed: a.failed + r.failed, removed: a.removed + r.removed }),
    { users: 0, sent: 0, failed: 0, removed: 0 },
  );
  const skipped = result.results.find((r) => r.skipped)?.skipped ?? null;
  console.log(`[push] reminder ${week} groups=${result.groups} users=${sum.users} sent=${sum.sent} failed=${sum.failed} removed=${sum.removed}${skipped ? ` skipped=${skipped}` : ""}`);
  return NextResponse.json({ ok: true, week, groups: result.groups, ...sum, skipped });
}
