"use client";

import { useEffect } from "react";

import { BTN } from "@/components/ui";

/**
 * 가운데 확인 창(2026-11-13) — 로그아웃 확인(logout-row)과 같은 모양. 동의를 켜고 끄는 것처럼 잘못 누르면 곤란한 곳에.
 * 바깥을 누르거나 Esc 면 취소.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  testId,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-8" onClick={onCancel} data-testid={testId}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-[320px] rounded-[24px] bg-[var(--gg-card)] px-5 pt-6 pb-5 text-center" onClick={(e) => e.stopPropagation()}>
        <p id="confirm-title" className="text-[18px] font-bold break-keep">
          {title}
        </p>
        {body ? <p className="mt-2 text-[14px] leading-relaxed text-[var(--gg-hint)] break-keep">{body}</p> : null}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className={`${BTN("white", "sm")} flex-1 !h-11`} data-testid="confirm-cancel">
            취소
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`${BTN(danger ? "berry" : "leaf", "sm")} flex-1 !h-11`} data-testid="confirm-ok">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
