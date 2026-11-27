import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OAuth 시작(2026-11-08) — 구글은 늘 계정 고르기를 띄운다(prompt=select_account).
 * 브라우저에 구글 계정이 로그인돼 있으면 묻지 않고 그 계정으로 들어가, 같은 기기에서 다른 계정으로 들어갈 수 없었다.
 * 카카오에는 붙이지 않는다.
 */

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithOAuth } }) }));
vi.mock("@/lib/auth/providers", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/providers")>()), isProviderEnabled: () => true }));

const { POST } = await import("@/app/auth/start/route");

const start = (provider: string) => {
  const form = new FormData();
  form.set("provider", provider);
  return POST(new NextRequest("https://gugu.example.com/auth/start", { method: "POST", body: form, headers: { host: "gugu.example.com" } }));
};

beforeEach(() => {
  signInWithOAuth.mockReset().mockResolvedValue({ data: { url: "https://accounts.example/oauth" }, error: null });
});

describe("OAuth 시작", () => {
  it("구글은 계정 고르기를 띄운다", async () => {
    const res = await start("google");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://accounts.example/oauth");
    expect(signInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: "google", options: { skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
  });

  it("카카오에는 붙이지 않는다", async () => {
    await start("kakao");
    expect(signInWithOAuth.mock.calls[0][0].options.queryParams).toBeUndefined();
  });
});
