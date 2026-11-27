/**
 * 삼성 인터넷 홈 화면 앱의 시스템 막대 대체값(2026-11-23, 갤럭시 화면 진단).
 *
 * 삼성 인터넷(SamsungBrowser/31)으로 설치한 홈 화면 앱은 상태바와 내비게이션 바 밑까지 그리면서 safe-area-inset-* 를
 * viewport-fit cover · auto 모두 0 으로 준다. 그래서 위 머리는 상태바에, 아래 탭 막대 · 시트 단추는 내비게이션 바에 가렸다.
 * 시스템 막대는 그대로 두고(사용자 결정) html 에 data-sbar 를 붙여 globals.css 가 막대 높이를 대신 넣게 한다.
 * 같은 삼성 인터넷이라도 브라우저 탭은 막대 밑까지 그리지 않으므로 홈 화면 앱(display-mode standalone)일 때만 켠다.
 * 전체 화면(display-mode fullscreen, 2026-11-25 매니페스트 display_override)으로 열리면 막대가 없으니 켜지 않는다 — 그래서 standalone 만 본다.
 * 로뎀 월드에서 Fullscreen API 로 막대를 숨긴 동안은 globals.css 의 html[data-sbar]:fullscreen 이 env 값으로 되돌린다.
 *
 * 확인(2026-11-23) — 갤럭시 삼성 인터넷 31 홈 화면 앱에서 상태바 32px · 내비게이션 바 48px 대체값으로 가림이 없어졌다.
 *
 * 화면 진단(/dev/insets)이 고른 값(sessionStorage)이 있으면 그것을 따른다 — 데스크톱에서도 대체값 모습을 볼 수 있게.
 */

/** 진단 화면이 고른 값을 적어 두는 열쇠 — "on" · "off", 이 탭에서만 */
export const SAMSUNG_BARS_KEY = "gg-sbar";

/** 삼성 인터넷 홈 화면 앱이면 켠다 */
export function samsungBarsFor(userAgent: string, standalone: boolean): boolean {
  return standalone && /SamsungBrowser\//.test(userAgent);
}

/**
 * <head> 에서 그리기 전에 돈다. 판단 규칙은 samsungBarsFor 와 같다(tests/ui/samsung-bars.test.tsx 가 둘을 함께 본다).
 */
export const SAMSUNG_BARS_SCRIPT = `(function(){try{var on=/SamsungBrowser\\//.test(navigator.userAgent)&&matchMedia("(display-mode: standalone)").matches;try{var o=sessionStorage.getItem("${SAMSUNG_BARS_KEY}");if(o==="on")on=true;else if(o==="off")on=false}catch(e){}if(on)document.documentElement.setAttribute("data-sbar","")}catch(e){}})();`;
