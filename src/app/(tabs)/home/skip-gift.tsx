"use client";

import { useEffect, useState } from "react";

import { Gugu } from "@/components/gugu";
import { BTN } from "@/components/ui";

import { markSkipGiftSeen } from "./actions";

/**
 * 휴주 선물 팝업(2026-11-26) — 그 목장 리더가 다음에 앱을 열면 한 번. 구구가 선물 상자를 들고 날아온다.
 * 닫으면 본 것으로 적어 다시 띄우지 않는다(계정마다). 알림 켜기 팝업보다 위에 뜬다.
 */
export function SkipGiftPopup({ weeks, total }: { weeks: string[]; total: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (weeks.length === 0) return;
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [weeks]);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    void markSkipGiftSeen(weeks).catch(() => null);
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center px-8 print:hidden" data-testid="skip-gift">
      <button type="button" aria-label="닫기" onClick={close} className="gg-fade-in absolute inset-0 bg-black/45" />
      <section role="dialog" aria-modal="true" aria-labelledby="skip-gift-title" className="gg-pop relative w-full max-w-[320px] rounded-[28px] bg-[var(--gg-card)] px-6 pt-7 pb-5 text-center">
        <div className="relative mx-auto w-fit">
          <div className="gg-bob">
            <Gugu mood="sparkle" size={96} />
          </div>
          {/* 선물 상자 */}
          <svg viewBox="0 0 40 40" className="absolute -right-5 bottom-0 h-11 w-11 drop-shadow-[0_3px_4px_rgb(0_0_0/0.15)]" aria-hidden>
            <rect x="5" y="15" width="30" height="21" rx="4" fill="#ef5f69" />
            <rect x="3" y="10" width="34" height="8" rx="3" fill="#f47a83" />
            <rect x="17.5" y="10" width="5" height="26" fill="#ffd54d" />
            <path d="M20 10 C14 2 7 6 12 10 M20 10 C26 2 33 6 28 10" fill="none" stroke="#ffd54d" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h2 id="skip-gift-title" className="gg-display mt-4 text-[22px] leading-snug">
          선물이 도착했어요!
        </h2>
        <p className="mt-1.5 text-[16px] font-bold text-[var(--gg-leaf-ink)]" data-testid="skip-gift-amount">
          열매 {total}개
        </p>
        <button type="button" onClick={close} className={`${BTN("sky")} mt-5 w-full`} data-testid="skip-gift-ok">
          확인
        </button>
      </section>
    </div>
  );
}
