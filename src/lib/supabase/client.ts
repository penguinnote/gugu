import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 *
 * 세션은 쿠키에 저장된다 — 서버 렌더링 쪽에서 같은 세션을 읽어야 하기 때문이다.
 * 렌더마다 새로 만들어도 되지만, 컴포넌트 안에서 만들 때는
 * `useState(() => createClient())` 처럼 한 번만 생성되게 감싼다.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}
