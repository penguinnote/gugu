import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { BTN, CARD, GuguSays, ICON, Icon } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { AUTH_PROVIDER_LABELS, USER_ROLE_LABELS, groupLabel } from "@/lib/labels";
import { kstToday } from "@/lib/week";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PendingApplication =
  Database["public"]["Functions"]["list_pending_applications"]["Returns"][number];

import { bulkApprovePlan } from "@/lib/bulk-approve";

import { approveAllLeaders, decideApplication, decideChatQuota } from "./actions";
import { ApproveAll } from "./approve-all";
import { ChatRequestsCard, type ChatRequest } from "./chat-requests";

const DONE: Record<string, string> = { approve: "승인했습니다.", reject: "거절했습니다.", "chat-approve": "질문 추가를 승인했습니다.", "chat-reject": "질문 추가 신청을 거절했습니다." };

export const metadata: Metadata = {
  title: "승인 · 구구",
};

/**
 * 승인 화면 — 운영자 전용.
 *
 * 승인은 임명이 아니라 신원 확인이다. 신청은 시작 화면에서 고른 역할대로 온다(2026-10-30) — 리더(명단의 이름) ·
 * 목사님(이름 없음) · 임원진(리더도 맡았으면 이름). 카드 맨 위 알약이 역할이다. 승인은 운영자만 한다.
 * 리더·목사님이 이 주소를 치면 404 다.
 *
 * 구구 테마: 신청 하나가 카드 하나(계정 → 명단의 그 사람), 아래에 거절(흰) · 승인(잎) 단추.
 * 기다리는 신청이 없으면 웃는 구구가 알려 준다.
 */
export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  await requireRole("admin");
  const params = await searchParams;
  const done = typeof params.done === "string" ? params.done : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  const supabase = await createClient();
  const [{ data: appData }, { data: chatData }] = await Promise.all([supabase.rpc("list_pending_applications"), supabase.rpc("list_chat_quota_requests")]);
  const apps: PendingApplication[] = appData ?? [];
  const chats: ChatRequest[] = (chatData ?? []) as ChatRequest[];
  // 한 이름에 대기 신청이 둘 이상(2026-11-06) — 한쪽을 승인하면 다른 쪽은 저절로 닫힌다. 누가 본인인지 이메일로 먼저 확인
  const sameName = new Map<string, number>();
  for (const a of apps) if (a.person_name) sameName.set(`${a.group_id}|${a.person_name}`, (sameName.get(`${a.group_id}|${a.person_name}`) ?? 0) + 1);
  // 모두 승인(2026-11-26) — 리더 신청 중 한꺼번에 승인할 것, 건너뛸 것과 까닭
  const plan = bulkApprovePlan(apps);
  const bulkN = typeof params.n === "string" ? Number(params.n) : 0;
  const bulkFail = typeof params.fail === "string" ? Number(params.fail) : 0;

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">승인 대기</h1>
        </header>

        {done === "bulk" ? (
          <p className="flex items-center gap-2 rounded-2xl bg-[var(--gg-leaf-soft)] px-3.5 py-3 text-sm font-semibold text-[var(--gg-leaf-ink)]" data-testid="bulk-done">
            <Icon d={ICON.check} className="h-4 w-4 shrink-0" strokeWidth={2.6} />
            {bulkN}명을 승인했습니다.{bulkFail > 0 ? ` ${bulkFail}건은 처리하지 못해 남겨 두었어요.` : ""}
          </p>
        ) : null}
        {done && DONE[done] ? (
          <p
            className={`flex items-center gap-2 rounded-2xl px-3.5 py-3 text-sm font-semibold ${
              done.endsWith("approve") ? "bg-[var(--gg-leaf-soft)] text-[var(--gg-leaf-ink)]" : "bg-[var(--gg-stone-soft)] text-[var(--gg-stone-ink)]"
            }`}
          >
            {done.endsWith("approve") ? <Icon d={ICON.check} className="h-4 w-4 shrink-0" strokeWidth={2.6} /> : null}
            {DONE[done]}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-2xl bg-[var(--gg-berry-soft)] px-3.5 py-3 text-sm leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
            {error === "chat" ? "처리하지 못했습니다. 이미 처리됐거나 본인 신청 · 지난달 신청일 수 있습니다." : "처리하지 못했습니다. 이미 처리됐거나 그 사이 다른 계정에 연결된 신청일 수 있습니다."}
          </p>
        ) : null}

        <ApproveAll count={plan.approve.length} action={approveAllLeaders} />
        {apps.length > 0 ? (
          <ul className="space-y-3.5">
            {apps.map((a) => (
              <li key={a.id} className={`${CARD} space-y-3.5 p-4`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 text-sm">
                      <strong className="font-bold">{a.applicant_name}</strong>
                      <span className="text-muted">
                        {a.provider ? ` · ${AUTH_PROVIDER_LABELS[a.provider]}` : ""} 계정이
                      </span>
                    </p>
                    <span className="gg-pill shrink-0 bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]" data-testid="requested-role">
                      {USER_ROLE_LABELS[a.requested_role ?? "leader"]}
                    </span>
                  </div>
                  {/* 로그인 이메일(2026-11-04) — 이름은 본인이 바꿀 수 있어서, 목사님 · 임원진 신청은 이것으로 본인인지 본다 */}
                  {a.applicant_email ? (
                    <p className="text-[13px] break-all text-muted" data-testid="applicant-email">
                      {a.applicant_email}
                    </p>
                  ) : null}
                  {plan.skip.has(a.id) ? (
                    <p className="rounded-xl bg-[var(--gg-stone-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--gg-stone-ink)]" data-testid="bulk-skip">
                      모두 승인에서 건너뜀 · {plan.skip.get(a.id)}
                    </p>
                  ) : null}
                  {a.person_name && (sameName.get(`${a.group_id}|${a.person_name}`) ?? 0) > 1 ? (
                    <p className="rounded-xl bg-[var(--gg-sun-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--gg-sun-ink)]" data-testid="same-name-warning">
                      같은 이름 신청이 {sameName.get(`${a.group_id}|${a.person_name}`)}건 있어요. 이메일로 본인인지 확인해 주세요.
                    </p>
                  ) : null}
                  {a.person_name ? (
                    <p className="gg-display text-[20px] leading-snug">
                      {groupLabel(a.group_name)} {a.person_name}
                      <span className="ml-2 font-[family-name:var(--font-sans)] text-xs text-muted">
                        {a.person_birth_date ?? (a.person_birth_year ? `${a.person_birth_year}년생` : "출생년도 없음")}
                      </span>
                    </p>
                  ) : (
                    <p className="gg-display text-[20px] leading-snug">{USER_ROLE_LABELS[a.requested_role ?? "leader"]}으로 신청</p>
                  )}
                  <p className="text-xs text-muted">
                    {/* 서버 컴포넌트지만 toLocale* 은 쓰지 않는다(06 §4.5). KST 날짜만. */}
                    {kstToday(new Date(a.requested_at))} 신청
                  </p>
                </div>
                <form action={decideApplication} className="grid grid-cols-2 gap-2.5 border-t border-[var(--gg-line)] pt-3.5">
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" name="decision" value="reject" className={`${BTN("white", "sm")} !h-11 !text-[16px]`}>
                    거절
                  </button>
                  <button type="submit" name="decision" value="approve" className={`${BTN("leaf", "sm")} !h-11 !text-[16px]`}>
                    승인
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <GuguSays mood="smile" size={72} lines={["대기 중인 신청이 없어요."]} />
        )}

        <ChatRequestsCard chats={chats} action={decideChatQuota} />
      </main>
    </>
  );
}
