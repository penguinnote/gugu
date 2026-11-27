"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { BTN } from "@/components/ui";
import { MENU_ICON, type MenuItem } from "@/lib/all-menu";

import { SignOutButton } from "./sign-out-button";

/**
 * '전체' 의 로그아웃 줄(2026-11-11 — 내 정보에서 옮김). 따로 화면 없이 누르면 가운데 확인 창: '로그아웃할까요?' · 취소 / 로그아웃.
 * 로그아웃은 예전 그대로 SignOutButton(이 기기 알림 구독을 먼저 지운다).
 */
export function LogoutRow({ item, rowClass, side = false }: { item: MenuItem; rowClass: string; /** 넓은 화면 왼쪽 메뉴 맨 아래(2026-11-27) — 레일이면 아이콘 아래 짧은 이름 */ side?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {side ? (
        <button type="button" onClick={() => setOpen(true)} title={item.label} className={`${rowClass} w-full`} data-testid="side-logout">
          <span className="grid size-7 shrink-0 place-items-center">
            <Image src={MENU_ICON[item.icon]} alt="" width={24} height={24} unoptimized loading="eager" className="size-6" />
          </span>
          <span className="text-[10.5px] leading-tight font-semibold lg:hidden">{item.short ?? item.label}</span>
          <span className="hidden min-w-0 flex-1 truncate text-left text-[15px] font-medium lg:block">{item.label}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${rowClass} w-full text-left`} data-testid="logout-item">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-[13px] bg-[var(--gg-tile)]">
            <Image src={MENU_ICON[item.icon]} alt="" width={26} height={26} unoptimized loading="eager" className="size-[26px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{item.label}</span>
          <span className="shrink-0 text-[13.5px] text-[var(--gg-hint)]">{item.hint}</span>
        </button>
      )}
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-8" onClick={() => setOpen(false)} data-testid="logout-confirm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="logout-title" className="w-full max-w-[320px] rounded-[24px] bg-[var(--gg-card)] px-5 pt-6 pb-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p id="logout-title" className="text-[18px] font-bold">
              로그아웃할까요?
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className={`${BTN("white", "sm")} flex-1 !h-11`}>
                취소
              </button>
              <div className="flex-1">
                <SignOutButton className={`${BTN("berry", "sm")} w-full !h-11`}>로그아웃</SignOutButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
