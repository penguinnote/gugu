"use client";

import { useEffect, useState } from "react";

import { ICON } from "@/components/ui";
import { streakLabel, type StreakInfo } from "@/lib/labels";

export const STREAK_BUMP_KEY = "nn:streak-bump";

/** 불꽃 — 이어지는 중이면 해 · 열매 색, 끊겼으면 돌빛 */
export function Flame({ on, className = "h-5 w-5" }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={ICON.flame} fill={on ? "#FF9A3C" : "#B6C1CF"} />
      <path d="M12.3 11.2c.9 1.6 2.4 2.4 2.4 4.3a2.7 2.7 0 0 1-5.4 0c0-1.5.9-2.3 1.7-3.2.6-.7 1.1-1 1.3-1.1z" fill={on ? "#FFD24D" : "#DCE3EC"} />
    </svg>
  );
}

/**
 * streak — 홈 맨 위 오른쪽의 불꽃 알약(chip) 또는 이번 주 카드 안의 한 줄(line).
 * 제출 직후 홈으로 돌아오면 한 번 강조한다(nn-bump) — 작성 화면이 제출 성공 때
 * sessionStorage 에 새 streak 을 적어 두고, 여기서 읽으면 지운다. 같은 값이면 강조하지 않는다.
 * 첫 렌더는 서버와 같아야 하므로(하이드레이션) 강조는 마운트 뒤에 켠다.
 */
export function StreakLine({ streak, variant = "line" }: { streak: StreakInfo | null; variant?: "line" | "chip" }) {
  const label = streakLabel(streak);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = sessionStorage.getItem(STREAK_BUMP_KEY);
        if (v !== null) {
          sessionStorage.removeItem(STREAK_BUMP_KEY);
          if (streak && Number(v) === streak.streak) setBump(true);
        }
      } catch {
        // 저장소를 못 쓰는 환경 — 강조 없이 지나간다
      }
    }, 0);
    return () => clearTimeout(t);
  }, [streak]);
  const going = (streak?.streak ?? 0) >= 1;
  if (variant === "chip") {
    return (
      <p
        className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--gg-glass-line)] bg-[var(--gg-glass)] shadow-[var(--gg-glass-shadow)] backdrop-blur-xl pr-3 pl-2"
        title={label ?? "연속 제출"}
      >
        <Flame on={going} />
        <span className="sr-only">연속 제출</span>
        <span key={bump ? "bump" : "still"} className={`text-[16px] font-extrabold leading-none tabular-nums ${going ? "text-[#E8730C]" : "text-muted"} ${bump ? "nn-bump" : ""}`}>
          {streak?.streak ?? 0}
        </span>
      </p>
    );
  }
  if (!label) return null;
  return (
    <p className="flex items-center gap-2 text-[15px]">
      <Flame on={going} className="h-6 w-6" />
      <span key={bump ? "bump" : "still"} data-testid="streak" className={bump ? "nn-bump font-bold" : "font-bold"}>
        {label}
      </span>
    </p>
  );
}
