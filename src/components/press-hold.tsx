"use client";

import { useEffect } from "react";

/**
 * 누른 회색을 다음 화면이 뜰 때까지 붙잡아 둔다(2026-11-10 사용자 요청).
 *
 * 누르는 동안의 회색(globals.css 의 :active)은 손을 떼는 순간 사라지는데, 다음 화면은 0.1~0.2초 뒤에 뜬다.
 * 그 사이 아무 표시 없이 멈춘 듯 보여서 — 앱 안으로 가는 링크를 누르면 그 링크에 data-pressing 을 달아 회색을 그대로 두고,
 * 주소가 바뀌면(= 다음 화면이 그려지면 Next 가 주소를 바꾼다) 뗀다. 같은 주소 · 새 창 · 바깥 주소 · 다운로드는 건드리지 않는다.
 * 주소가 끝내 안 바뀌면(실패 · 막힘) 4초 뒤에 뗀다.
 */
const HOLD_MAX_MS = 4000;

export function PressHold() {
  useEffect(() => {
    let held: HTMLElement | null = null;
    let raf = 0;
    let started = 0;
    let from = "";

    const release = () => {
      cancelAnimationFrame(raf);
      held?.removeAttribute("data-pressing");
      held = null;
    };
    const watch = () => {
      if (!held) return;
      if (location.href !== from || !held.isConnected || performance.now() - started > HOLD_MAX_MS) {
        release();
        return;
      }
      raf = requestAnimationFrame(watch);
    };

    /** 붙잡을 링크 — 앱 안의 다른 화면으로 가는 것만(같은 화면 · 새 창 · 바깥 주소 · 다운로드는 아니다) */
    const linkOf = (el: EventTarget | null): HTMLAnchorElement | null => {
      const a = (el as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return null;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return null;
      if (to.pathname === location.pathname && to.search === location.search) return null; // 같은 화면(해시만 다름 포함)
      return a;
    };

    // 손가락이 닿는 순간부터 회색을 붙잡는다(2026-11-11 — 예전엔 클릭 때부터라, 손을 떼고 클릭이 오기 전 사이에 회색이 한 번 깜빡였다).
    // 끌어서 스크롤하면(pointercancel) 놓고, 손을 뗐는데 클릭이 안 오면(길게 누름 등) 잠시 뒤 놓는다
    let pre: HTMLAnchorElement | null = null;
    let preT: ReturnType<typeof setTimeout> | undefined;
    const dropPre = () => {
      clearTimeout(preT);
      if (pre && pre !== held) pre.removeAttribute("data-pressing");
      pre = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dropPre();
      const a = linkOf(e.target);
      if (!a) return;
      pre = a;
      a.setAttribute("data-pressing", "");
    };
    const onUp = () => {
      clearTimeout(preT);
      if (pre) preT = setTimeout(dropPre, 450);
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return dropPre();
      const a = linkOf(e.target);
      if (!a) return dropPre();
      clearTimeout(preT);
      if (held !== a) release();
      pre = null;
      held = a;
      from = location.href;
      started = performance.now();
      a.setAttribute("data-pressing", "");
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(watch);
    };

    // 링크 · 단추를 길게 누르면 뜨는 것 막기(2026-11-11) — 안드로이드 '새 탭에서 열기' 메뉴(아이폰 미리보기는 CSS -webkit-touch-callout),
    // 아이폰에서 링크가 주소 상자로 떠서 끌리는 것(dragstart · CSS -webkit-user-drag)
    const onMenu = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("a[href], button") && !el.closest("input, textarea, [contenteditable]")) e.preventDefault();
    };

    const onDrag = (e: DragEvent) => {
      if ((e.target as Element | null)?.closest?.("a[href], img")) {
        e.preventDefault();
        dropPre();
      }
    };

    // 뒤로 가기로 돌아왔을 때 남은 표시가 없게
    const onShow = () => release();

    // 붙잡기(capture) 단계에서 본다 — next/link 가 제 onClick 에서 preventDefault 하고 직접 옮겨 가서, 거품 단계에선 이미 막힌 클릭으로 보인다
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", dropPre, true);
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("dragstart", onDrag);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("popstate", onShow);
    return () => {
      release();
      dropPre();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", dropPre, true);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("dragstart", onDrag);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("popstate", onShow);
    };
  }, []);

  return null;
}
