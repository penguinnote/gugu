import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { ProviderButtons } from "@/components/auth/provider-buttons";
import { InAppBrowserNotice } from "@/components/in-app-browser";
import { Gugu } from "@/components/gugu";
import { getUserContext, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "로그인 · 구구",
};

/**
 * C-1 로그인 — 새 얼굴(2026-10-23). 위 절반은 로뎀 월드 그림(홈과 같은 한 장)이 바탕에 녹아들고 그 위에 인사하는 구구, 아래는 '구구' 글씨 · 시작 단추.
 * 처음 여는 사람이 가장 먼저 보는 화면이라 마스코트가 크게 맞는다.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const me = await getUserContext();
  if (me) redirect(homeFor(me));

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="relative isolate h-[46vh] min-h-[280px] overflow-hidden">
        <Image src="/home/hd-home.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(rgb(0_0_0/0.2),transparent_35%,transparent_50%,var(--background)_94%)]" />
        <div className="gg-bob absolute inset-x-0 bottom-6 flex justify-center">
          <Gugu mood="wave" size={150} title="손을 흔드는 구구" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 px-6 pt-4 pb-12">
        <header className="text-center">
          <h1 className="gg-display text-[52px] leading-none text-[var(--gg-sky-ink)]">구구</h1>
        </header>

        {error ? (
          <p role="alert" className="rounded-2xl bg-[var(--gg-berry-soft)] px-4 py-3 text-center text-sm leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
            {error === "provider"
              ? "지금은 사용할 수 없는 로그인 방식입니다."
              : "로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        ) : null}

        {/* 카카오톡 등 메신저 안에서 열었으면 바깥 브라우저로 여는 길부터(2026-11-06) */}
        <InAppBrowserNotice />

        <ProviderButtons next={next} />
      </div>
    </main>
  );
}
