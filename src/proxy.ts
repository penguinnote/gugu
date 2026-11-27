import { NextResponse, type NextRequest } from "next/server";

import { absoluteUrl } from "@/lib/request-origin";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 부터 미들웨어의 이름이 **프록시(Proxy)** 다. 동작은 같고
 * 파일 위치도 같다(`src/proxy.ts`).
 *
 * 여기서 하는 일은 두 가지뿐이다.
 *   1) 세션 토큰 갱신
 *   2) 로그인하지 않은 사람을 보호된 경로에서 내보내기 — **낙관적 확인**
 *
 * 프록시는 프리페치를 포함해 모든 요청에서 돌기 때문에 DB 조회를 넣으면
 * 안 된다. 그래서 여기서는 "auth 세션이 있는가" 까지만 본다.
 *
 * 역할 판정(pending 인가, 리더인가)은 여기서 하지 않는다. 그건 DB 조회가
 * 필요하고, 실제 강제는 RLS 가 한다. 앱 계층 확인은 화면 쪽 require*() 가
 * 맡는다(src/lib/auth/session.ts). 권한이 없는 화면은 404 로 보인다.
 */

/** 로그인 없이 열리는 경로. 나머지는 전부 보호된다. */
const PUBLIC_PATHS = [
  "/login",
  "/login/denied",
  "/auth/start",
  "/auth/callback",
  "/auth/signout",
  "/api/health",
  // 개인정보 처리방침(2026-11-13) — 로그인 전에도 볼 수 있어야 한다
  "/privacy",
  // 월요일 미제출 알림 — Vercel Cron 이 부른다. 로그인 대신 CRON_SECRET 으로 막는다(라우트 안에서).
  "/api/cron/reminder",
  // 수요일 목사님 정리 알림(2026-11-05) — 같은 방식
  "/api/cron/digest",
  // 맞춤법 · 띄어쓰기 교정(2026-11-16) — GET 은 배포에 모델이 실렸는지만 알린다. 고치는 POST 는 라우트 안에서 리더인지 본다(아니면 403)
  "/api/polish",
];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return response;
  // 디자인 확인 화면(지어낸 데이터) — 개발 서버에서만. 운영에서는 화면 자체가 404 다(app/(tabs)/dev/design)
  if (process.env.NODE_ENV === "development" && pathname === "/dev/design") return response;

  if (!user) {
    const loginUrl = absoluteUrl("/login", request.headers);
    // `/` 는 갈림길일 뿐이므로 next 로 남기지 않는다 — 로그인 뒤엔 homeFor() 가 정한다.
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // 서비스 워커·매니페스트는 로그인 전에도 받아져야 한다(홈 화면 추가·푸시 등록, Step 7). 앱 시작 페이지도(2026-11-01)
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|launch\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
