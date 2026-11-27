import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { MenuList } from "@/components/menu-list";
import { TossCard } from "@/components/toss";
import type { MenuSection } from "@/lib/all-menu";
import { requireRole } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey, formatWeekLabel, kstToday } from "@/lib/week";

import { AdminSummary, type SummaryCard } from "./admin-summary";

export const metadata: Metadata = {
  title: "운영 · 구구",
};

type PushRow = Database["public"]["Functions"]["push_registration_status"]["Returns"][number];

/**
 * 운영 홈 (Step 9a) — 09 §1.6 월간 점검이 화면이 된 것. 운영자 전용, 그 외 404.
 * 요약 카드 하나가 곧 할 일 하나다: 승인 대기 · 알림 미등록 · 이번 주 휴주 · 보관 만료 · 내보내기(Step 10) · 명단 갱신일.
 * 숫자는 전부 기존 RLS·함수로 읽는다(운영자는 users·persons·applications·skipped_weeks 를 읽는다).
 * 보관 만료는 pg_cron 이 매월 2일 03:00 KST 에 지운다(9c) — 카드는 남은 만료 수와 마지막 정리를 보여줄 뿐이다.
 * 2026-11-11 토스 결(전체 탭과 같은 줄 목록): 흰 카드 하나에 할 일 · 상태 · 관리. 손볼 것이 남은 값만 붉다.
 * AI 정리 카드(2026-11-08)는 2026-11-26 운영 홈에서 뺐다(사용자 결정 — 목사님 화면의 AI 정리는 그대로).
 */
export default async function AdminHomePage() {
  await requireRole("admin");
  const supabase = await createClient();
  const thisWeek = currentWeekKey();

  // 이번 달(KST) 1일 00:00 — 내보내기 카드의 기준
  const monthStart = `${kstToday().slice(0, 8)}01T00:00:00+09:00`;

  const [pendingRes, pushRes, skippedRes, retentionRes, metaRes, exportsRes, chatRes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.rpc("push_registration_status"),
    supabase.from("skipped_weeks").select("week_key, reason").eq("week_key", thisWeek).maybeSingle(),
    supabase.rpc("records_past_retention"),
    supabase
      .from("app_meta")
      .select("key, value")
      .in("key", ["roster_imported_at", "demo_records", "retention_months", "retention_last_run", "retention_last_deleted"]),
    supabase.from("export_logs").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    // 구구 챗봇 추가 신청 대기(2026-11-12) — 승인 대기에 더한다
    supabase.rpc("chat_quota_pending_count"),
  ]);

  // rpc 의 Args 가 never 인 함수는 data 가 느슨하게 잡힌다 — 생성된 Returns 로 고정한다(approvals 와 같은 방식)
  const pushRows: PushRow[] = pushRes.data ?? [];
  // 알림 대상 = 명단상 리더(겸임 운영자 포함)와 목사님. 명단 밖 운영자는 받을 알림이 없다.
  const targets = pushRows.filter((r) => r.role !== "admin" || r.group_name);
  const unregistered = targets.filter((r) => r.devices === 0).length;
  const retention = retentionRes.data?.[0] ?? null;
  const meta = new Map((metaRes.data ?? []).map((m) => [m.key, m.value]));
  const importedAt = meta.get("roster_imported_at")?.slice(0, 10) ?? null;
  // pg_cron 이 남긴 마지막 정리(UTC 시각 문자열) — 날짜만. 03:00 KST 실행이라 UTC 날짜는 하루 전(1일)이다.
  const lastRun = meta.get("retention_last_run")?.slice(0, 10) ?? null;

  const pending = (pendingRes.count ?? 0) + (chatRes.data ?? 0);
  // 할 일 — 갈 곳이 있는 줄. 손볼 것이 남았으면 오른쪽 값이 붉다
  const todo: SummaryCard[] = [
    { href: "/approvals", icon: "approve", title: "승인 대기", value: `${pending}건`, note: "", warn: pending > 0 },
    { href: "/admin/push", icon: "bell", title: "알림 미등록", value: `${unregistered} / ${targets.length}명`, note: "", warn: unregistered > 0 },
    {
      href: "/admin/weeks",
      icon: "calendar",
      title: "이번 주",
      value: skippedRes.data ? "휴주" : "모임 있음",
      note: skippedRes.data ? `${formatWeekLabel(thisWeek)} · ${skippedRes.data.reason ?? "사유 없음"}` : formatWeekLabel(thisWeek),
    },
    { href: "/admin/exports", icon: "export", title: "내보내기 기록", value: `이번 달 ${exportsRes.count ?? 0}건`, note: "" },
  ];
  // 상태 — 보기만 하는 줄
  const status: SummaryCard[] = [
    {
      href: null,
      icon: "history",
      title: "보관 만료",
      value: retention ? `${retention.expired_records ?? 0}건` : "—",
      note: retention
        ? `${meta.get("retention_months") ?? "24"}개월 · 기준 ${retention.cutoff_week} 이전 · ${lastRun ? `마지막 정리 ${lastRun}` : "매월 2일 자동 정리 (아직 돈 적 없음)"}`
        : "읽지 못했습니다",
    },
    {
      href: null,
      icon: "hourglass",
      title: "명단 갱신",
      value: importedAt ?? "—",
      note: meta.get("demo_records") === "true" ? "데모 기록 있음 — 출시 전 demo:clear" : "",
      warn: meta.get("demo_records") === "true",
    },
  ];
  const manage: MenuSection[] = [
    {
      title: "관리",
      items: [
        { href: "/admin/people", label: "명단 관리", icon: "people", hint: "사람 · 계정 연결" },
        { href: "/admin/accounts", label: "계정 권한", icon: "me", hint: "역할" },
      ],
    },
  ];

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">운영</h1>
        <TossCard>
          <AdminSummary cards={todo} title="할 일" />
          <AdminSummary cards={status} title="상태" testId="admin-status" />
          <MenuList sections={manage} idPrefix="admin" itemTestId="admin-item" />
        </TossCard>
      </main>
    </>
  );
}
