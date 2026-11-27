import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moveDecisionMessage, moveRequestMessage } from "@/lib/push/messages";

/** 목장 이동 신청(2026-11-26) — 화면 · 알림 문구 */
const decideMove = vi.fn(async () => ({ ok: true }));
const cancelMove = vi.fn(async () => ({ ok: true }));
const requestMove = vi.fn(async () => ({ ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(tabs)/groups/members/move-actions", () => ({
  decideMove: (...a: unknown[]) => decideMove(...(a as [])),
  cancelMove: (...a: unknown[]) => cancelMove(...(a as [])),
  requestMove: (...a: unknown[]) => requestMove(...(a as [])),
}));
const { MoveInbox } = await import("@/app/(tabs)/groups/members/move-inbox");
const { MoveRequest } = await import("@/app/(tabs)/groups/members/move-request");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  [decideMove, cancelMove, requestMove].forEach((f) => f.mockClear());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const item = (o: Partial<Parameters<typeof MoveInbox>[0]["items"][number]> = {}) => ({
  id: "m1", person_name: "김하늘", from_group_name: "가온", to_group_name: "자람", direction: "push", note: "이사", requester_name: "윤은결", can_decide: true, mine: false, ...o,
});

describe("받은 신청", () => {
  it("받는 쪽 리더는 수락 · 거절 ★", async () => {
    await act(async () => root.render(<MoveInbox items={[item()]} />));
    expect(container.textContent).toContain("김하늘 · 가온 목장 → 자람 목장");
    await act(async () => container.querySelector<HTMLElement>("[data-testid=move-accept]")!.click());
    expect(decideMove).toHaveBeenCalledWith("m1", true);
  });
  it("내가 건 신청은 취소만", async () => {
    await act(async () => root.render(<MoveInbox items={[item({ can_decide: false, mine: true })]} />));
    expect(container.querySelector("[data-testid=move-accept]")).toBeNull();
    await act(async () => container.querySelector<HTMLElement>("[data-testid=move-cancel]")!.click());
    expect(cancelMove).toHaveBeenCalledWith("m1");
  });
  it("없으면 칸이 없다", async () => {
    await act(async () => root.render(<MoveInbox items={[]} />));
    expect(container.querySelector("[data-testid=move-inbox]")).toBeNull();
  });
});

describe("사람 화면의 신청", () => {
  it("옮길 목장(지금 목장 빼고)을 고르고 메모와 함께 신청 ★", async () => {
    await act(async () => root.render(<MoveRequest personId="p1" groupId="g1" groups={[{ id: "g1", name: "가온" }, { id: "g2", name: "자람" }]} pending={null} />));
    const sel = container.querySelector<HTMLSelectElement>("[data-testid=move-target]")!;
    expect([...sel.options].map((o) => o.value)).toEqual(["", "g2"]);
    await act(async () => {
      sel.value = "g2";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const note = container.querySelector<HTMLInputElement>("[data-testid=move-note]")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(note, "이사해요");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLElement>("[data-testid=move-submit]")!.click());
    expect(requestMove).toHaveBeenCalledWith("p1", "g2", "이사해요");
  });
  it("대기 중이면 그 줄과 취소", async () => {
    await act(async () => root.render(<MoveRequest personId="p1" groupId="g1" groups={[]} pending={item({ mine: true, can_decide: false })} />));
    expect(container.querySelector("[data-testid=move-pending]")?.textContent).toContain("대기 중");
  });
});

describe("알림 문구", () => {
  it("보내기 · 데려오기 · 결과", () => {
    expect(moveRequestMessage("push", "김하늘", "가온", "자람").body).toBe("가온 목장에서 김하늘 님의 목장 이동을 신청했어요");
    expect(moveRequestMessage("pull", "김하늘", "가온", "자람").body).toBe("자람 목장에서 김하늘 님을 데려가고 싶다고 신청했어요");
    expect(moveDecisionMessage(true, "김하늘", "자람").body).toBe("김하늘 님이 자람 목장으로 옮겼어요");
    expect(moveDecisionMessage(false, "김하늘", "자람").body).toBe("김하늘 님 목장 이동 신청이 거절됐어요");
  });
});
