/**
 * 웹앱 설치 안내(2026-11-11 사용자 요청) — 휴대폰 브라우저로 링크를 열면 앱 대신 설치 안내가 뜬다.
 * 여기는 순수 함수만: 어떤 브라우저인지(detectInstallEnv) · 고른 기종에 맞는 단계 순서(installSteps) · 머리 스크립트(INSTALL_HEAD_SCRIPT).
 *
 *   아이폰  사파리에서만 홈 화면에 추가된다고 본다. 카카오톡 · 다른 앱 · 다른 브라우저면 사파리로 여는 단계부터.
 *          사파리 26(iOS 26)은 막대 모양이 설정마다 달라(‹ · 주소 · ⋯ / 가운데 공유) 먼저 그림으로 묻는다. 그 전은 아래 공유 단추.
 *   갤럭시  크롬 · 삼성 인터넷이 설치 창(beforeinstallprompt)을 주면 단추 하나로 끝. 아니면 브라우저마다 메뉴 따라가기.
 */

export type Device = "ios" | "android";

export type InstallEnv = {
  /** 실제 기기(사용자가 고른 것과 다를 수 있다) */
  os: "ios" | "android" | "other";
  /** kakao 카카오톡 안 · inapp 그 밖의 앱 안(인스타그램 · 네이버 · 밴드 …) · samsung 삼성 인터넷 · chrome · safari · other */
  browser: "kakao" | "inapp" | "safari" | "chrome" | "samsung" | "other";
  /** 사파리 큰 버전(Version/26.0 → 26). 모르면 0 */
  safari: number;
};

export function detectInstallEnv(ua: string, platform = "", maxTouchPoints = 0): InstallEnv {
  const ios = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const os = ios ? "ios" : /Android/i.test(ua) ? "android" : "other";
  let browser: InstallEnv["browser"];
  if (/KAKAOTALK/i.test(ua)) browser = "kakao";
  else if (/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp|BAND\/|; wv\)/i.test(ua)) browser = "inapp";
  else if (/SamsungBrowser/i.test(ua)) browser = "samsung";
  else if (ios) browser = /CriOS|FxiOS|EdgiOS|OPiOS|Whale|NAVER|DaumApps|GSA\//.test(ua) ? "other" : "safari";
  else if (/Chrome\//.test(ua) && !/EdgA|OPR|Whale|YaBrowser|Firefox/.test(ua)) browser = "chrome";
  else browser = "other";
  const v = /Version\/(\d+)/.exec(ua);
  return { os, browser, safari: browser === "safari" && v ? Number(v[1]) : 0 };
}

/** 단계 이름 — 화면(install-guide.tsx)이 단계마다 제목과 그림을 고른다 */
export type Step =
  | "kakao-out" // 카카오톡 → 바깥 브라우저로 열기 단추
  | "ios-inapp" // 다른 앱 안(아이폰) → 오른쪽 위 메뉴에서 Safari로 열기
  | "ios-safari" // 다른 브라우저(아이폰) → 링크 복사 → 사파리에 붙여넣기
  | "ios-pick" // 사파리 아래 막대 모양 고르기(공유 단추가 있는 막대 · ⋯ 막대) — 설정에 따라 달라서 브라우저 정보로는 모른다
  | "ios-more" // ⋯ 막대의 ⋯
  | "ios-share" // 공유
  | "ios-scroll" // 공유 창을 위로 쓸어 올리기 — '홈 화면에 추가' 는 아래에 숨어 있다(2026-11-12 실기기)
  | "ios-add" // 홈 화면에 추가
  | "ios-confirm" // 오른쪽 위 '추가'
  | "and-chrome-open" // 앱 안 · 다른 브라우저(안드로이드) → 크롬으로 열기 단추
  | "and-prompt" // 설치 창을 띄우는 단추 하나
  | "sam-menu" // 삼성 인터넷 아래 ≡
  | "sam-add" // 현재 페이지 추가
  | "sam-home" // 홈 화면
  | "sam-confirm" // 추가
  | "chr-menu" // 크롬 오른쪽 위 ⋮
  | "chr-add" // 앱 설치 · 홈 화면에 추가
  | "chr-confirm" // 설치
  | "done"; // 홈 화면의 구구를 눌러 열기

