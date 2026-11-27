import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { TossCard, TossSection } from "@/components/toss";
import { Chevron } from "@/components/ui";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { MyAiConsent } from "./my-ai-consent";

export const metadata: Metadata = {
  title: "개인정보 · 동의 · 구구",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

/**
 * 개인정보 · 동의(2026-11-13) — 내가 한 동의를 보고 바꾸는 곳. 전체 메뉴 '나' 칸에서 온다(내 정보에는 두지 않는다 — 사용자 결정).
 *   동의 내역   첫 접속 동의(내 정보 처리 · 비밀 유지)를 언제 했는지
 *   AI         명단과 연결된 사람만 — 내 기도제목을 AI 에 쓸지 켜고 끈다(set_my_ai_consent)
 *   처리방침   /privacy
 */
export default async function ConsentPage() {
  const me = await requireAppUser();
  const supabase = await createClient();
  const [userRes, aiRes] = await Promise.all([
    supabase.from("users").select("terms_agreed_at").eq("id", me.userId).maybeSingle(),
    me.personId ? supabase.rpc("my_ai_consent") : Promise.resolve({ data: null }),
  ]);
  const agreedAt = userRes.data?.terms_agreed_at ?? null;

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-6 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">개인정보 · 동의</h1>

        <TossCard>
          <TossSection id="agreed-title" title="동의 내역">
            <dl className="px-6 pb-1">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[15px] text-[var(--gg-hint)]">내 정보 처리 · 비밀 유지</dt>
                <dd className="text-right text-[15px] font-semibold" data-testid="terms-agreed">{agreedAt ? `${day(agreedAt)} 동의` : "동의 전"}</dd>
              </div>
            </dl>
          </TossSection>
        </TossCard>

        {me.personId ? <MyAiConsent initial={aiRes.data ?? null} /> : null}

        <Link href="/privacy" className="flex items-center justify-between gap-3 rounded-[22px] bg-[var(--gg-card)] px-6 py-4 text-[15px] font-semibold shadow-[var(--gg-card-shadow)]" data-testid="privacy-link">
          개인정보 처리방침
          <Chevron className="h-4 w-4 text-[var(--gg-hint)]" />
        </Link>
      </main>
    </>
  );
}
