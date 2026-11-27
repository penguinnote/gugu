"use client";

import { useEffect } from "react";

/**
 * 글자 칸에 손가락이 들어가 있는 동안(휴대폰 키보드가 떠 있는 동안) <html data-kb> 를 단다(2026-10-14).
 * 아이폰은 키보드가 뜨면 아래 고정 막대(탭바 · 보고서 제출 막대)를 키보드 위로 끌어올린다 —
 * 그동안은 .kb-hide 를 숨겨 제자리(키보드 뒤)에 있는 것처럼 둔다. 체크박스 · 단추는 키보드를 띄우지 않으니 빼고,
 * 칸에서 칸으로 옮겨 갈 때 깜빡이지 않게 나갈 때는 잠깐 기다린다.
 */
const TEXT = new Set(["text", "search", "email", "tel", "url", "number", "password", ""]);

function typing(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT.has(el.type);
  return el.isContentEditable;
}

export function KeyboardWatch() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    let off: ReturnType<typeof setTimeout> | undefined;
    const onIn = (e: FocusEvent) => {
      if (!typing(e.target)) return;
      clearTimeout(off);
      root.dataset.kb = "1";
    };
    const onOut = () => {
      clearTimeout(off);
      off = setTimeout(() => {
        if (!typing(document.activeElement)) delete root.dataset.kb;
      }, 120);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      clearTimeout(off);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      delete root.dataset.kb;
    };
  }, []);
  return null;
}
