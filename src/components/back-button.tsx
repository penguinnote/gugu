"use client";

import { useRouter } from "next/navigation";

import { goBack } from "@/lib/nav-history";

/** 안쪽 화면 머리의 ‹ 단추(2026-11-11 머리 B안) — 들어온 곳으로, 없으면 fallback 으로(lib/nav-history goBack) */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => goBack(fallback, router)}
      aria-label="뒤로"
      className="grid size-11 place-items-center rounded-[14px] text-foreground"
      data-testid="back-button"
    >
      <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
