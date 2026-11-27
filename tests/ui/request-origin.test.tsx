import { describe, expect, it } from "vitest";

import { requestOrigin } from "@/lib/request-origin";

/**
 * 요청 출처 — 환경별 규칙 (2026-09-30)
 *   production  고정값. 헤더를 조작해도 절대 바뀌지 않는다 (예전 localhost 사고의 재발 방지)
 *   preview     요청 헤더 — 브랜치 별칭 URL 이 곧 origin. 고정값을 쓰면 프리뷰에 로그인할 수 없다
 *   개발         Host 헤더 (localhost · LAN IP)
 */
const h = (o: Record<string, string>) => new Headers(o);
const SITE = "https://gugu.example.com";

describe("requestOrigin — 환경별", () => {
  it("production: NEXT_PUBLIC_SITE_URL 고정값", () => {
    const env = { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: SITE + "/" };
    expect(requestOrigin(h({ host: "gugu.example.com", "x-forwarded-proto": "https" }), env)).toBe(SITE);
  });

  it("production: 요청 헤더를 절대 신뢰하지 않는다 — 조작해도 고정값", () => {
    const env = { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: SITE };
    expect(requestOrigin(h({ host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }), env)).toBe(SITE);
    expect(requestOrigin(h({}), env)).toBe(SITE);
  });

  it("preview: 브랜치 별칭 호스트로 origin 을 만든다 — 고정값이 있어도", () => {
    const env = { NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: SITE };
    expect(
      requestOrigin(h({ host: "gugu-git-step-2-home-example.vercel.app", "x-forwarded-host": "gugu-git-step-2-home-example.vercel.app", "x-forwarded-proto": "https" }), env),
    ).toBe("https://gugu-git-step-2-home-example.vercel.app");
  });

  it("preview: 호스트 헤더가 없어도 고정값(프로덕션 URL)으로는 절대 가지 않는다", () => {
    const env = { NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: SITE };
    const out = requestOrigin(h({}), env);
    expect(out).not.toBe(SITE);
    expect(out.startsWith(SITE)).toBe(false);
  });

  it("개발: Host 헤더 — localhost 와 LAN IP 는 http, 그 외 https", () => {
    const env = { NODE_ENV: "development" };
    expect(requestOrigin(h({ host: "localhost:3000" }), env)).toBe("http://localhost:3000");
    expect(requestOrigin(h({ host: "10.27.21.28:3000" }), env)).toBe("http://10.27.21.28:3000");
    expect(requestOrigin(h({}), env)).toBe("http://localhost:3000");
  });
});
