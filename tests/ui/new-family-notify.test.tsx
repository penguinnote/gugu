import { describe, expect, it, vi } from "vitest";

import { newFamilyMessage } from "@/lib/push/messages";

/**
 * 새가족 알림(2026-11-26 사용자) — 새가족을 넣는 순간 목사님과 그 목장 리더들에게 "사랑 목장에 OOO이 새로 들어왔어요!",
 * 누르면 그 사람의 명단 고치기 화면(나머지 칸을 채우는 곳). 훈련단계는 '없음'으로 시작한다.
 */
const sendPush = vi.fn(async () => ({ sent: 1 }));
vi.mock("@/lib/push/send", () => ({ sendPush: (...a: unknown[]) => sendPush(...(a as [])) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string) => ({ data: name === "push_digest_targets" ? [{ user_id: "pastor" }] : [{ user_id: "adder" }, { user_id: "leader2" }] }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "김하늘", group_id: "g1", groups: { name: "사랑" } } }) }) }) }),
  }),
}));
const tasks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => tasks.push(fn) }));
vi.mock("@/lib/auth/session", () => ({ requireAppUser: async () => ({ userId: "adder", leadsGroup: true, groupId: "g1", role: "leader" }) }));
const addMember = vi.fn(async () => ({ ok: true as const, id: "p9" }));
vi.mock("@/app/(tabs)/groups/members/actions", () => ({ addMember: (...a: unknown[]) => addMember(...(a as [])) }));

const { notifyNewFamily } = await import("@/lib/push/notify");
const { addNewFamily } = await import("@/app/(tabs)/reports/new-family-actions");

describe("새가족 알림", () => {
  it("문구 — 이름 받침에 맞춰 '이/가', 누르면 그 사람 명단 고치기 화면 ★", () => {
    expect(newFamilyMessage("사랑", "김하늘", "p1").body).toBe("사랑 목장에 김하늘이 새로 들어왔어요!");
    expect(newFamilyMessage("사랑", "이나래", "p1").body).toBe("사랑 목장에 이나래가 새로 들어왔어요!");
    expect(newFamilyMessage("사랑", "김하늘", "p1").url).toBe("/groups/members/p1");
  });

  it("목사님과 그 목장 리더들에게 — 넣은 리더는 빼고, 사람마다 한 번 ★", async () => {
    await notifyNewFamily("p1", "adder");
    expect(sendPush).toHaveBeenCalledWith(["leader2", "pastor"], expect.objectContaining({ body: "사랑 목장에 김하늘이 새로 들어왔어요!" }), "new-family:p1");
  });

  it("보고서 화면에서 넣으면 응답 뒤에 알림을 건다 — 훈련단계는 '없음'(빈칸)으로 시작", async () => {
    tasks.length = 0;
    sendPush.mockClear();
    const r = await addNewFamily("2026-11-22", "김하늘");
    expect(r).toEqual({ ok: true, id: "p9" });
    expect(addMember).toHaveBeenCalledWith("g1", expect.objectContaining({ name: "김하늘", group_role: "member", training_stage: "" }), "2026-11-22");
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    expect(sendPush).toHaveBeenCalledWith(expect.any(Array), expect.anything(), "new-family:p9");
  });
});
