/**
 * 로그인 뒤 돌아갈 곳(next) — 이 앱 안의 경로만 받는다(2026-11-04).
 *
 * `/` 로 시작하는지만 보면 `//evil.example` · `/\evil.example` 이 통과해 로그인 직후 바깥 사이트로 간다
 * (`new URL("//evil.example", origin)` 은 다른 호스트가 된다). 그래서 실제로 같은 출처로 풀리는지 본다.
 * 아니면 null — 부르는 쪽이 홈으로 보낸다.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  // 제어 문자(탭 · 줄바꿈)는 브라우저가 지우고 해석해서 위 검사를 비껴간다
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  const base = "https://same.invalid";
  try {
    const u = new URL(next, base);
    if (u.origin !== base) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
