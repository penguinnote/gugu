import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 목사님 — 주 고르기 · 목장 보고서 피드백 현황(미확인 · 확인됨, 2026-11-26) */
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
const { WeekPicker, PICK_WEEKS } = await import("@/app/(tabs)/pastor/week-picker");
const { FeedbackSection } = await import("@/app/(tabs)/pastor/feedback");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("주 고르기", () => {
  it("이번 주부터 1년 전까지 — 고르면 그 주로 바로 간다 ★", async () => {
    await act(async () => root.render(<WeekPicker weekKey="2026-11-22" thisWeek="2026-11-22" basePath="/pastor" />));
    const sel = container.querySelector("select")!;
    expect(sel.options).toHaveLength(PICK_WEEKS);
    expect(sel.options[0].textContent).toBe("이번 주");
    await act(async () => {
      sel.value = "2026-10-04";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(replace).toHaveBeenCalledWith("/pastor?week=2026-10-04");
  });
});

describe("목장 보고서 피드백 현황", () => {
  const row = (id: string, week: string, g: string, note?: string) => ({ report_id: id, week_key: week, group_name: g, note });
  it("제목 아래 미확인 → 확인됨 순서, 주와 목장 이름, 누르면 그 보고서 — 더 있으면 '더 보기' ★", async () => {
    await act(async () =>
      root.render(
        <FeedbackSection
          pending={{ rows: [row("a", "2026-11-15", "가온"), row("b", "2026-11-08", "나래")], total: 3, moreHref: "/pastor?more=10" }}
          done={{ rows: [row("c", "2026-11-15", "다솜", "기도하겠습니다")], total: 1, moreHref: null }}
        />,
      ),
    );
    const box = container.querySelector("[data-testid=feedback]")!;
    expect(box.querySelector("h2")?.textContent).toBe("목장 보고서 피드백 현황");
    const order = [...box.querySelectorAll("[data-testid^=feedback-]")].map((e) => e.getAttribute("data-testid")).filter((t) => t === "feedback-pending" || t === "feedback-done");
    expect(order).toEqual(["feedback-pending", "feedback-done"]);
    const pending = box.querySelector("[data-testid=feedback-pending]")!;
    expect(pending.textContent).toContain("미확인");
    expect(pending.textContent).toContain("3개");
    expect([...pending.querySelectorAll<HTMLAnchorElement>("[data-testid=feedback-row]")].map((a) => a.getAttribute("href"))).toEqual([
      "/pastor/reports/%EA%B0%80%EC%98%A8?week=2026-11-15",
      "/pastor/reports/%EB%82%98%EB%9E%98?week=2026-11-08",
    ]);
    expect(pending.querySelector("[data-testid=feedback-pending-more]")?.getAttribute("href")).toBe("/pastor?more=10");
    const done = box.querySelector("[data-testid=feedback-done]")!;
    expect(done.textContent).toContain("확인됨");
    expect(done.textContent).toContain("기도하겠습니다");
    expect(done.querySelector("[data-testid=feedback-done-more]")).toBeNull();
  });
  it("둘 다 없으면 칸이 없다", async () => {
    await act(async () => root.render(<FeedbackSection pending={{ rows: [], total: 0, moreHref: null }} done={{ rows: [], total: 0, moreHref: null }} />));
    expect(container.querySelector("[data-testid=feedback]")).toBeNull();
  });
});
