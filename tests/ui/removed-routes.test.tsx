import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allMenuFor } from "@/lib/all-menu";

/**
 * 지운 화면(2026-11-26) — 주소는 없는 화면(404)으로 간다. 페이지 파일이 없으면 Next 가 404 를 그린다.
 *   · 청년부 프로필(/admin/org-profile)
 */
const APP = join(__dirname, "../../src/app/(tabs)");

describe("지운 화면", () => {
  it("청년부 프로필 — 페이지가 없고(404) 어떤 역할의 전체 메뉴에도 줄이 없다 ★", () => {
    expect(existsSync(join(APP, "admin/org-profile/page.tsx"))).toBe(false);
    for (const role of ["admin", "pastor", "leader"] as const) {
      const hrefs = allMenuFor({ role, leadsGroup: role === "leader" }).flatMap((s) => s.items.map((i) => i.href));
      expect(hrefs).not.toContain("/admin/org-profile");
    }
  });
});

describe("운영자 기능 줄이기(2026-11-26)", () => {
  const read = (p: string) => readFileSync(join(APP, p), "utf8");
  it("운영 홈에 AI 정리 상태 카드가 없다 — digest_health 를 읽지 않는다 ★", () => {
    const src = read("admin/page.tsx");
    expect(src).not.toContain("AiDigestHealth");
    expect(src).not.toContain("digest_health");
    expect(existsSync(join(APP, "admin/ai-digest-health.tsx"))).toBe(false);
  });
  it("내보내기 기록은 목사님도 — 화면은 운영자 · 목사님, 목사님 전체 메뉴에 줄 ★", () => {
    expect(read("admin/exports/page.tsx")).toContain('requireRole("admin", "pastor")');
    const hrefs = allMenuFor({ role: "pastor", leadsGroup: false }).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/admin/exports");
    const leader = allMenuFor({ role: "leader", leadsGroup: true }).flatMap((s) => s.items.map((i) => i.href));
    expect(leader).not.toContain("/admin/exports");
  });
});
