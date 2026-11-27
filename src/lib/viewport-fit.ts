/**
 * 화면을 어디까지 그리나(viewport-fit, 2026-11-23 사용자) — 아이폰은 cover(노치 · 홈 막대 밑까지, 로뎀 월드는 화면 끝까지),
 * 안드로이드는 auto(시스템 막대 안쪽에서 끝난다).
 *
 * 왜 나누나 — 크롬(안드로이드)은 viewport-fit=cover 인 페이지만 아래 내비게이션 바 밑까지 그린다(edge-to-edge). 그런데 갤럭시 홈 화면 앱에서
 * safe-area-inset-bottom 값이 0 으로 와서, 목장보고서 시트의 아래 단추와 탭 막대가 내비게이션 바에 반쯤 가렸다. (그때는 막대를 숨기지 않기로 했다 — 2026-11-25 홈 화면 앱은 전체 화면으로 바뀌었다, 아래.)
 * 안드로이드에서 auto 면 env(safe-area-inset-*) 가 0 이 된다 — 그 값을 쓰는 곳은 모두 'env(...) + 기본 여백' 꼴이라 기본 여백만 남는다.
 *
 * 안드로이드 전체 화면 앱(display-mode fullscreen, 2026-11-25 매니페스트 display_override)은 cover — 카메라 구멍 자리까지 그리고
 * 위쪽 safe-area 값이 구멍 높이를 주게 한다. 안드로이드 standalone · 브라우저 탭은 그대로 auto.
 *
 * 머리 스크립트(VIEWPORT_FIT_SCRIPT)가 첫 그림 전에 viewport meta 의 viewport-fit 만 바꾼다. 나머지 값(width · maximum-scale ·
 * user-scalable · interactive-widget)은 그대로. 진단 화면(/dev/insets)이 고른 값(sessionStorage)이 있으면 그것을 따른다.
 */

import type { DisplayMode } from "@/lib/display-mode";

export type ViewportFit = "cover" | "auto";

/** 진단 화면이 고른 값을 적어 두는 열쇠 — 이 탭에서만(닫으면 사라진다) */
export const VIEWPORT_FIT_KEY = "gg-viewport-fit";

/** 안드로이드면 auto(전체 화면 앱이면 cover), 그 밖(아이폰 · 아이패드 · 데스크톱)은 cover */
export function viewportFitFor(userAgent: string, displayMode: DisplayMode = "browser"): ViewportFit {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "cover";
  if (!/Android/i.test(userAgent)) return "cover";
  return displayMode === "fullscreen" ? "cover" : "auto";
}

/** viewport meta 의 content 에서 viewport-fit 만 바꾼다(없으면 붙인다) */
export function withViewportFit(content: string, fit: ViewportFit): string {
  return /viewport-fit\s*=/.test(content) ? content.replace(/viewport-fit\s*=\s*[a-z-]+/, `viewport-fit=${fit}`) : `${content}, viewport-fit=${fit}`;
}

/**
 * <head> 에서 그리기 전에 돈다. 메타가 아직 없으면(머리 순서) 생길 때까지 지켜보다 바꾼다.
 * 판단 규칙은 viewportFitFor · withViewportFit 과 같다(tests/ui/viewport-fit.test.tsx 가 둘을 함께 본다).
 */
export const VIEWPORT_FIT_SCRIPT = `(function(){try{var u=navigator.userAgent;var fs=false;try{fs=matchMedia("(display-mode: fullscreen)").matches}catch(e){}var fit=/iPhone|iPad|iPod/.test(u)?"cover":/Android/i.test(u)?(fs?"cover":"auto"):"cover";try{var o=sessionStorage.getItem("${VIEWPORT_FIT_KEY}");if(o==="cover"||o==="auto")fit=o}catch(e){}document.documentElement.setAttribute("data-vfit",fit);var set=function(m){var c=m.getAttribute("content")||"";var n=/viewport-fit\\s*=/.test(c)?c.replace(/viewport-fit\\s*=\\s*[a-z-]+/,"viewport-fit="+fit):c+", viewport-fit="+fit;if(n!==c)m.setAttribute("content",n)};var m=document.querySelector('meta[name="viewport"]');if(m){set(m);return}var ob=new MutationObserver(function(){var x=document.querySelector('meta[name="viewport"]');if(x){set(x);ob.disconnect()}});ob.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",function(){ob.disconnect()})}catch(e){}})();`;
