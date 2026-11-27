import { createClient } from "@supabase/supabase-js";

import { guardFetch } from "../preview-guard";
import type { Database } from "./database.types";
import { getSupabaseUrl } from "./env";

/**
 * 서버 전용 관리자 클라이언트 — secret key(구 service_role)로 RLS 를 우회한다.
 *
 * 쓰는 곳은 웹 푸시 발송뿐이다(Step 7): 남의 구독(endpoint·키)을 읽고, 받는 사람 함수
 * (push_*_targets · claim_push)를 부른다. 화면 렌더·사용자 요청의 읽기에는 절대 쓰지 않는다 —
 * 그건 createClient()(publishable 키 + 세션, RLS 적용)의 일이다.
 *
 * 키가 없으면 null — 프리뷰·로컬에서 키를 안 넣었을 때 제출 같은 본 동작을 막지 않고 알림만 건너뛴다.
 * fetch 는 guardFetch 로 감싼다 — 서버 키라도 프리뷰의 쓰기는 막는다(preview-guard.ts).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient<Database>(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: guardFetch() },
  });
}
