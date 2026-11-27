import { describe, expect, it } from "vitest";

import { bulkApprovePlan, type BulkApp } from "@/lib/bulk-approve";

/** 모두 승인(2026-11-26) — 리더 신청만, 건너뛴 신청은 까닭과 함께 남긴다 */
const app = (id: string, o: Partial<BulkApp> = {}): BulkApp => ({ id, requested_role: "leader", person_id: `p-${id}`, person_linked: false, applicant_active: true, ...o });

describe("모두 승인 — 고르기", () => {
  it("리더 신청만 한꺼번에, 목사님 · 임원진 신청은 들지 않는다(건너뜀 표시도 없다) ★", () => {
    const p = bulkApprovePlan([app("a"), app("b"), app("c", { requested_role: "pastor", person_id: null }), app("d", { requested_role: "officer", person_id: null })]);
    expect(p.approve).toEqual(["a", "b"]);
    expect(p.skip.size).toBe(0);
  });

  it("건너뛴 신청과 까닭 — 이미 연결됨 · 같은 이름 두 사람 · 이름 없음 · 잠긴 계정 ★", () => {
    const p = bulkApprovePlan([
      app("ok"),
      app("linked", { person_linked: true }),
      app("dup1", { person_id: "same" }),
      app("dup2", { person_id: "same" }),
      app("noname", { person_id: null }),
      app("locked", { applicant_active: false }),
    ]);
    expect(p.approve).toEqual(["ok"]);
    expect(Object.fromEntries(p.skip)).toEqual({
      linked: "고른 이름이 이미 다른 계정에 연결됐어요",
      dup1: "같은 이름을 두 사람이 골랐어요",
      dup2: "같은 이름을 두 사람이 골랐어요",
      noname: "고른 이름이 없어요",
      locked: "잠긴 계정이에요",
    });
  });
});
