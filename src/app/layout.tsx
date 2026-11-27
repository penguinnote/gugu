import type { Metadata, Viewport } from "next";

import { InlineScript } from "@/components/install-guide/inline-script";
import { InstallGate, InstallHeadScript } from "@/components/install-guide/install-gate";
import { KeyboardWatch } from "@/components/keyboard-watch";
import { NavKeeper } from "@/components/nav-keeper";
import { SPLASH, splashMedia } from "@/components/splash-devices";
import { SwRegister } from "@/components/sw-register";
import { WorldEntryFullscreen } from "@/components/world-entry-fullscreen";
import { PressHold } from "@/components/press-hold";
import { ThemeColor } from "@/components/theme-color";
import { BAR_BG } from "@/lib/system-bar";
import { SAMSUNG_BARS_SCRIPT } from "@/lib/samsung-bars";
import { VIEWPORT_FIT_SCRIPT } from "@/lib/viewport-fit";

import { roundFont } from "./fonts";
import "./globals.css";

/** 앱 이름은 '구구'(2026-10-12) — 99(Ninetynine)를 우리말로 읽은 것이자 마스코트 비둘기 소리. 영어 글씨는 소문자 gugu */
export const metadata: Metadata = {
  title: "구구",
  description: "목장보고서와 로뎀 월드",
  applicationName: "구구",
  // iOS 홈 화면 추가(Step 7) — 아이콘 · 상태바 · 첫 화면 그림. 홈 화면에서 열어야 웹 푸시가 온다.
  // 첫 화면 그림은 흰 바탕 가운데 앱 아이콘 — 이어서 뜨는 앱 시작 페이지(public/launch.html)와 같은 자리 · 같은 크기(2026-11-01).
  // 상태바는 비치게(black-translucent) — 화면 맨 위 그림이 시계 자리까지 이어진다(사용자 요청, 2026-10-24).
  // 기본(default)으로 하면 iOS 26 은 theme-color 를 무시하고 시계 자리를 바탕색으로 칠한다(실기기에서 흰 띠).
  // iOS 26 홈 화면 앱은 페이지가 화면보다 짧으면 화면 높이를 시계 자리만큼 짧게 잡는다(WebKit 301108) — globals.css 가
  // 문서를 늘 시계 자리만큼 더 길게 두어 피한다.
  appleWebApp: {
    capable: true,
    title: "구구",
    statusBarStyle: "black-translucent",
    startupImage: SPLASH.map((d) => ({ url: `/splash/${d.w}x${d.h}@${d.dpr}x.png`, media: splashMedia(d) })),
  },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대를 막는다(2026-10-14, 사용자 요청) — 글자 칸을 누를 때 화면이 커지고 옆으로 밀리던 것을 없앤다. 글씨는 기본 15~16px.
  maximumScale: 1,
  userScalable: false,
  // 안드로이드: 키보드가 화면을 줄이지 않고 위에 덮는다 — 아래 고정 막대가 끌려 올라오지 않게
  interactiveWidget: "overlays-content",
  // 화면을 시계 · 노치 자리까지 그린다 — 머리들은 시계 자리(--nn-safe-top, globals.css) 만큼 내려 둔다.
  // 안드로이드는 머리 스크립트(VIEWPORT_FIT_SCRIPT)가 첫 그림 전에 auto 로 바꾼다(2026-11-23 — 갤럭시 아래 내비게이션 바가 화면을 가렸다, lib/viewport-fit)
  viewportFit: "cover",
  // 브라우저 막대 색 — 자바스크립트 전 첫 화면은 바닥색, 그 뒤로는 ThemeColor 가 화면 머리 색에 맞춘다(2026-11-09, 안드로이드 상태바).
  // iOS 홈 화면 앱은 black-translucent 라 쓰지 않는다
  themeColor: BAR_BG,
  // 밝은 화면 하나(2026-11-10 어두운 모드 뺌) — 기기가 다크 모드여도 입력 칸 · 스크롤 막대를 밝게, 크롬 자동 어둡게도 막는다
  colorScheme: "only light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning — 머리 스크립트가 그리기 전에 data-install 을 붙인다(휴대폰 브라우저면 설치 안내)
    <html lang="ko" className={`${roundFont.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={VIEWPORT_FIT_SCRIPT} />
        <InlineScript html={SAMSUNG_BARS_SCRIPT} />
        <InstallHeadScript />
        {/*
          Pretendard — 한글 UI 표준에 가까운 서체(본문). 제목 · 단추 · 큰 숫자는 둥근 글씨 Jua(fonts.ts, gg-display).
          dynamic-subset 은 쓰이는 글자 대역만 내려받으므로 실제 전송량이 작다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col">
        <SwRegister />
        <ThemeColor />
        <PressHold />
        <KeyboardWatch />
        <NavKeeper />
        <WorldEntryFullscreen />
        {children}
        <InstallGate />
      </body>
    </html>
  );
}
