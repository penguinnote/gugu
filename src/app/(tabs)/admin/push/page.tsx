import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth/session";
import { groupLabel, USER_ROLE_LABELS } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { formatKstWhen } from "@/lib/week";

import { PushStatusTable, type PushStatusRow } from "./push-status-table";

export const metadata: Metadata = {
  title: "알림 등록 현황 · 구구",
};

type PushRow = Database["public"]["Functions"]["push_registration_status"]["Returns"][number];

/**
 * A-1c 푸시 등록 현황 — 운영자 전용. "누구에게 개별 안내해야 하나" 가 답이다. 미등록이 먼저, 그 다음 등록.
 * 기기의 endpoint·키는 보지 않는다(push_registration_status 가 돌려주지 않는다). 구구 테마.
 */
export default async function PushStatusPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const serverNow = new Date();
  const { data } = await supabase.rpc("push_registration_status");
  const raw: PushRow[] = data ?? [];
  // 명단 밖 운영자는 알림 대상이 아니다. 겸임(운영자 + 명단 리더)은 리더로서 받는다
  const rows: PushStatusRow[] = raw
    .filter((r) => r.role !== "admin" || r.group_name)
    .map((r) => ({
      userId: r.user_id,
      name: r.name,
      roleLabel: USER_ROLE_LABELS[r.role],
      groupLabel: r.group_name ? groupLabel(r.group_name) : null,
      devices: r.devices,
      lastSuccess: r.last_success_at ? formatKstWhen(r.last_success_at, serverNow) : null,
    }));

  return (
    <>
      <AppHeader back="/admin" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">알림 등록 현황</h1>
        <PushStatusTable rows={rows} />
      </main>
    </>
  );
}
