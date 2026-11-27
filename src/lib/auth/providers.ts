/**
 * 로그인 제공자 — 카카오 + 구글 병행
 *
 * 코드는 둘 다 지원하되, Supabase 대시보드에서 아직 켜지 않은 제공자는
 * 버튼을 비활성화한다. 켜지 않은 제공자로 시도하면 Supabase 가 오류를
 * 돌려주는데, 리더 입장에서는 "앱이 고장났다" 로 읽힌다.
 *
 * 어느 것이 켜져 있는지는 환경변수로 알려준다. 코드가 Supabase 설정을
 * 조회할 방법이 없기 때문이다.
 *
 *   NEXT_PUBLIC_AUTH_PROVIDERS="google"          # 구글만
 *   NEXT_PUBLIC_AUTH_PROVIDERS="google,kakao"    # 둘 다
 *
 * 값이 없으면 구글만 켜진 것으로 본다 — 현재 상태에 맞춘 안전한 기본값이다.
 */

export const AUTH_PROVIDERS = ["kakao", "google"] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<AuthProvider, string> = {
  kakao: "카카오",
  google: "구글",
};

export function isAuthProvider(value: string): value is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value);
}

/** 대시보드에서 켜둔 제공자 목록. */
export function enabledProviders(): AuthProvider[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS;
  if (!raw) return ["google"];

  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isAuthProvider);

  return parsed.length > 0 ? parsed : ["google"];
}

export function isProviderEnabled(provider: AuthProvider): boolean {
  return enabledProviders().includes(provider);
}
