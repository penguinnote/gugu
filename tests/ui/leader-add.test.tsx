import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { canChooseRole, emptyForm } from "@/lib/roster-edit";

/**
 * 리더 추가는 목사님도, 양을 리더로 올리기는 목사님 · 운영자만(2026-11-26) — 화면 쪽.
 *   · 구분(리더 · 양) 칸은 목사님 · 운영자에게만
 *   · 고치기 저장에서 리더가 보낸 group_role 은 무시하고 지금 값
 *   · 목사님이 새 사람을 넣으면 고른 구분 그대로
 */
type Me = { role: string; leadsGroup: boolean; groupId: string | null };
let me: Me = { role: "leader", leadsGroup: true, groupId: "g1" };
const writes: { op: string; row: Record<string, unknown> }[] = [];
const current = { id: "p1", name: "가온양", group_id: "g1", group_role: "member", is_group_head: false, status: "active", user_id: null, updated_at: "t0" };

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));
vi.mock("@/lib/auth/session", () => ({ requireAppUser: async () => me }));
vi.mock("@/lib/supabase/server", () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order"]) c[k] = () => c;
    c.maybeSingle = async () => result;
    c.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return c;
  };
  return {
    createClient: async () => ({
      from: (t: string) => ({
        select: () => chain(t === "persons" ? { data: current } : { data: [] }),
        update: (row: Record<string, unknown>) => (writes.push({ op: "update", row }), chain({ data: { id: "p1" }, error: null })),
        insert: (row: Record<string, unknown>) => (writes.push({ op: "insert", row }), chain({ data: { id: "new" }, error: null })),
        delete: () => chain({ error: null }),
      }),
      rpc: async () => ({ data: null, error: null }),
    }),
  };
});
const { saveMember, addMember } = await import("@/app/(tabs)/groups/members/actions");
const { MemberForm } = await import("@/app/(tabs)/groups/members/member-form");

describe("구분 칸 — 목사님 · 운영자만", () => {
  it("canChooseRole — 리더는 아니고 목사님 · 운영자(운영자 겸 리더 포함)는 맞다 ★", () => {
    expect(canChooseRole({ role: "leader" })).toBe(false);
    expect(canChooseRole({ role: "officer" })).toBe(false);
    expect(canChooseRole({ role: "pastor" })).toBe(true);
    expect(canChooseRole({ role: "admin" })).toBe(true);
  });

  it("리더의 명단 고치기 화면에는 구분 칸이 없다, 목사님은 있다", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const box = document.createElement("div");
    const root = createRoot(box);
    const props = { mode: "edit" as const, initial: { ...emptyForm(), name: "가온양" }, ministries: [], personId: "p1", groupId: "g1", expectedUpdatedAt: "t0", listHref: "/groups/members", canMarkLeft: true, thisYear: 2026 };
    await act(async () => root.render(<MemberForm {...props} canChooseRole={false} />));
    expect(box.querySelector('[aria-label="구분"]')).toBeNull();
    await act(async () => root.render(<MemberForm {...props} canChooseRole />));
    expect(box.querySelector('[aria-label="구분"]')).not.toBeNull();
    // 저장 단추는 늘 맨 아래 — 저장 위에 끼운 칸(목장 이동 신청)과 '목장을 떠났어요' 가 모두 위에 있다(2026-11-26)
    await act(async () => root.render(<MemberForm {...props} canChooseRole={false} beforeSave={<section data-testid="move-request" />} />));
    const order = [...box.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")).filter((t) => ["move-request", "member-left", "member-save"].includes(t!));
    expect(order).toEqual(["move-request", "member-left", "member-save"]);
    act(() => root.unmount());
  });
});

describe("저장", () => {
  it("리더가 고치기 저장에 리더를 실어 보내도 지금 구분(양)을 둔다 ★", async () => {
    me = { role: "leader", leadsGroup: true, groupId: "g1" };
    writes.length = 0;
    const r = await saveMember("p1", { ...emptyForm(), name: "가온양", group_role: "leader" }, "t0");
    expect(r.ok).toBe(true);
    expect(writes.find((w) => w.op === "update")?.row.group_role).toBe("member");
  });

  it("목사님은 고치기에서 양을 리더로 올린다", async () => {
    me = { role: "pastor", leadsGroup: false, groupId: null };
    writes.length = 0;
    await saveMember("p1", { ...emptyForm(), name: "가온양", group_role: "leader" }, "t0");
    expect(writes.find((w) => w.op === "update")?.row.group_role).toBe("leader");
  });

  it("새 사람 — 목사님은 고른 구분(리더) 그대로, 리더는 양으로 ★", async () => {
    me = { role: "pastor", leadsGroup: false, groupId: null };
    writes.length = 0;
    await addMember("g2", { ...emptyForm(), name: "새리더", group_role: "leader" });
    expect(writes.find((w) => w.op === "insert")?.row.group_role).toBe("leader");
    me = { role: "leader", leadsGroup: true, groupId: "g1" };
    writes.length = 0;
    await addMember("g1", { ...emptyForm(), name: "새양", group_role: "leader" });
    expect(writes.find((w) => w.op === "insert")?.row.group_role).toBe("member");
  });
});
