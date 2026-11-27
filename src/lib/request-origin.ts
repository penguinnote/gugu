/**
 * 이 요청이 바깥에서 보이는 출처(origin) — 리다이렉트와 OAuth 콜백 주소의 기준.
 *
 * `request.url` 을 쓰면 안 되는 이유: Next 개발 서버는 폰이 `http://10.27.21.28:3000`
 * 으로 들어와도 `request.url` 을 `http://localhost:3000` 으로 정규화한다. 그 값으로
 * 콜백 주소를 만들면 구글 로그인 뒤 폰이 localhost 로 보내져 "서버에 연결할 수
 * 없습니다" 로 끝난다(2026-09-27 에 실제로 그랬다).
 *
 * 세 경우가 다 동작해야 한다.
 *
 *   폰 (LAN)      Host: 10.27.21.28:3000              → http://10.27.21.28:3000
 *   데스크톱       Host: localhost:3000                → http://localhost:3000
 *   배포 (Vercel)  x-forwarded-host: <도메인>, proto https → https://<도메인>
 *                  단, NEXT_PUBLIC_SITE_URL 이 있으면 그 고정 도메인이 우선이다
 *
 * 배포본에서 고정값을 우선하는 이유는 Host 헤더가 요청자 손에 있기 때문이다.
 * 리다이렉트 목적지를 헤더로 정하면 조작 여지가 생긴다. Supabase 의 Redirect URL
 * 허용 목록이 한 번 더 막지만, 운영에서는 아예 고정 도메인을 쓴다.
 *
 * 환경별 규칙 (2026-09-30, 프리뷰 배포 도입)
 *   VERCEL_ENV=production  NEXT_PUBLIC_SITE_URL 고정값. 헤더를 조작해도 바뀌지 않는다
 *   VERCEL_ENV=preview     x-forwarded-host / x-forwarded-proto (브랜치 별칭 URL 이 곧 origin)
 *   개발                    Host 헤더 (localhost · LAN IP)
 * `env` 인자는 테스트용이다 — 기본은 process.env.
 */
type Env = { NODE_ENV?: string; VERCEL_ENV?: string; NEXT_PUBLIC_SITE_URL?: string };

export function requestOrigin(headers: Headers, env: Env = process.env): string {
  // 프리뷰 배포(브랜치 별칭 URL)만 예외다 — 고정값을 쓰면 OAuth 콜백이 프로덕션으로 날아가 프리뷰에
  // 영영 로그인할 수 없다(2026-09-30). 프리뷰는 요청 헤더로 자기 주소를 안다. Supabase 의 Redirect URL
  // 허용 목록(`…-git-*-<팀>.vercel.app/**`)이 조작된 값을 걸러 준다. 프로덕션은 그대로 고정값이다.
  const isPreview = env.VERCEL_ENV === "preview";
  if (isPreview) {
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    if (host) return `${headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  }

  // 고정값(NEXT_PUBLIC_SITE_URL)을 읽는 곳은 프로젝트 전체에서 여기 한 줄뿐이고, 프리뷰에서는
  // 어떤 경우에도 읽지 않는다 — 프리뷰의 이 값은 프로덕션 URL 이라, 한 번이라도 읽히면 사용자가
  // 조용히 프로덕션으로 넘어간다. 호스트 헤더가 없는(현실에선 없는) 프리뷰 요청도 아래 localhost
  // 로 떨어지지 고정값으로 가지 않는다.
  const fixed = isPreview ? undefined : env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env.NODE_ENV === "production" && fixed) {
    return fixed.replace(/\/+$/, "");
  }

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return "http://localhost:3000";

  const forwardedProto = headers.get("x-forwarded-proto");
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(host);
  const proto = forwardedProto ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}

/** 요청 출처 기준의 절대 URL. NextResponse.redirect 는 절대 URL 을 요구한다. */
export function absoluteUrl(path: string, headers: Headers): URL {
  return new URL(path, requestOrigin(headers));
}
