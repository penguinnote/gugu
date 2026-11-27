import Image from "next/image";
import Link from "next/link";

import { BTN, Chevron } from "@/components/ui";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { formatRemaining, formatWeekLabel } from "@/lib/week";

import { HOME_CARD } from "./home-card";
import { ATTENDANCE_ROW, InfoRows } from "./info-rows";
import { PushPrompt } from "./push-prompt";
import { Speak } from "./speak";

export type PastorWeek = { total: number; submitted: number; skipped: { reason: string | null } | null };

export async function loadPastorWeek(weekKey: string): Promise<PastorWeek> {
  const supabase = await createClient();
  const [groupsRes, reportsRes, skippedRes] = await Promise.all([
    supabase.from("groups").select("id").eq("status", "active"),
    supabase.from("reports").select("group_id, submitted_at").eq("week_key", weekKey),
    supabase.from("skipped_weeks").select("reason").eq("week_key", weekKey).maybeSingle(),
  ]);
  const active = new Set((groupsRes.data ?? []).map((g) => g.id));
  const submitted = (reportsRes.data ?? []).filter((r) => r.submitted_at && active.has(r.group_id)).length;
  return { total: active.size, submitted, skipped: skippedRes.data ?? null };
}

/**
 * 홈 맨 위 — 목사님의 이번 주 한 장(구구 테마). 자세한 제출 현황·사각지대는 /pastor(P-1)에 그대로 있다.
 * 세는 법은 P-1 과 같다: 활동 중 목장 수, 그중 이번 주 submitted_at 이 있는 곳. 막대는 제출한 비율.
 */
export function PastorHero({ weekKey, week, now, chat = false }: { weekKey: string; week: PastorWeek; now: Date; chat?: boolean }) {
  const { total, submitted, skipped } = week;
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const all = total > 0 && submitted === total;
  return (
    <section className={`${HOME_CARD} overflow-hidden`} data-testid="week-status">
      <Speak
        chat={chat}
        mood={skipped ? "sleepy" : all ? "sparkle" : "wave"}
        /* 문구는 2026-10-29 사용자 지정. 한 줄에 들어가게(speak.tsx) — n곳은 길어서 두 줄로 */
        lines={
          skipped
            ? ["이번 주는 휴주예요.", "푹 쉬세요."]
            : all
              ? ["목사님, 반가워요!", "모든 목장보고서가 제출되었습니다!"]
              : submitted === 0
                ? ["목사님, 반가워요!", "아직 목장보고서를 제출한 목장이 없어요."]
                : ["목사님, 안녕하세요!", `지금까지 ${submitted}개의 목장보고서가`, "제출되었어요."]
        }
      />
      <div className="space-y-4 px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold text-[var(--gg-section)]">{formatWeekLabel(weekKey)}</h1>
          {skipped ? null : <span className="gg-pill bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]">{formatRemaining(weekKey, now)}</span>}
        </div>
        {skipped ? (
          <p className="gg-display text-[22px] leading-snug">휴주입니다{skipped.reason ? ` · ${skipped.reason}` : ""}</p>
        ) : (
          <div className="space-y-2.5">
            <p className="gg-display text-[24px] leading-none">
              {total}목장 중 <span className="text-[var(--gg-leaf-ink)]">{submitted}개</span> 제출
            </p>
            <div className="gg-progress" aria-hidden>
              <span style={{ width: `${Math.max(pct, submitted > 0 ? 8 : 0)}%` }} />
            </div>
            <p className="text-[13px] text-muted">{total - submitted}곳 미제출</p>
          </div>
        )}
        <Link href="/pastor" className={`${BTN("sky")} w-full`}>
          제출 현황 보기
          <Chevron className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}

export async function PastorStatus({ weekKey, chat = false }: { weekKey: string; chat?: boolean }) {
  // 알림 켜기 팝업은 이 기기가 스스로 살핀다(2026-11-11 — 지우고 다시 깔았을 때도 묻게). 수요일 아침 정리 알림
  const week = await loadPastorWeek(weekKey);
  return (
    <>
      <PastorHero weekKey={weekKey} week={week} now={new Date()} chat={chat} />
      <PushPrompt audience="pastor" />
    </>
  );
}

export type AdminWeek = { pending: number; skipped: boolean; total: number; submitted: number; quiet: number };

export async function loadAdminWeek(weekKey: string): Promise<AdminWeek> {
  const supabase = await createClient();
  const [pendingRes, skippedRes, chatRes, countRes, pushRes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("skipped_weeks").select("week_key").eq("week_key", weekKey).maybeSingle(),
    // 구구 챗봇 추가 신청 대기도 승인 대기에 더한다(2026-11-12)
    supabase.rpc("chat_quota_pending_count"),
    // 이번 주 제출 수(2026-11-13 B안) — 운영자는 보고서를 못 읽어 숫자만 주는 함수로
    supabase.rpc("week_submission_count", { p_week_key: weekKey }),
    // 알림 안 켠 리더 · 목사님 — 운영 홈의 '알림 미등록' 과 같은 셈(명단 밖 운영자는 받을 알림이 없다)
    supabase.rpc("push_registration_status"),
  ]);
  const count = countRes.data?.[0];
  // rpc 의 Args 가 never 인 함수는 data 가 느슨하게 잡힌다 — 생성된 Returns 로 고정한다(운영 홈과 같은 방식)
  const pushRows: Database["public"]["Functions"]["push_registration_status"]["Returns"] = pushRes.data ?? [];
  const targets = pushRows.filter((r) => r.role !== "admin" || r.group_name);
  return {
    pending: (pendingRes.count ?? 0) + (chatRes.data ?? 0),
    skipped: Boolean(skippedRes.data),
    total: count?.total ?? 0,
    submitted: count?.submitted ?? 0,
    quiet: targets.filter((r) => r.devices === 0).length,
  };
}

