import { Jua } from "next/font/google";

/**
 * 둥근 글씨(Jua) — 구구 테마(2026-10-12)의 제목 · 단추 · 큰 숫자(globals.css .gg-display · .gg-btn). 로뎀 월드 안 글씨와 같은 서체.
 * 본문은 Pretendard 그대로. 루트 레이아웃이 --font-round 변수를 <html> 에 건다. 빌드할 때 받아 앱과 같이 내려준다(브라우저가 구글에 가지 않는다).
 * 한글 글리프는 subsets 목록에 없어 미리 받지 않고(preload: false), 쓰는 글자 범위만 그때 받는다.
 */
export const roundFont = Jua({ weight: "400", subsets: ["latin"], preload: false, display: "swap", variable: "--font-round" });
