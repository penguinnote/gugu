/**
 * 로뎀 월드 전체 화면 · 가로 고정(2026-11-25 사용자 결정) — 안드로이드만.
 *
 *   가로 고정   월드에 들어가면 screen.orientation.lock("landscape") 를 시도하고 나갈 때 unlock. 성공하면 휴대폰이 진짜 가로가 되어
 *              월드 판을 돌려 그리지 않는다(world-shell 의 세로 조건이 꺼진다). 실패하면 지금처럼 돌려 그린다.
 *   Fullscreen  매니페스트 display_override 의 전체 화면이 아직 적용되지 않은 안드로이드 홈 화면 앱(display-mode standalone)에서만,
 *              월드로 들어가는 누름 안에서 requestFullscreen({ navigationUI: "hide" }) 로 막대를 숨긴다. 월드 안 '전체 화면' 단추도 이때만.
 *   아이폰 · 데스크톱은 아무것도 부르지 않는다.
 */

import type { DisplayMode } from "@/lib/display-mode";

const isAndroid = (ua: string) => /Android/i.test(ua);

/** 가로 고정을 시도하나 — 안드로이드면 */
export function worldLockWanted(ua: string): boolean {
  return isAndroid(ua);
}

/** Fullscreen API 로 막대를 숨기나 — 안드로이드 홈 화면 앱이 standalone 으로 남았을 때만(fullscreen 이면 이미 막대가 없다) */
export function worldFullscreenWanted(ua: string, mode: DisplayMode): boolean {
  return isAndroid(ua) && mode === "standalone";
}

type OrientationLike = { lock?: (o: string) => Promise<void>; unlock?: () => void };
type DocLike = {
  fullscreenElement?: Element | null;
  fullscreenEnabled?: boolean;
  documentElement: { requestFullscreen?: (o?: { navigationUI?: "hide" | "show" | "auto" }) => Promise<void> };
  exitFullscreen?: () => Promise<void>;
};

const orientationOf = (): OrientationLike | undefined =>
  typeof screen !== "undefined" ? (screen.orientation as unknown as OrientationLike | undefined) : undefined;

/** 가로 고정 — 성공하면 null, 실패하면 오류 이름(진단 화면이 보여 준다) */
export async function lockLandscape(o: OrientationLike | undefined = orientationOf()): Promise<string | null> {
  if (!o || typeof o.lock !== "function") return "NotSupported";
  try {
    await o.lock("landscape");
    return null;
  } catch (e) {
    return e instanceof Error && e.name ? e.name : "Error";
  }
}

export function unlockOrientation(o: OrientationLike | undefined = orientationOf()): void {
  try {
    o?.unlock?.();
  } catch {}
}

/** 막대 숨기기 — 누른 손길 안에서 불러야 한다. 성공하면 가로 고정도 시도. 실패는 조용히 넘어간다 */
export async function enterWorldFullscreen(doc: DocLike = document, o: OrientationLike | undefined = orientationOf()): Promise<boolean> {
  const req = doc.documentElement.requestFullscreen;
  if (!doc.fullscreenEnabled || typeof req !== "function" || doc.fullscreenElement) return false;
  try {
    await req.call(doc.documentElement, { navigationUI: "hide" });
  } catch {
    return false;
  }
  await lockLandscape(o);
  return true;
}

/** 월드를 떠날 때 — 전체 화면이면 풀고, 가로 고정도 푼다 */
export function leaveWorldFullscreen(doc: DocLike = document, o: OrientationLike | undefined = orientationOf()): void {
  if (doc.fullscreenElement && typeof doc.exitFullscreen === "function") void doc.exitFullscreen().catch(() => undefined);
  unlockOrientation(o);
}

/** 월드 주소인가 — /world, /world?open=dress … */
export function isWorldHref(href: string, origin: string): boolean {
  try {
    const u = new URL(href, origin);
    return u.origin === origin && u.pathname === "/world";
  } catch {
    return false;
  }
}
