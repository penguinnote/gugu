import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TabTitle } from "@/components/tab-title";
import { getUserContext, homeFor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

import { agreeTerms } from "./actions";
import { TermsForm } from "./terms-form";

export const metadata: Metadata = {
  title: "시작하기 전에 · 구구",
};

/**
 * 첫 접속 동의(2026-11-13) — 로그인한 사람이 지금 문구(TERMS_VERSION)에 동의하기 전에는 requireUser · 홈이 여기로 보낸다.
 * 신청 전(pending) 계정도 먼저 여기. 이미 동의했으면 원래 갈 곳으로.
 * ① 내 정보 처리 ② 비밀 유지 약속 — 둘 다. 거절하면 로그아웃.
 */
export default async function TermsPage() {
  const me = await getUserContext();
  if (!me) redirect("/login");
  if (me.termsVersion === TERMS_VERSION) redirect(homeFor(me));
  // 명단과 연결된 사람(리더 등)에게만 AI 선택 항목 — 지금 동의 상태로 채워 둔다
  let ai: boolean | null = null;
  if (me.personId && me.role !== "pending") {
    const { data } = await (await createClient()).rpc("my_ai_consent");
    ai = !!data;
  }

  return (
    <>
      <TabTitle title="시작하기 전에" sub="구구" photo="/home/hd-home.webp" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-12">
        <TermsForm agree={agreeTerms} ai={ai} />
      </main>
    </>
  );
}
