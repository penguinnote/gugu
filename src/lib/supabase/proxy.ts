import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

/**
 * 프록시(Next.js 16 에서 미들웨어의 새 이름)용 Supabase 클라이언트.
 *
 * 하는 일은 하나다 — **세션 토큰 갱신.** 액세스 토큰은 짧게 만료되므로
 * 요청마다 한 번 갱신해두지 않으면 서버 컴포넌트가 만료된 세션을 보게 된다.
 *
 * 갱신된 쿠키는 요청과 응답 **양쪽에** 써야 한다. 요청 쪽에 쓰지 않으면
 * 이번 요청을 처리하는 서버 컴포넌트가 옛 쿠키를 읽고, 응답 쪽에 쓰지 않으면
 * 브라우저가 새 토큰을 받지 못한다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 인증 쿠키가 실린 응답은 CDN 이 캐시하면 안 된다.
        // 한 사람의 세션이 다른 사람에게 나갈 수 있다.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // 쿠키를 그대로 믿는 getSession() 이 아니라 서버에서 검증하는 getUser() 를 쓴다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
