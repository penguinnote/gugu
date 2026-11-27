import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next";
import { getUserContext, homeFor } from "@/lib/auth/session";
import { absoluteUrl } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth 콜백.
 *
 * 가입은 막지 않는다. 누구나 구글·카카오로 로그인할 수 있고, 첫 로그인이면
 * ensure_user() 가 pending 앱 계정을 만든다. pending 은
 * 신청 화면밖에 못 보므로 무해하다. 신청 대상은 명단상 리더뿐이다 — 청년은 앱을 쓰지 않는다.
 *
 * 누구인지 확인하는 일은 여기서 하지 않는다 — 신청 → 해당 목장 리더의 승인으로
 * 한다. 이 콜백은 세션을 만들고 갈 곳을 정할 뿐이다.
 */

function deny(request: NextRequest, reason: string) {
  const url = absoluteUrl("/login/denied", request.headers);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");

  if (!code) return deny(request, "no_code");

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return deny(request, "exchange_failed");

  const { data: role, error: ensureError } = await supabase.rpc("ensure_user");
  if (ensureError || !role) {
    await supabase.auth.signOut();
    return deny(request, "no_account");
  }

  // 갈 곳은 homeFor() 한 곳이 정한다. `/`·`/login` 과 같은 규칙이다.
  // pending 은 next 를 무시한다 — 신청 전에는 갈 수 있는 화면이 /apply 뿐이다.
  const me = await getUserContext();
  if (!me) {
    // 운영자가 잠근 계정이면 그렇다고 말한다(2026-11-05) — 전엔 '일시적인 오류' 로 보여 다시 시도만 되풀이했다
    const { data: locked } = await supabase.rpc("my_account_locked");
    await supabase.auth.signOut();
    return deny(request, locked ? "locked" : "no_account");
  }
  // 바깥 주소(//evil.example 등)는 받지 않는다 — safeNextPath(2026-11-04)
  const safeNext = safeNextPath(next);
  const wantsNext = safeNext && safeNext !== "/" && me.role !== "pending";
  const destination = wantsNext ? safeNext : homeFor(me);
  return NextResponse.redirect(absoluteUrl(destination, request.headers));
}
