import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { CARD_LIST, IconCard } from "@/components/toss";
import { requireRole } from "@/lib/auth/session";
import { kstDateTime } from "@/lib/export/model";
import { rangeLabel } from "@/lib/export/range";
import { EXPORT_FORMAT_LABELS } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "내보내기 기록 · 구구",
};

type LogRow = Pick<Database["public"]["Tables"]["export_logs"]["Row"], "id" | "user_id" | "format" | "range_start" | "range_end" | "group_ids" | "created_at">;

const LIMIT = 100;

/**
 * 내보내기 기록 — 운영자 · 목사님(2026-11-26 목사님도, export_logs 읽기 정책은 처음부터 목사님 · 운영자). 다운로드 로그가 통제의 중심인데(02 §3.3) 아무도 보지 않으면 통제가 아니다.
 * 누가 · 언제 · 어느 범위 · 어떤 형식. 최근 순, 100건. 로그는 영구 보존이라 지우는 버튼은 없다.
 * 토스 결(2026-11-11): 📤 카드 하나 안의 줄들 — 이름 · 회색 형식 · 오른쪽 시각, 아래 회색 범위.
 */
export default async function ExportLogsPage() {
  const me = await requireRole("admin", "pastor");
  const supabase = await createClient();
  const [logsRes, usersRes, groupsRes] = await Promise.all([
    supabase.from("export_logs").select("id, user_id, format, range_start, range_end, group_ids, created_at").order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("users").select("id, name"),
    supabase.from("groups").select("id, name"),
  ]);
  const logs: LogRow[] = logsRes.data ?? [];
  const userName = new Map(((usersRes.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const groupName = new Map(((groupsRes.data ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]));

  return (
    <>
      <AppHeader back={me.role === "admin" ? "/admin" : "/all"} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">내보내기 기록</h1>
        {logs.length === 0 ? (
          <p className="text-[15px] text-[var(--gg-hint)]">아직 내보낸 적이 없어요.</p>
        ) : (
          <IconCard icon="/icons/tossface/u1F4E4.svg" title="최근 기록" aside={`${logs.length}건`}>
            <ul className={CARD_LIST} data-testid="export-logs">
              {logs.map((l) => (
                <li key={l.id} className="space-y-0.5 px-4 py-3">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold">
                      {(l.user_id && userName.get(l.user_id)) || "(지워진 계정)"}
                      <span className="ml-1.5 text-[13px] font-normal text-[var(--gg-hint)]">{EXPORT_FORMAT_LABELS[l.format]}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-[var(--gg-hint)] tabular-nums">{kstDateTime(l.created_at)}</span>
                  </p>
                  <p className="text-[12.5px] leading-snug text-[var(--gg-hint)]">
                    {l.range_start && l.range_end ? rangeLabel(l.range_start, l.range_end) : "기간 없음"} ·{" "}
                    {l.group_ids ? l.group_ids.map((g) => groupName.get(g) ?? "?").join(" · ") : "전체 목장"}
                  </p>
                </li>
              ))}
            </ul>
          </IconCard>
        )}
      </main>
    </>
  );
}
