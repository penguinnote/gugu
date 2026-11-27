import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 내 AI 동의(2026-11-13) — 켜고 끌 때 확인 창을 먼저. 확인해야 저장되고, 취소하면 그대로(사용자 요청).
 */
const setMyAiConsent = vi.fn();
vi.mock("@/app/(tabs)/me/consent/actions", () => ({ setMyAiConsent: (on: boolean) => setMyAiConsent(on) }));
const { MyAiConsent } = await import("@/app/(tabs)/me/consent/my-ai-consent");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  setMyAiConsent.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const box = () => q<HTMLInputElement>("[data-testid=my-ai-consent]")!;

describe("MyAiConsent", () => {
  it("켜려고 누르면 확인 창 — 동의를 눌러야 저장되고 날짜가 생긴다 ★", async () => {
    setMyAiConsent.mockResolvedValue({ ok: true, at: "2026-11-13T05:00:00.000Z" });
    act(() => root.render(<MyAiConsent initial={null} />));
    act(() => box().click());
    expect(setMyAiConsent).not.toHaveBeenCalled();
    expect(box().checked).toBe(false);
    expect(q("[data-testid=my-ai-confirm]")!.textContent).toContain("AI 동의를 켤까요?");
    await act(async () => q<HTMLButtonElement>("[data-testid=confirm-ok]")!.click());
    expect(setMyAiConsent).toHaveBeenCalledWith(true);
    expect(box().checked).toBe(true);
    expect(q("[data-testid=my-ai-date]")!.textContent).toContain("동의");
    expect(q("[data-testid=my-ai-confirm]")).toBeNull();
  });

  it("끄려고 누르면 '거둘까요?' — 취소하면 아무것도 바뀌지 않는다 ★", () => {
    act(() => root.render(<MyAiConsent initial="2026-11-01T00:00:00.000Z" />));
    act(() => box().click());
    expect(q("[data-testid=my-ai-confirm]")!.textContent).toContain("AI 동의를 거둘까요?");
    act(() => q<HTMLButtonElement>("[data-testid=confirm-cancel]")!.click());
    expect(setMyAiConsent).not.toHaveBeenCalled();
    expect(box().checked).toBe(true);
    expect(q("[data-testid=my-ai-confirm]")).toBeNull();
  });

  it("거두기를 확인하면 저장되고 칸이 꺼진다, 실패하면 그대로 두고 사유를 보인다", async () => {
    setMyAiConsent.mockResolvedValueOnce({ ok: false, message: "저장하지 못했습니다." });
    act(() => root.render(<MyAiConsent initial="2026-11-01T00:00:00.000Z" />));
    act(() => box().click());
    await act(async () => q<HTMLButtonElement>("[data-testid=confirm-ok]")!.click());
    expect(box().checked).toBe(true);
    expect(host.textContent).toContain("저장하지 못했습니다.");
    setMyAiConsent.mockResolvedValueOnce({ ok: true, at: null });
    act(() => box().click());
    await act(async () => q<HTMLButtonElement>("[data-testid=confirm-ok]")!.click());
    expect(setMyAiConsent).toHaveBeenLastCalledWith(false);
    expect(box().checked).toBe(false);
  });
});
