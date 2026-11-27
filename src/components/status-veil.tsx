"use client";

import { useEffect, useState } from "react";

import { usePhotoTop, useStatusTop } from "./theme-color";

/**
 * 그림 머리 화면의 시계 자리(2026-10-24) — 맨 위에선 비어 있어 머리 그림이 시계 밑까지 그대로 보이고,
 * 스크롤해서 그림이 시계 자리 위로 다 올라가면 바탕색 유리(흐림)가 깔려 내용이 그 밑으로 지나간다.
 * 그림 한 조각을 시계 자리에 붙여 두던 것은 스크롤하면 산 그림만 위에 남아 잘려 보였다(실기기).
 * 안드로이드(2026-11-09): 상태바는 페이지 밖이라 그림이 올라가지 않는다 — 대신 상태바를 그림 맨 위 색(그늘 shade 포함)으로 칠하고,
 * 유리가 깔리는 때에는 바닥색으로 바꾼다(theme-color.tsx).
 */
export function StatusVeil({ shade, fallback, never = false }: { shade: number; fallback: string | null; never?: boolean }) {
  const [on, setOn] = useState(false);
  const photoTop = usePhotoTop("[data-testid=tab-photo]", shade, fallback);
  useStatusTop(on ? null : photoTop);
  useEffect(() => {
    const photo = document.querySelector<HTMLElement>("[data-testid=tab-photo]");
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:var(--nn-safe-top);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const safeTop = probe.offsetHeight;
    probe.remove();
    // 그림의 아래 끝(바탕색으로 녹아든 곳)이 시계 자리 밑에 닿을 때 켠다
    const at = () => (photo ? photo.offsetHeight - safeTop - 24 : 0);
    // 반쯤 고정(pin)이면 그림이 늘 시계 밑에 있다 — 유리를 깔지 않는다
    const onScroll = () => setOn(!never && window.scrollY > at());
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [never]);
  return (
    <div
      aria-hidden
      data-on={on}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 md:left-[var(--nn-side)] h-[var(--nn-safe-top)] bg-[var(--background)]/80 opacity-0 backdrop-blur-xl transition-opacity duration-200 data-[on=true]:opacity-100 print:hidden"
    />
  );
}