/**
 * 홈 맨 위 — 운영자(명단 밖)의 한 장(2026-11-13 B안, 목사님 카드와 같은 결). 위에서부터
 *   구구 인사 · 이번 주 제출 막대(휴주면 한 줄) · 할 일 줄(승인 대기 · 알림 안 켠 리더 — 누르면 그 화면) · 라임 '운영 홈 보기'.
 * 예전 빨간 숫자 칸 · 빨간 단추 · '이번 주 모임 있음' 알약은 뺐다(다른 카드와 결이 달라 경고처럼 읽혔다).
 */
export function AdminHero({ weekKey, week }: { weekKey: string; week: AdminWeek }) {
  const { pending, skipped, total, submitted, quiet } = week;
  const todoCount = pending + quiet;
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const todo = [
    { icon: "/icons/tossface/u23F3.svg", label: "승인 대기", n: pending, href: "/approvals", testId: "admin-todo-pending" },
    { icon: "/icons/tossface/u1F514.svg", label: "알림 안 켠 리더", n: quiet, href: "/admin/push", testId: "admin-todo-push" },
  ];
  return (
    <section className={`${HOME_CARD} overflow-hidden`} data-testid="week-status">
      <Speak
        mood={skipped ? "sleepy" : todoCount > 0 ? "wave" : "smile"}
        lines={["운영자님, 반가워요!", todoCount > 0 ? `확인할 일이 ${todoCount}건 있어요.` : "평안한 한 주예요!"]}
      />
      <div className="space-y-2.5 px-5 pt-4">
        <p className="text-[13px] font-semibold text-[var(--gg-section)]">{formatWeekLabel(weekKey)}</p>
        {skipped ? (
          <p className="text-[20px] leading-none font-extrabold tracking-[-0.02em]">이번 주는 휴주예요</p>
        ) : (
          <>
            <p className="text-[20px] leading-none font-extrabold tracking-[-0.02em] tabular-nums" data-testid="admin-submitted">
              {total}목장 중 <span className="text-[var(--gg-leaf-ink)]">{submitted}곳</span> 제출
            </p>
            <div className="gg-progress" aria-hidden>
              <span style={{ width: `${Math.max(pct, submitted > 0 ? 8 : 0)}%` }} />
            </div>
          </>
        )}
      </div>
      <ul className="mt-3 divide-y divide-[var(--gg-line)] border-t border-[var(--gg-line)]">
        {todo.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="flex items-center gap-3 px-5 py-3" data-testid={t.testId}>
              <Image src={t.icon} alt="" width={22} height={22} unoptimized className="size-[22px] shrink-0" />
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{t.label}</span>
              <span className={`text-[15px] font-bold tabular-nums ${t.n > 0 ? "text-[var(--gg-sky-ink)]" : "text-[var(--gg-hint)]"}`}>{t.n}</span>
              <Chevron className="h-4 w-4 text-[var(--gg-hint)]" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-5 pt-2 pb-5">
        <Link href="/admin" className={`${BTN("sky")} w-full`}>
          운영 홈 보기
          <Chevron className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}

export async function OfficerStatus({ weekKey }: { weekKey: string }) {
  return <OfficerHero weekKey={weekKey} />;
}

export async function AdminStatus({ weekKey }: { weekKey: string }) {
  return <AdminHero weekKey={weekKey} week={await loadAdminWeek(weekKey)} />;
}

/**
 * 홈 맨 위 — 임원진(목장 리더가 아닌, 2026-10-30)의 한 장. 임원진이 하는 일은 전체 명단 보기 · 내려받기라 그리로 가는 단추 하나.
 */
export function OfficerHero({ weekKey }: { weekKey: string }) {
  return (
    <section className={`${HOME_CARD} overflow-hidden`} data-testid="week-status">
      <Speak mood="wave" lines={["임원진님, 반가워요!", "평안한 한 주예요!"]} />
      {/* 출석부 줄(2026-11-16 사용자) — 리더 카드와 같은 줄 */}
      <InfoRows rows={[ATTENDANCE_ROW]} className="mt-4" />
      <div className="space-y-4 px-5 pt-2 pb-5">
        <h1 className="text-[13px] font-semibold text-[var(--gg-section)]">{formatWeekLabel(weekKey)}</h1>
        <Link href="/groups/roster" className={`${BTN("sky")} w-full`}>
          전체 명단 보기
          <Chevron className="h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}
