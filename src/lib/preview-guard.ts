import classes from "./rpc-classes.json";

/**
 * 프리뷰 → 프로덕션 DB 쓰기 차단 (Step 9c, 08 Step 9 결정 ③ — 앱 차단 A).
 *
 * 브랜치 프리뷰는 프로덕션과 같은 Supabase 프로젝트를 본다(06 §4.6). 출시 뒤 프리뷰 실측 한 번이 리더의
 * 실제 기록을 오염시키지 않도록, Supabase 클라이언트의 fetch 에서 쓰기를 막는다. 앱의 모든 DB 쓰기는
 * 서버 클라이언트(lib/supabase/server.ts)와 서버 키 클라이언트(lib/supabase/admin.ts) 둘을 지나고,
 * 브라우저에서 직접 쓰는 곳은 없다 — 이 두 곳에 끼우면 전부 막힌다.
 *
 *   언제   VERCEL_ENV=preview 이고 PREVIEW_WRITES 가 'allow' 가 아닐 때. 출시 전에는 Preview 에 allow 를
 *          두고(실측에 쓰기가 필요하다), **출시 때 지운다**(09 §2.12). 프로덕션·로컬은 영향 없다.
 *   무엇   /rest/v1 의 쓰기 메서드(POST·PATCH·PUT·DELETE). rpc 는 POST 라도 rpc-classes.json 의 읽기용·
 *          로그인용(ensure_user)은 통과 — 분류표에 없는 함수는 쓰기로 보고 막는다. /storage/v1 쓰기도 막는다.
 *          /auth/v1 은 통과 — 프리뷰에 로그인은 된다.
 *   어떻게 원래 fetch 를 부르지 않고 PostgREST 꼴의 403 을 돌려준다. supabase-js 가 이것을 { code, message }
 *          오류로 읽으므로, 서버 액션은 "프리뷰에서는 저장하지 않습니다." 를 그대로 화면에 보인다.
 *
 * 남는 구멍: 프리뷰 브라우저에서 세션 토큰으로 PostgREST 를 직접 치는 경우. 앱 코드는 그러지 않는다.
 */

type Env = { readonly [key: string]: string | undefined }; // VERCEL_ENV · PREVIEW_WRITES 를 읽는다

export const PREVIEW_READONLY_CODE = "PREVIEW_READONLY";
export const PREVIEW_READONLY_MESSAGE = "프리뷰에서는 저장하지 않습니다.";

const PASS_RPCS = new Set<string>([...classes.readOnly, ...classes.session]);
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function previewWritesBlocked(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.PREVIEW_WRITES !== "allow";
}

export function isBlockedRequest(url: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  if (pathname.startsWith("/storage/v1/")) return true;
  if (!pathname.startsWith("/rest/v1/")) return false;
  const rpc = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)\/?$/.exec(pathname);
  if (rpc) return !PASS_RPCS.has(rpc[1]);
  return true;
}

export function guardFetch(base: typeof fetch = fetch, env: Env = process.env): typeof fetch {
  if (!previewWritesBlocked(env)) return base;
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (isBlockedRequest(url, method)) {
      return new Response(
        JSON.stringify({ code: PREVIEW_READONLY_CODE, message: PREVIEW_READONLY_MESSAGE, details: null, hint: "PREVIEW_WRITES=allow" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    return base(input, init);
  };
}
