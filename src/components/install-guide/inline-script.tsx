"use client";

/**
 * 그리기 전에 도는 머리 스크립트(Next 문서 'Preventing Flash' 의 InlineScript) — 서버 HTML 에서는 text/javascript 로 돌고,
 * 브라우저에서 다시 그릴 때는 text/plain 이라 돌지 않는다(React 의 script 경고도 없다). type 이 달라지는 것은 suppressHydrationWarning 이 받는다.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
