/**
 * 홈 화면 앱인가(display-mode, 2026-11-25) — 알림 켜기 · 화면 진단 · 로뎀 월드 전체 화면이 같은 규칙을 쓴다.
 * 안드로이드 매니페스트에 display_override ["fullscreen", "standalone"] 을 더하면서 홈 화면 앱이 fullscreen 으로도 열린다.
 * 설치 안내 머리 스크립트(lib/install-env INSTALL_HEAD_SCRIPT)는 문자열이라 같은 규칙(standalone · fullscreen · minimal-ui)을 따로 적어 두었다.
 */

export type DisplayMode = "fullscreen" | "standalone" | "minimal-ui" | "browser";

const MODES: DisplayMode[] = ["fullscreen", "standalone", "minimal-ui", "browser"];

/** 지금의 display-mode — matchMedia 가 없으면(시험 · 서버) browser */
export function currentDisplayMode(mm: ((q: string) => { matches: boolean }) | undefined = typeof window !== "undefined" ? window.matchMedia?.bind(window) : undefined): DisplayMode {
  if (typeof mm !== "function") return "browser";
  for (const m of MODES) if (mm(`(display-mode: ${m})`).matches) return m;
  return "browser";
}

/** 홈 화면 앱 — standalone · fullscreen · minimal-ui. 브라우저 탭(browser)은 아니다 */
export function isHomeScreenApp(mode: DisplayMode): boolean {
  return mode !== "browser";
}
