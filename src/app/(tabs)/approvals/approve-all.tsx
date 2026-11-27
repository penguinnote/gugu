"use client";

import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { BTN } from "@/components/ui";

/**
 * 모두 승인(2026-11-26) — 가입 신청 목록 위. 누르면 몇 명인지 확인 창, 확인하면 한꺼번에(리더 신청만).
 */
export function ApproveAll({ count, action }: { count: number; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  if (count === 0) return null;
  return (
    <>
      <button type="button" className={`${BTN("leaf", "sm")} !h-11 w-full !text-[16px]`} onClick={() => setOpen(true)} data-testid="approve-all">
        모두 승인 ({count}명)
      </button>
      <ConfirmDialog
        open={open}
        title={`리더 신청 ${count}명을 승인할까요?`}
        confirmLabel="모두 승인"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => start(() => action())}
        testId="approve-all-dialog"
      />
    </>
  );
}
