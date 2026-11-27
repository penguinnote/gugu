import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { guardFetch, isBlockedRequest, PREVIEW_READONLY_CODE, previewWritesBlocked } from "@/lib/preview-guard";
import classes from "@/lib/rpc-classes.json";

/**
 * Step 9c — 프리뷰에서 프로덕션 DB 로의 쓰기 차단 (08 Step 9 결정 ③ 앱 차단 A)
 *
 *   · VERCEL_ENV=preview 이고 PREVIEW_WRITES 가 allow 가 아니면 막는다. 프로덕션·로컬은 그대로
 *   · 막는 자리는 Supabase 클라이언트의 fetch 하나 — 서버 클라이언트와 서버 키 클라이언트 둘 다 지난다
 *   · /rest/v1 의 GET 은 통과, 쓰기 메서드는 거부. rpc 는 분류표의 읽기용·로그인용만 통과
 *   · /auth/v1 은 통과 — 프리뷰에 로그인은 된다
 *   · 앱이 부르는 rpc 는 전부 분류표에 있어야 한다 — 새 함수를 넣고 분류를 잊으면 여기서 깨진다
 */

const BASE = "https://proj.supabase.co";
const PREVIEW = { VERCEL_ENV: "preview" };

describe("언제 막나", () => {
  it("프리뷰 + 허용 없음 → 막는다. 허용·프로덕션·로컬 → 그대로", () => {
    expect(previewWritesBlocked({ ...PREVIEW })).toBe(true);
    expect(previewWritesBlocked({ ...PREVIEW, PREVIEW_WRITES: "block" })).toBe(true);
    expect(previewWritesBlocked({ ...PREVIEW, PREVIEW_WRITES: "allow" })).toBe(false);
    expect(previewWritesBlocked({ VERCEL_ENV: "production" })).toBe(false);
    expect(previewWritesBlocked({})).toBe(false);
  });
});

describe("무엇을 막나", () => {
  it("테이블 쓰기 메서드는 막고 읽기는 통과 ★", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE", "post"]) {
      expect(isBlockedRequest(`${BASE}/rest/v1/weekly_records?id=eq.1`, m), m).toBe(true);
    }
    expect(isBlockedRequest(`${BASE}/rest/v1/weekly_records?select=*`, "GET")).toBe(false);
    expect(isBlockedRequest(`${BASE}/rest/v1/reports`, "HEAD")).toBe(false);
  });

  it("rpc — 읽기용·로그인용은 통과, 쓰기용은 막는다", () => {
    expect(isBlockedRequest(`${BASE}/rest/v1/rpc/group_streaks`, "POST")).toBe(false);
    expect(isBlockedRequest(`${BASE}/rest/v1/rpc/ensure_user`, "POST")).toBe(false);
    expect(isBlockedRequest(`${BASE}/rest/v1/rpc/submit_report`, "POST")).toBe(true);
    expect(isBlockedRequest(`${BASE}/rest/v1/rpc/open_report`, "POST")).toBe(true);
    // 분류표에 없는 함수는 쓰기로 본다 — 모르는 것은 막는 쪽
    expect(isBlockedRequest(`${BASE}/rest/v1/rpc/brand_new_function`, "POST")).toBe(true);
  });

  it("로그인(/auth/v1)은 통과 — 프리뷰에 들어갈 수는 있다", () => {
    expect(isBlockedRequest(`${BASE}/auth/v1/token?grant_type=pkce`, "POST")).toBe(false);
    expect(isBlockedRequest(`${BASE}/auth/v1/logout`, "POST")).toBe(false);
  });

  it("저장소(/storage/v1) 쓰기도 막는다", () => {
    expect(isBlockedRequest(`${BASE}/storage/v1/object/b/x.png`, "POST")).toBe(true);
    expect(isBlockedRequest(`${BASE}/storage/v1/object/b/x.png`, "GET")).toBe(false);
  });
});

describe("guardFetch", () => {
  it("막히면 원래 fetch 를 부르지 않고 PostgREST 꼴의 403 을 돌려준다 ★", async () => {
    const base = vi.fn(async () => new Response("{}"));
    const f = guardFetch(base as unknown as typeof fetch, PREVIEW);
    const res = await f(`${BASE}/rest/v1/skipped_weeks`, { method: "POST", body: "{}" });
    expect(base).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe(PREVIEW_READONLY_CODE);
    expect(body.message).toContain("프리뷰");
  });

  it("Request 객체로 와도 메서드를 읽는다", async () => {
    const base = vi.fn(async () => new Response("{}"));
    const f = guardFetch(base as unknown as typeof fetch, PREVIEW);
    const res = await f(new Request(`${BASE}/rest/v1/persons?id=eq.1`, { method: "PATCH", body: "{}" }));
    expect(res.status).toBe(403);
    expect(base).not.toHaveBeenCalled();
  });

  it("읽기는 원래 fetch 로 넘긴다. 허용이면 아예 감싸지 않는다", async () => {
    const base = vi.fn(async () => new Response("[]"));
    await guardFetch(base as unknown as typeof fetch, PREVIEW)(`${BASE}/rest/v1/persons?select=id`);
    expect(base).toHaveBeenCalledTimes(1);
    expect(guardFetch(base as unknown as typeof fetch, { ...PREVIEW, PREVIEW_WRITES: "allow" })).toBe(base);
  });
});

describe("분류표가 앱과 맞는가", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  }

  it("src 에서 부르는 rpc 는 전부 분류돼 있다 ★", () => {
    const called = new Set<string>();
    for (const f of walk(path.resolve(__dirname, "../../src"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) called.add(m[1]);
    }
    const known = new Set([...classes.readOnly, ...classes.session, ...classes.write]);
    const missing = [...called].filter((n) => !known.has(n));
    expect(missing, "rpc-classes.json 에 분류를 넣어야 한다").toEqual([]);
    expect(called.size).toBeGreaterThan(20);
  });

  it("한 함수는 한 분류에만", () => {
    const all = [...classes.readOnly, ...classes.session, ...classes.write];
    expect(new Set(all).size).toBe(all.length);
  });
});
