"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { IconCard } from "@/components/toss";
import { BTN } from "@/components/ui";

/**
 * 전체 메뉴에서 칸으로 바로 왔는데 그 칸이 비었을 때(2026-11-13) — /pastor#prayers 처럼.
 * 칸이 없으면 화면 맨 위에 멈춰 '눌렀는데 아무것도 없다' 였다. 주소의 # 가 이 칸일 때만 빈 카드를 보이고
 * (평소 홈에는 빈 카드를 늘어놓지 않는다), 지난주가 있으면 지난주 같은 칸으로 가는 단추를 둔다.
 */
export function AnchorEmpty({ anchor, icon, title, line, prevHref }: { anchor: string; icon: string; title: string; line: string; prevHref?: string }) {
  const shown = useSyncExternalStore(subscribeHash, readHash, () => "") === `#${anchor}`;
  useEffect(() => {
    if (shown) document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  }, [shown, anchor]);
  if (!shown) return null;
  return (
    <IconCard icon={icon} title={title} testId={`anchor-empty-${anchor}`}>
      <div className="space-y-3">
        <p className="text-[14px] text-[var(--gg-hint)]">{line}</p>
        {prevHref ? (
          <Link href={prevHref} replace className={`${BTN("white", "sm")} w-full`}>
            지난주 보기
          </Link>
        ) : null}
      </div>
    </IconCard>
  );
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash;
