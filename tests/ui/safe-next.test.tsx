import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/safe-next";

/** 로그인 뒤 돌아갈 곳 — 앱 안 경로만(2026-11-04, 바깥 사이트로 보내는 링크 막기) */
describe("safeNextPath", () => {
  it("앱 안 경로는 그대로", () => {
    expect(safeNextPath("/reports/2026-11-01")).toBe("/reports/2026-11-01");
    expect(safeNextPath("/groups?tab=1#a")).toBe("/groups?tab=1#a");
    expect(safeNextPath("/")).toBe("/");
  });

  it("바깥 주소는 받지 않는다", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil.example", "/\t/evil.example", "/\n/evil.example", "", null, undefined, 3]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
