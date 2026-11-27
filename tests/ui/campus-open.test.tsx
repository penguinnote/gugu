import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { allMenuFor } from "@/lib/all-menu";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * 캠퍼스 모임 명단 모두 공개(2026-11-26) — 리더도 연다, 처리방침에 줄, TERMS_VERSION 을 올려 다음 접속 때 다시 동의.
 */
let termsVersion = "2026-11-17";
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-1", app_metadata: { provider: "google" } } } }) },
    rpc: async (name: string) =>
      name === "current_user_context"
        ? { data: [{ user_id: "u1", name: "가온리더", role: "leader", group_id: "g1", group_role: "leader", person_id: "p1", is_group_head: false, terms_version: termsVersion }] }
        : { data: null },
  }),
}));
const { requireAppUser } = await import("@/lib/auth/session");

describe("캠퍼스 모임 명단 — 앱을 쓰는 사람 모두", () => {
  it("리더 전체 메뉴의 목장 칸에 '캠퍼스 모임' 이 있고, 어느 역할이든 두 번 나오지 않는다 ★", () => {
    const leader = allMenuFor({ role: "leader", leadsGroup: true });
    expect(leader[0].items.map((i) => i.href)).toContain("/campus");
    for (const me of [{ role: "leader" as const, leadsGroup: true, isOfficer: true }, { role: "admin" as const, leadsGroup: true }, { role: "pastor" as const, leadsGroup: false }]) {
      const all = allMenuFor(me).flatMap((s) => s.items.map((i) => i.href));
      expect(all.filter((h) => h === "/campus")).toHaveLength(1);
    }
  });

  it("화면은 앱 사용자 누구나(requireAppUser) ★", () => {
    const src = readFileSync(join(__dirname, "../../src/app/(tabs)/campus/page.tsx"), "utf8");
    expect(src).toContain("await requireAppUser()");
    expect(src).not.toContain("requireWeeksManager");
  });

  it("처리방침 '누가 볼 수 있나요' 에 캠퍼스 모임 명단 줄 — 앱을 쓰는 사람 모두", () => {
    const src = readFileSync(join(__dirname, "../../src/app/privacy/page.tsx"), "utf8");
    expect(src).toContain('["캠퍼스 모임 명단(이름 · 목장 · 캠퍼스)", "앱을 쓰는 사람 모두"]');
    expect(src).toContain('["출생년도 · 직업 · 소속 등 명단 정보", "그 목장의 리더, 담당 목사님, 명단을 관리하는 임원진과 운영자"]');
  });

  it("처리방침 — 목장 이동 문장이 '데이터베이스 권한' 문단 바로 앞에(2026-11-26)", () => {
    const src = readFileSync(join(__dirname, "../../src/app/privacy/page.tsx"), "utf8");
    const move = "목장을 옮겨도 그 전 기록은 그 전 목장에 남습니다. 새 목장의 리더는 옮기기 전에 적힌 기도제목 · 특이사항 · 빠진 사유를 볼 수 없습니다.";
    const i = src.indexOf(move);
    const j = src.indexOf("목장별로 볼 수 있는 범위는 데이터베이스 권한으로 막혀 있습니다.");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it("TERMS_VERSION 을 올렸다 — 예전 버전에 동의한 사람은 다음 접속 때 동의 화면(/terms)으로, 새 버전이면 그대로 ★", async () => {
    expect(TERMS_VERSION).toBe("2026-11-26");
    termsVersion = "2026-11-17";
    await expect(requireAppUser()).rejects.toThrow("REDIRECT /terms");
    termsVersion = TERMS_VERSION;
    await expect(requireAppUser()).resolves.toMatchObject({ role: "leader" });
  });
});
