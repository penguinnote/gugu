import Link from "next/link";
import type { ReactNode } from "react";

import { Gugu } from "@/components/gugu";

/**
 * 홈 카드 윗단(2026-11-11 사용자 선택 A안 — 토스식 상태 카드). 리더 · 목사님 · 운영자 · 임원진 카드가 같이 쓴다.
 * 흰 카드 위 왼쪽에 작은 구구(64px, 기분은 상태대로), 오른쪽에 큰 상태 글씨(첫 줄) · 그 아래 회색 글씨(나머지 줄을 이어서) · children(마감까지 남은 시간 · 제출 시각).
 * 예전엔 라임 띠 위 큰 구구와 말풍선이었다. 문구는 그대로(2026-10-29 사용자 지정).
 */
export function Speak({
  mood,
  lines,
  children,
  chat = false,
}: {
  mood: "wave" | "smile" | "sleepy" | "sparkle" | "base";
  lines: string[];
  /** 예전 말풍선 높이 조절 — 쓰지 않는다 */
  lower?: boolean;
  children?: ReactNode;
  /** 구구를 누르면 구구 챗봇(2026-11-12 — 구구 AI 가 켜져 있고 리더 · 목사님일 때만) */
  chat?: boolean;
}) {
  const [title, ...rest] = lines;
  const face = <Gugu mood={mood} size={64} className="size-16 shrink-0" />;
  return (
    <div className="flex items-center gap-3.5 px-5 pt-5" data-testid="speak">
      {chat ? (
        <Link href="/gugu" aria-label="구구에게 물어보기" className="shrink-0 rounded-full transition-transform active:scale-90 data-pressing:scale-90" data-testid="speak-gugu">
          {face}
        </Link>
      ) : (
        face
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="text-[20px] leading-snug font-extrabold tracking-[-0.02em] break-keep">{title}</p>
        {rest.length ? <p className="text-[14px] leading-snug text-[var(--gg-hint)] break-keep">{rest.join(" ")}</p> : null}
        {children}
      </div>
    </div>
  );
}
