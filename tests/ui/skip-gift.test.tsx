import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 휴주 새 규칙(2026-11-26) — 선물 팝업(한 번) · 휴주 화면의 지난 주 */
const markSkipGiftSeen = vi.fn(async () => {});
vi.mock("@/app/(tabs)/home/actions", () => ({ markSkipGiftSeen: (...a: unknown[]) => markSkipGiftSeen(...(a as [])) }));
const setSkippedWeek = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/app/(tabs)/admin/weeks/actions", () => ({ setSkippedWeek: (...a: unknown[]) => setSkippedWeek(...(a as [])) }));
const { SkipGiftPopup } = await import("@/app/(tabs)/home/skip-gift");
const { WeeksForm } = await import("@/app/(tabs)/admin/weeks/weeks-form");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("휴주 선물 팝업", () => {
  it("'선물이 도착했어요!' 다음 줄 '열매 200개' · '확인' — 닫으면 본 것으로 적고 사라진다 ★ (2026-11-26 문구)", async () => {
    await act(async () => root.render(<SkipGiftPopup weeks={["2026-11-22"]} total={200} />));
    await act(async () => vi.advanceTimersByTime(500));
    expect(container.querySelector("[data-testid=skip-gift]")?.textContent).toContain("선물이 도착했어요!");
    expect(container.querySelector("[data-testid=skip-gift-amount]")?.textContent).toBe("열매 200개");
    expect(container.querySelector("[data-testid=skip-gift-ok]")?.textContent).toBe("확인");
    await act(async () => container.querySelector<HTMLElement>("[data-testid=skip-gift-ok]")!.click());
    expect(markSkipGiftSeen).toHaveBeenCalledWith(["2026-11-22"]);
    expect(container.querySelector("[data-testid=skip-gift]")).toBeNull();
  });
  it("못 본 선물이 없으면 뜨지 않는다", async () => {
    await act(async () => root.render(<SkipGiftPopup weeks={[]} total={0} />));
    await act(async () => vi.advanceTimersByTime(500));
    expect(container.querySelector("[data-testid=skip-gift]")).toBeNull();
  });
});

describe("휴주 화면 — 지난 주도", () => {
  it("지난 주 줄을 휴주로 정할 수 있고, '이번 주' 표시는 이번 주에만", async () => {
    vi.useRealTimers();
    const rows = [
      { weekKey: "2026-11-15", skipped: false, reason: null },
      { weekKey: "2026-11-08", skipped: false, reason: null },
    ];
    await act(async () => root.render(<WeeksForm initial={rows} thisWeek="2026-11-22" testId="weeks-past" />));
    expect(container.textContent).not.toContain("이번 주");
    await act(async () => container.querySelector<HTMLElement>('[aria-label="11월 15일 휴주 지정"]')!.click());
    expect(setSkippedWeek).toHaveBeenCalledWith("2026-11-15", true, "");
    expect(container.querySelector('[data-skipped="true"]')).not.toBeNull();
  });
});
