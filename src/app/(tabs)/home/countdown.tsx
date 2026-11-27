"use client";

import { useEffect, useState } from "react";

import { formatUntilDeadline } from "@/lib/week";

/**
 * 마감 카운트다운. 06 §4.5 — '지금' 은 서버가 정한다: 첫 렌더는 serverNow 로 그려 서버와 같고,
 * 마운트 뒤에 클라이언트 시계로 바꾼다(그 뒤 1분마다). Intl·toLocale* 없음.
 */
export function Countdown({ weekKey, serverNow, className = "text-sm text-muted" }: { weekKey: string; serverNow: string; className?: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);
  return <p className={className}>{formatUntilDeadline(weekKey, now)}</p>;
}
