import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PressHold } from "@/components/press-hold";

/**
 * 누른 회색 붙잡기(2026-11-10) — 앱 안 링크를 누르면 다음 화면이 뜰 때(주소가 바뀔 때)까지 data-pressing 을 단다.
 */

let host: HTMLDivElement;
let root: Root;

function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "가기";
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  // 실제 이동은 막는다(next/link 처럼) — jsdom 은 이동을 못 한다
  a.addEventListener("click", (e) => e.preventDefault());
  document.body.appendChild(a);
  return a;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  history.replaceState(null, "", "/");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<PressHold />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("누른 회색 붙잡기", () => {
  it("앱 안 링크는 주소가 바뀔 때까지 붙잡는다", () => {
    const a = link("/groups");
    a.click();
    expect(a.hasAttribute("data-pressing")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(a.hasAttribute("data-pressing")).toBe(true);
    history.pushState(null, "", "/groups");
    vi.advanceTimersByTime(20);
    expect(a.hasAttribute("data-pressing")).toBe(false);
  });

  it("주소가 끝내 안 바뀌면 4초 뒤에 뗀다", () => {
    const a = link("/groups");
    a.click();
    vi.advanceTimersByTime(4100);
    expect(a.hasAttribute("data-pressing")).toBe(false);
  });

  it("같은 화면 · 새 창 · 바깥 주소는 붙잡지 않는다", () => {
    for (const a of [link("/"), link("/#top"), link("/groups", { target: "_blank" }), link("https://example.com/")]) {
      a.click();
      expect(a.hasAttribute("data-pressing")).toBe(false);
    }
  });

  it("손가락이 닿는 순간부터 붙잡고, 끌어서 스크롤하면 놓는다(2026-11-11)", () => {
    const a = link("/groups");
    a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(a.hasAttribute("data-pressing")).toBe(true);
    a.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
    expect(a.hasAttribute("data-pressing")).toBe(false);
  });

  it("손을 뗐는데 클릭이 안 오면(길게 누름) 잠시 뒤 놓는다 · 길게 누른 메뉴는 막는다", () => {
    const a = link("/groups");
    a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    a.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    a.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    expect(a.hasAttribute("data-pressing")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(a.hasAttribute("data-pressing")).toBe(false);
  });

  it("링크를 끌어 옮기지 못한다(아이폰 길게 누르면 주소 상자)", () => {
    const a = link("/groups");
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    a.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
  });

  it("다른 링크를 누르면 앞의 것은 뗀다", () => {
    const a = link("/groups");
    const b = link("/records");
    a.click();
    b.click();
    expect(a.hasAttribute("data-pressing")).toBe(false);
    expect(b.hasAttribute("data-pressing")).toBe(true);
  });
});
