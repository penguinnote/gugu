import { describe, expect, it, vi } from "vitest";

/** 목사님 제출 알림 — 받는 사람은 목사님(push_digest_targets), 한 번 열쇠는 pastor-submitted:<보고서> */
const sendPush = vi.fn(async () => ({ sent: 1 }));
vi.mock("@/lib/push/send", () => ({ sendPush: (...a: unknown[]) => sendPush(...(a as [])) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: [{ user_id: "pastor-1" }] }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { week_key: "2026-11-22", groups: { name: "사랑" } } }) }) }) }),
  }),
}));
const { notifyPastorSubmitted } = await import("@/lib/push/notify");

describe("notifyPastorSubmitted", () => {
  it("목사님에게, 보고서마다 한 번(같은 열쇠는 claim_push 가 두 번 보내지 않는다) ★", async () => {
    await notifyPastorSubmitted("r1");
    expect(sendPush).toHaveBeenCalledWith(["pastor-1"], expect.objectContaining({ body: "사랑 목장이 목장보고서를 제출하였습니다." }), "pastor-submitted:r1");
  });
});
