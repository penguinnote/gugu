"use client";

import { useEffect } from "react";

/**
 * 서비스 워커(public/sw.js)를 모든 기기에 건다(2026-11-01) — 앱 시작 페이지(public/launch.html)를 기기에 담아 두려면
 * 알림을 켜지 않은 기기에도 있어야 한다. 처음 한 번은 걸리기만 하고, 다음에 앱을 켤 때부터 시작 페이지가 먼저 뜬다.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
