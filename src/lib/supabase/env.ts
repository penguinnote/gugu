/**
 * Supabase 공개 환경변수.
 *
 * 여기 있는 값은 브라우저 번들에 그대로 들어간다(`NEXT_PUBLIC_` 접두사).
 * 따라서 **공개해도 되는 키만** 둔다.
 *
 * - publishable(구 anon) 키 — 공개 전제. 실제 권한은 DB의 RLS 정책이 판단한다.
 * - secret(구 service_role) 키 — 절대 여기 두지 않는다. RLS를 통째로 우회하므로
 *   서버 전용 코드(Edge Function·배치)에서만, `NEXT_PUBLIC_` 없는 이름으로 읽는다.
 *
 * 근거: docs/06-tech-stack.md §3.1, docs/04-schema.md §4.5
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 없습니다. .env.example 을 복사해 .env.local 을 만들고 값을 채우세요.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
