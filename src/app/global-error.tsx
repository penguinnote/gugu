"use client";

/**
 * 맨 바깥 레이아웃까지 무너졌을 때(2026-11-05) — 전역 스타일 · 글꼴이 없으니 손으로 최소한만. 다시 시도와 홈으로.
 * 앱처럼 밝은 화면 하나(2026-11-10 어두운 모드 뺌).
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const btn = { display: "block", width: "100%", height: 52, borderRadius: 26, border: "none", fontSize: 16, fontWeight: 700 } as const;
  return (
    <html lang="ko">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif", colorScheme: "only light", background: "#f3f4f6", color: "#16181d" }}>
        <main style={{ width: "100%", maxWidth: 320, padding: 24, textAlign: "center" }}>
          <title>구구</title>
          <p style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>잠깐 문제가 생겼어요</p>
          <p style={{ fontSize: 15, opacity: 0.6, margin: "0 0 24px" }}>다시 시도해 주세요.</p>
          <button type="button" onClick={() => retry()} style={{ ...btn, background: "#9bd12e", color: "#1f2a05" }}>
            다시 시도
          </button>
          {/* 전체 새로 고침으로 홈에 간다 — 레이아웃이 무너진 상태라 클라이언트 이동을 믿지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ ...btn, marginTop: 8, lineHeight: "52px", textDecoration: "none", color: "inherit", background: "rgb(127 127 127 / 0.15)" }}>
            홈으로
          </a>
        </main>
      </body>
    </html>
  );
}
