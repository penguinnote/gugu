import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { guardFetch } from "../preview-guard";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

/**
 * 서버(서버 컴포넌트·서버 액션·라우트 핸들러)용 Supabase 클라이언트.
 *
 * 요청마다 새로 만들어야 한다. 하나를 여러 요청에 재사용하면
 * 다른 사용자의 세션 쿠키가 섞일 수 있다.
 *
 * 이 클라이언트도 publishable 키를 쓰므로 RLS의 적용을 받는다.
 * 즉 "서버에서 도니까 다 보인다"가 아니라, 로그인한 사용자의 권한으로만 읽는다.
 * 이것이 docs/06-tech-stack.md §4.1의 '열람' 경로다.
 *
 * fetch 는 guardFetch 로 감싼다 — 프리뷰에서 PREVIEW_WRITES=allow 가 없으면 쓰기를 막는다(preview-guard.ts).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: { fetch: guardFetch() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 미들웨어가 맡으므로(Step 3에서 추가) 여기서는 무시해도 된다.
        }
      },
    },
  });
}