/** 사파리 아래 막대 — share 가운데 공유 단추(‹ › 공유 책 탭) · more 주소 옆 ⋯ */
export type IosBar = "share" | "more";

/**
 * 고른 기종 · 실제 브라우저 · 설치 창이 준비됐는지로 단계 순서를 정한다.
 * 고른 기종과 실제 기기가 다르면(아이폰을 고른 안드로이드 등) 고른 기종의 기본 브라우저 순서를 그대로 보인다 — 다른 폰을 보며 따라 할 수도 있다.
 */
export function installSteps(device: Device, env: InstallEnv, canPrompt: boolean, iosBar: IosBar | null = null): Step[] {
  const same = env.os === device;
  // 바깥 브라우저로 옮기는 단계는 그 하나로 끝 — 옮겨 간 브라우저에서 안내가 처음부터 다시 뜬다
  if (same && env.browser === "kakao") return ["kakao-out"];
  if (device === "ios") {
    if (same && env.browser === "inapp") return ["ios-inapp"];
    if (same && env.browser !== "safari") return ["ios-safari"];
    const tail: Step[] = ["ios-share", "ios-scroll", "ios-add", "ios-confirm", "done"];
    // 사파리 26 전은 늘 아래 막대 가운데 공유. 26 부터는 막대 모양을 설정에서 고르므로(아래 ⋯ · 아래 공유 · 위 주소) 먼저 묻는다(2026-11-11 실기기)
    if (same && env.safari > 0 && env.safari < 26) return tail;
    return ["ios-pick", ...(iosBar === "more" ? (["ios-more"] as Step[]) : []), ...tail];
  }
  if (same && (env.browser === "inapp" || env.browser === "other")) return ["and-chrome-open"];
  if (same && canPrompt) return ["and-prompt", "done"];
  if (same && env.browser === "chrome") return chromeSteps();
  return samsungSteps();
}

const samsungSteps = (): Step[] => ["sam-menu", "sam-add", "sam-home", "sam-confirm", "done"];
const chromeSteps = (): Step[] => ["chr-menu", "chr-add", "chr-confirm", "done"];

/** 웹에서 그냥 볼게요 — 이 탭에서만 안내를 거둔다 */
export const INSTALL_SKIP_KEY = "gg-web";

/**
 * <head> 맨 앞에서 그리기 전에 돈다 — 휴대폰 브라우저(홈 화면 앱이 아님)면 <html data-install> 을 붙여 앱을 가리고 안내를 보인다(globals.css).
 * 개발 디자인 화면 · 로그인 되돌아오는 길(/auth/)은 빼고, 설치 창(beforeinstallprompt)은 안내가 그려지기 전에 와도 잡아 둔다.
 */
export const INSTALL_HEAD_SCRIPT = `(function(){try{var n=navigator,u=n.userAgent,m=window.matchMedia;var phone=/Android|iPhone|iPad|iPod/.test(u)||(n.platform==="MacIntel"&&n.maxTouchPoints>1);var app=n.standalone===true||m("(display-mode: standalone)").matches||m("(display-mode: fullscreen)").matches||m("(display-mode: minimal-ui)").matches;var p=location.pathname;var skip=false;try{skip=sessionStorage.getItem("${INSTALL_SKIP_KEY}")==="1"}catch(e){}if(!phone||app||skip||p.indexOf("/dev/")===0||p.indexOf("/auth/")===0)return;document.documentElement.setAttribute("data-install","");window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__ggInstall=e;window.dispatchEvent(new Event("gg-install-ready"))});}catch(e){}})();`;
