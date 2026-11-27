import type { MetadataRoute } from "next";

/**
 * 웹 앱 매니페스트 — 홈 화면에 추가할 수 있게 한다(PWA). iOS 는 홈 화면에 추가해야만 웹 푸시가 온다
 * (Step 7, 02 C-2a). 오프라인 캐시는 하지 않는다 — 출석은 모임 후 기억으로 쓴다(05 §1.2).
 * 아이콘은 public/ 의 정적 PNG — 로그인 없이 받아져야 해서 라우트로 만들지 않는다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "구구",
    short_name: "구구",
    description: "목장보고서와 로뎀 월드",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // 안드로이드 홈 화면 앱은 전체 화면 — 상태바 · 내비게이션 바를 앱 전체에서 숨긴다(2026-11-25 사용자 결정, 11-23 '막대는 그대로' 를 바꿈).
    // 아이폰은 display_override 를 읽지 않아 그대로 standalone. 크롬으로 설치한 앱은 크롬이 앱 정보(WebAPK)를 갱신할 때 바뀌어 하루 넘게 걸릴 수 있고,
    // 삼성 인터넷으로 설치한 앱은 다시 설치해야 바뀔 수 있다. 되돌릴 때는 display_override 만 지운다
    display_override: ["fullscreen", "standalone"],
    // 안드로이드 첫 화면 — 흰 바탕에 아이콘(구구)과 이름. 이어서 뜨는 앱 시작 페이지(public/launch.html)와 같은 바탕(2026-11-01)
    background_color: "#ffffff",
    // 안드로이드 내비게이션 바(아래 3버튼 · 제스처 막대)는 이 색 하나로만 칠해진다(크롬 — 페이지 theme-color 는 상태바만, 어두운 값은 없다).
    // 앱 바닥색(globals.css --background, lib/system-bar.ts BAR_BG)과 같다(2026-11-09). 설치된 앱은 크롬이 WebAPK 를 갱신할 때 바뀐다
    theme_color: "#f3f4f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
