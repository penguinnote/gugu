/**
 * 아이폰 홈 화면 앱의 첫 화면 그림(apple-touch-startup-image) 크기 — 세로 화면만.
 * w · h 는 CSS 픽셀(device-width · device-height), dpr 은 배율. 그림은 scripts/gugu-assets.mjs 가 public/splash/ 에 굽는다.
 * 그림은 흰 바탕 가운데 앱 아이콘 — 이어서 뜨는 앱 시작 페이지(public/launch.html)와 같다. 목록에 없는 기기는 흰 화면 뒤 시작 페이지가 뜬다.
 */
export const SPLASH = [
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max
  { w: 402, h: 874, dpr: 3 }, // 16 Pro
  { w: 430, h: 932, dpr: 3 }, // 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro · 15 · 15 Pro · 16
  { w: 428, h: 926, dpr: 3 }, // 12 Pro Max · 13 Pro Max · 14 Plus
  { w: 390, h: 844, dpr: 3 }, // 12 · 13 · 14 · 12 Pro · 13 Pro
  { w: 375, h: 812, dpr: 3 }, // X · XS · 11 Pro · 12 mini · 13 mini
  { w: 414, h: 896, dpr: 3 }, // XS Max · 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // XR · 11
  { w: 375, h: 667, dpr: 2 }, // SE 2 · SE 3 · 8
] as const;

export function splashMedia(d: (typeof SPLASH)[number]): string {
  return `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`;
}
