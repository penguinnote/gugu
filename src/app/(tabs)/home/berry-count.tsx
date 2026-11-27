"use client";

import { useEffect, useState } from "react";

import { BerryIcon } from "@/components/berry-icon";
import { BERRY_GAIN_KEY, berryText, type BerryGain } from "@/lib/berries";
import { groupLabel } from "@/lib/labels";

/**
 * 홈 맨 위 오른쪽의 우리 목장 열매 알약(리더만, 구구 테마). 보고서를 막 처음 제출하고 홈으로 오면 한 번 — 숫자가 통통 튀고 '+35' 가
 * 떠올랐다 사라진다. 작성 화면이 sessionStorage 에 받은 열매를 적어 두고, 여기서 읽으면 지운다(streak-line 과 같은 방식).
 * 첫 렌더는 서버와 같아야 하므로(하이드레이션) 강조는 마운트 뒤에 켠다. 숫자 묶음도 toLocale* 없이(06 §4.5).
 */
export function BerryCount({ berries, groupName }: { berries: number; groupName: string | null }) {
  const [gain, setGain] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(BERRY_GAIN_KEY);
        if (raw === null) return;
        sessionStorage.removeItem(BERRY_GAIN_KEY);
        const g = JSON.parse(raw) as Partial<BerryGain>;
        const n = Number(g.base ?? 0) + Number(g.bonus ?? 0);
        if (n > 0) setGain(n);
      } catch {
        // 저장소를 못 쓰는 환경 — 강조 없이 지나간다
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--gg-glass-line)] bg-[var(--gg-glass)] shadow-[var(--gg-glass-shadow)] backdrop-blur-xl pr-3 pl-2.5" data-testid="world-berries">
      <BerryIcon className="h-5 w-5" />
      <span className="sr-only">{groupLabel(groupName)} 열매</span>
      <span key={gain ?? "still"} className={`text-[16px] font-extrabold leading-none text-foreground tabular-nums ${gain ? "nn-bump" : ""}`}>
        {berryText(berries)}
      </span>
      {gain ? (
        <span aria-live="polite" className="gg-display nn-float-up pointer-events-none absolute -bottom-7 right-1 text-[16px] text-[var(--gg-berry-ink)]">
          +{gain}
        </span>
      ) : null}
    </p>
  );
}
