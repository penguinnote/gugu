import { describe, expect, it, vi } from "vitest";

import { pastorSubmittedMessage } from "@/lib/push/messages";

/**
 * 목사님 제출 알림(2026-11-26) — 처음 제출할 때마다 목사님에게 "OO 목장이 목장보고서를 제출하였습니다."
 * 다시 제출하거나 고쳐 내면 보내지 않는다(notifySubmitted 의 한 번 규칙과 같게), 늦게 낸 것도 보낸다.
 */
const tasks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => tasks.push(fn) }));
vi.mock("@/lib/auth/session", () => ({ getUserContext: async () => ({ userId: "u1", displayName: "가온리더" }) }));
const notifyPastorSubmitted = vi.fn(async () => null);
const notifySubmitted = vi.fn(async () => null);
vi.mock("@/lib/push/notify", () => ({ notifyPastorSubmitted: (...a: unknown[]) => notifyPastorSubmitted(...(a as [])), notifySubmitted: (...a: unknown[]) => notifySubmitted(...(a as [])) }));
let before: { submitted_at: string | null; group_id: string; week_key: string } = { submitted_at: null, group_id: "g1", week_key: "2026-11-22" };
let late = false;
vi.mock("@/lib/supabase/server", () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in"]) c[k] = () => c;
    c.maybeSingle = async () => result;
    c.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return c;
  };
  return {
    createClient: async () => ({
      from: () => chain({ data: before }),
      rpc: async (name: string) => (name === "submit_report" ? { data: { submitted: true, conflicts: [], is_late: late, rows: [] }, error: null } : { data: [], error: null }),
    }),
  };
});
const { submitReport } = await import("@/app/(tabs)/reports/actions");

async function submit() {
  tasks.length = 0;
  await submitReport({ reportId: "r1", rows: [], note: null, noteDirty: false });
  for (const t of tasks) await t();
}

describe("목사님 제출 알림", () => {
  it("문구 — '사랑' 자리에 목장 이름, 누르면 그 보고서 ★", () => {
    const m = pastorSubmittedMessage("사랑", "2026-11-22");
    expect(m.body).toBe("사랑 목장이 목장보고서를 제출하였습니다.");
    expect(m.url).toBe("/pastor/reports/%EC%82%AC%EB%9E%91?week=2026-11-22");
  });

  it("처음 제출 때 한 번 — 다시 제출하면 보내지 않는다 ★", async () => {
    before = { submitted_at: null, group_id: "g1", week_key: "2026-11-22" };
    await submit();
    expect(notifyPastorSubmitted).toHaveBeenCalledTimes(1);
    expect(notifyPastorSubmitted).toHaveBeenCalledWith("r1");
    before = { submitted_at: "2026-11-23T10:00:00Z", group_id: "g1", week_key: "2026-11-22" };
    await submit();
    expect(notifyPastorSubmitted).toHaveBeenCalledTimes(1);
  });

  it("마감 뒤 늦게 낸 첫 제출도 보낸다", async () => {
    notifyPastorSubmitted.mockClear();
    late = true;
    before = { submitted_at: null, group_id: "g1", week_key: "2026-11-15" };
    await submit();
    expect(notifyPastorSubmitted).toHaveBeenCalledTimes(1);
  });
});
