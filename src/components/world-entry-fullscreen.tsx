"use client";

import { useEffect } from "react";

import { currentDisplayMode } from "@/lib/display-mode";
import { enterWorldFullscreen, isWorldHref, worldFullscreenWanted } from "@/lib/world-fullscreen";

/**
 * 월드로 들어가는 단추(홈 '들어가기' · 전체 메뉴 · 상점 '입어 보기' …)를 누르면, 이동하기 전에 그 누름 안에서 막대를 숨긴다(2026-11-25).
 * 안드로이드 홈 화면 앱이 아직 standalone 으로 열릴 때만(lib/world-fullscreen). 성공하면 가로 고정도 시도하고, 실패는 조용히 넘어간다.
 * 링크마다 붙이지 않고 문서 전체의 누름을 먼저(capture) 본다 — 월드로 가는 링크가 새로 생겨도 빠지지 않게.
 */
export function WorldEntryFullscreen() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (!worldFullscreenWanted(navigator.userAgent, currentDisplayMode())) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || !isWorldHref(a.getAttribute("href") ?? "", location.origin)) return;
      void enterWorldFullscreen();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
