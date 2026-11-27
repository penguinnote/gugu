"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

import type { WorldSummary } from "@/lib/berries";

import { keepStreak } from "./actions";

/**
 * 홈 streak 줄 아래 — 놓친 주를 '연속 지키기 쿠폰' 으로 지키는 자리(World 5). 지킬 수 있는 주가 있을 때만 그려진다.
 *   쿠폰이 있으면 1장을 쓰고, 없으면 그 자리에서 열매로 사서 바로 쓴다(한 거래). 열매가 모자라면 단추 대신 모자란 수.
 *   누르면 바로 쓰지 않고 한 번 더 묻는다 — 열매·쿠폰은 되돌릴 수 없다.
 * 판정은 DB 가 다시 한다(학기 한도 · 다음 주 마감). 성공하면 홈을 새로 그려 streak 이 이어진 숫자로 바뀐다.
 */
/** 작은 단추 — 앱의 다른 작은 단추(보고서 주 넘기기 · 상점)와 같은 gg-btn(2026-11-11 UI 통일) */
const SMALL = "gg-btn gg-btn-sm !h-10 !px-3.5 !text-[15px]";

export function FreezeOffer({ summary, thisWeek }: { summary: WorldSummary; thisWeek: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => setStep((s) => (s === "busy" ? s : "idle")), []);
  const week = summary.freeze_week;
  if (!week) return null;

  const which = week === thisWeek ? "이번 주" : "지난주";
  const left = summary.freezes_per_term - summary.freezes_used;
  const buy = summary.coupons < 1;
  const short = buy ? summary.coupon_price - summary.berries : 0;
  const keeps = summary.freeze_keeps;

  const run = async () => {
    setStep("busy");
    setError(null);
    // 연결이 끊겨 던지면 '지키는 중…' 에 멈추지 않게(2026-11-05)
    const r = await keepStreak(week, buy).catch(() => ({ ok: false as const, message: "지키지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요." }));
    if (!r.ok) {
      setError(r.message);
      setStep("idle");
      return;
    }
    router.refresh();
  };

  const canKeep = left > 0 && short <= 0;
  // 2026-11-14 운영자 홈 B안과 같은 결 — 노란 상자 대신 옅은 선 아래 한 줄(토스페이스 그림 · 글 · 오른쪽 작은 단추), 묻기는 가운데 확인 창
  return (
    <div className="mt-4 border-t border-[var(--gg-line)] px-5 pt-4 pb-3" data-testid="freeze-offer">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- 토스페이스 원본 SVG(public/icons/tossface) */}
        <img src="/icons/tossface/u1F39F.svg" alt="" width={22} height={22} className="size-[22px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-bold">{which} 목장보고서를 놓쳤어요</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--gg-hint)]">
            {left <= 0
              ? "이번 학기 쿠폰을 다 썼어요"
              : short > 0
                ? `쿠폰은 열매 ${summary.coupon_price}개 · ${short}개 더 모으면 지킬 수 있어요`
                : `쿠폰으로 지키면 ${keeps}주 연속 · 이번 학기 ${left}번 남음`}
          </p>
        </div>
        {canKeep ? (
          <button type="button" onClick={() => setStep("confirm")} className={`${SMALL} gg-btn-sky shrink-0`} data-testid="freeze-keep">
            지키기
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[var(--gg-berry-ink)]">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={step !== "idle"}
        title={buy ? `열매 ${summary.coupon_price}개로 쿠폰을 사서 바로 쓸까요?` : `쿠폰 ${summary.coupons}장 중 1장을 쓸까요?`}
        body={`${which} 목장보고서를 놓친 것을 지켜 ${keeps}주 연속이 이어져요.`}
        confirmLabel={step === "busy" ? "지키는 중…" : "지키기"}
        busy={step === "busy"}
        onConfirm={() => void run()}
        onCancel={cancel}
        testId="freeze-confirm"
      />
    </div>
  );
}
