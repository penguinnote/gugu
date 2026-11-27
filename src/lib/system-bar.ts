/**
 * 안드로이드 홈 화면 앱(WebAPK)의 시스템 막대 색(2026-11-09).
 *   상태바(위)   = 페이지의 <meta name="theme-color"> — 실행 중에 바꾸면 바로 바뀐다. 화면 머리 색에 맞춘다.
 *   내비게이션 바(아래) = 매니페스트 theme_color 한 가지(설치할 때 WebAPK 에 들어간다) — 바닥색.
 * 어두운 모드는 없다(2026-11-10 뺐다 — 아래 막대를 어두운 화면과 맞출 수 없어서). 바닥색은 하나다.
 * iOS 홈 화면 앱은 black-translucent 라 theme-color 를 쓰지 않는다(시계 자리는 페이지가 그린다).
 */

/** 앱 바닥색 — globals.css --background, 매니페스트 theme_color 와 같다 */
export const BAR_BG = "#f3f4f6";
/** 하늘 머리 — globals.css --status, 안쪽 화면 머리(AppHeader) 그라데이션의 맨 위 */
export const STATUS_SKY = "#5e8cae";
/** 로뎀 월드 하늘 맨 위 */
export const WORLD_SKY = "#8fcdee";

/** 위 막대 색 — 화면 머리 색, null 은 바닥색 */
export type TopColor = string | null;

/** 지금 상태바에 칠할 색 */
export function statusBarColor(top: TopColor): string {
  return top ?? BAR_BG;
}

/** 그림 맨 위 색 위에 검은 막(머리 그림의 위쪽 그늘, 알파 a)을 덮은 색 */
export function underShade(rgb: readonly [number, number, number], a: number): string {
  const k = Math.min(1, Math.max(0, 1 - a));
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c)) * k).toString(16).padStart(2, "0")).join("")}`;
}
