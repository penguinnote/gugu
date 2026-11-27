"use client";

import { useEffect, useState } from "react";

import { statusBarColor, underShade, type TopColor } from "@/lib/system-bar";

/**
 * 안드로이드 상태바 색(2026-11-09) — <meta name="theme-color"> 하나를 head 맨 앞에 두고 지금 화면에 맞춰 바꾼다.
 *   크롬은 맨 앞의 theme-color 를 쓰므로, 이 한 장이 layout 의 한 장(자바스크립트 전 첫 화면용)을 이긴다.
 *   색 = 화면이 알린 머리 색(useStatusTop) — 없으면 바닥색(어두운 모드는 2026-11-10 뺐다).
 * 아래 내비게이션 바는 매니페스트 theme_color 로만 칠해져 여기서 바꿀 수 없다(lib/system-bar.ts).
 * iOS 홈 화면 앱은 black-translucent 라 이 값을 쓰지 않는다.
 */

type Entry = { id: number; color: TopColor };
let seq = 0;
const entries: Entry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const currentTop = (): TopColor => (entries.length ? entries[entries.length - 1].color : null);

/** 이 화면의 머리 색을 알린다 — 나중에 알린 것이 이긴다, 화면이 사라지면 지운다 */
export function useStatusTop(color: TopColor) {
  useEffect(() => {
    const entry: Entry = { id: ++seq, color };
    entries.push(entry);
    emit();
    return () => {
      const i = entries.findIndex((e) => e.id === entry.id);
      if (i >= 0) entries.splice(i, 1);
      emit();
    };
  }, [color]);
}

/** 서버 화면에서 머리 색을 알릴 때 */
export function StatusTop({ color }: { color: TopColor }) {
  useStatusTop(color);
  return null;
}

export const META_ID = "gg-theme-color";

/** 뿌리 레이아웃에 하나 */
export function ThemeColor() {
  useEffect(() => {
    let meta = document.getElementById(META_ID) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.id = META_ID;
      meta.name = "theme-color";
      document.head.prepend(meta);
    }
    const el = meta;
    const apply = () => {
      const c = statusBarColor(currentTop());
      if (el.content !== c) el.content = c;
    };
    apply();
    listeners.add(apply);
    return () => {
      listeners.delete(apply);
    };
  }, []);
  return null;
}

/**
 * 머리 그림의 맨 위 색 — 그림 칸(container) 맨 위에 실제로 보이는 줄을 읽어, 그 위에 덮인 검은 그늘(shade)까지 셈한다.
 * object-cover 로 잘린 만큼을 따져 칸 맨 위에 걸린 그림 줄을 고른다. 같은 출처 그림만 읽힌다(월드 사진도 앱 주소로 받는다).
 */
export function readPhotoTop(container: HTMLElement, shade: number): string | null {
  const img = container.querySelector("img");
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  try {
    const box = img.getBoundingClientRect();
    const top = container.getBoundingClientRect().top;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const s = Math.max(box.width / nw, box.height / nh);
    if (!s || !Number.isFinite(s)) return null;
    const drawnTop = box.top + (box.height - nh * s) / 2;
    const sy = Math.min(nh - 1, Math.max(0, (top - drawnTop) / s));
    const sh = Math.max(1, Math.min(nh - sy, nh / 60));
    const W = 16;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, sy, nw, sh, 0, 0, W, 1);
    const d = ctx.getImageData(0, 0, W, 1).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < W; i++) for (let k = 0; k < 3; k++) sum[k] += d[i * 4 + k];
    return underShade([sum[0] / W, sum[1] / W, sum[2] / W], shade);
  } catch {
    return null;
  }
}

/** 그림 칸의 맨 위 색 — 그림이 다 받아진 뒤 읽는다. 읽기 전에는 fallback */
export function usePhotoTop(selector: string, shade: number, fallback: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    const container = document.querySelector<HTMLElement>(selector);
    const img = container?.querySelector("img");
    if (!container || !img) return;
    const read = () => setColor(readPhotoTop(container, shade));
    if (img.complete) read();
    img.addEventListener("load", read);
    return () => img.removeEventListener("load", read);
  }, [selector, shade]);
  return color ?? fallback;
}

/** 스크롤하지 않는 그림 머리(홈) — 그림 맨 위 색을 상태바에 */
export function PhotoTop({ selector, shade, fallback }: { selector: string; shade: number; fallback: string | null }) {
  useStatusTop(usePhotoTop(selector, shade, fallback));
  return null;
}
