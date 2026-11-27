import { NextResponse, type NextRequest } from "next/server";

import { isAuthProvider, isProviderEnabled } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/safe-next";
import { absoluteUrl } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth 시작.
 *
 * 폼 POST 로 받는다. 자바스크립트가 없어도 동작하고, 로그인 화면에서
 * 하이드레이션을 기다릴 필요가 없다. 서버에서 제공자 URL 을 만들어
 * 리다이렉트하므로 PKCE 검증 쿠키가 여기서 심긴다.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const provider = String(form.get("provider") ?? "");
  const next = form.get("next");

  if (!isAuthProvider(provider) || !isProviderEnabled(provider)) {
    return NextResponse.redirect(absoluteUrl("/login?error=provider", request.headers), {
      status: 303,
    });
  }

  // request.url 이 아니라 요청 헤더로 만든다 — 폰(LAN IP)·데스크톱·배포본이 각각 제 주소를 받는다.
  const callback = absoluteUrl("/auth/callback", request.headers);
  const safeNext = safeNextPath(next);
  if (safeNext) {
    callback.searchParams.set("next", safeNext);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // 구글은 늘 계정 고르기를 띄운다(2026-11-08) — 브라우저에 구글 계정이 로그인돼 있으면 묻지 않고 그 계정으로 들어가,
      // 같은 기기에서 다른 계정(예: 목사님 시험 계정)으로 들어갈 수 없었다
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(absoluteUrl("/login?error=oauth", request.headers), {
      status: 303,
    });
  }

  return NextResponse.redirect(data.url, { status: 303 });
}
