import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI 동의 한꺼번에(2026-11-13) — 체크한 사람 · 푼 사람만 보내고, 찾기로 줄을 거른다. 이름은 지어낸 것.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { ConsentBoard } = await import("@/app/(tabs)/admin/people/ai-consent/consent-board");

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const GROUPS = [
  { id: "g1", name: "토브" },
  { id: "g2", name: "새벽" },
];
const PEOPLE = [
  { id: id(1), name: "가나다", groupId: "g1", leader: true, consentedAt: "2026-11-01T00:00:00.000Z" },
  { id: id(2), name: "라마바", groupId: "g1", leader: false, consentedAt: null },
  { id: id(3), name: "사아자", groupId: "g2", leader: false, consentedAt: null },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const box = (pid: string) => host.querySelector<HTMLInputElement>(`[data-person="${pid}"]`)!;
const saveBtn = () => host.querySelector<HTMLButtonElement>("[data-testid=consent-save]")!;

describe("ConsentBoard", () => {
  it("처음엔 동의한 사람만 체크, 바뀐 게 없으면 저장 단추가 꺼져 있다", () => {
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={vi.fn()} />));
    expect(box(id(1)).checked).toBe(true);
    expect(box(id(2)).checked).toBe(false);
    expect(host.querySelector("[data-testid=consent-count]")!.textContent).toBe("동의 1 / 3명");
    expect(saveBtn().disabled).toBe(true);
  });

  it("체크한 사람은 동의로, 푼 사람은 철회로 — 바뀐 사람만 보낸다 ★", async () => {
    const save = vi.fn(async (on: string[], off: string[]) => ({ ok: true as const, on: on.length, off: off.length }));
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={save} />));
    act(() => box(id(2)).click());
    act(() => box(id(3)).click());
    act(() => box(id(1)).click());
    expect(saveBtn().textContent).toBe("저장 · 동의 2명 · 철회 1명");
    act(() => saveBtn().click());
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector("[data-testid=consent-confirm]")!.textContent).toContain("동의 2명 · 철회 1명을 저장할까요?");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-testid=confirm-ok]")!.click());
    expect(save).toHaveBeenCalledWith([id(2), id(3)], [id(1)]);
    expect(host.textContent).toContain("저장했습니다 — 동의 2명 · 철회 1명");
  });

  it("다시 체크해 원래대로 돌리면 보낼 것이 없다", () => {
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={vi.fn()} />));
    act(() => box(id(2)).click());
    act(() => box(id(2)).click());
    expect(saveBtn().disabled).toBe(true);
  });

  it("이름 찾기 — 맞는 사람의 목장만 남는다(띄어쓰기 무시)", () => {
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={vi.fn()} />));
    const input = host.querySelector<HTMLInputElement>("input[type=search]")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "사 아");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll("[data-testid=consent-check]")).toHaveLength(1);
    expect(box(id(3))).not.toBeNull();
  });

  it("저장이 실패하면 사유를 보인다", async () => {
    const save = vi.fn(async () => ({ ok: false as const, message: "고른 사람이 올바르지 않습니다." }));
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={save} />));
    act(() => box(id(2)).click());
    act(() => saveBtn().click());
    await act(async () => host.querySelector<HTMLButtonElement>("[data-testid=confirm-ok]")!.click());
    expect(host.textContent).toContain("고른 사람이 올바르지 않습니다.");
  });

  it("확인 창에서 취소하면 저장하지 않는다", () => {
    const save = vi.fn();
    act(() => root.render(<ConsentBoard people={PEOPLE} groups={GROUPS} save={save} />));
    act(() => box(id(2)).click());
    act(() => saveBtn().click());
    act(() => host.querySelector<HTMLButtonElement>("[data-testid=confirm-cancel]")!.click());
    expect(host.querySelector("[data-testid=consent-confirm]")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
