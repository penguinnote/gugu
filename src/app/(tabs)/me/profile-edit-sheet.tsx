"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { PROFILE_BTN } from "@/components/profile/profile-header";
import { squareDataUrl } from "@/lib/square-photo";

import { clearProfilePhoto, saveProfilePhoto } from "./photo-actions";

/**
 * '프로필 편집'(2026-11-11 사용자 요청 — 인스타처럼) — 누르면 아래에서 목록이 올라온다:
 *   새 사진 고르기 · 기본 사진으로 바꾸기(사진이 있을 때) · 소개 · 말씀 · 관심사 쓰기(/me/edit) · 닫기
 */
export function ProfileEditSheet({ hasPhoto }: { hasPhoto: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await saveProfilePhoto(await squareDataUrl(file));
        if (!r.ok) return setMsg(r.message ?? "저장하지 못했어요.");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "사진을 열지 못했어요.");
      }
    });
  };
  const toDefault = () =>
    start(async () => {
      const r = await clearProfilePhoto();
      if (!r.ok) return setMsg(r.message ?? "바꾸지 못했어요.");
      setOpen(false);
      router.refresh();
    });

  const ROW = "flex h-14 w-full items-center px-6 text-left text-[16px] font-semibold";
  return (
    <>
      <button type="button" className={PROFILE_BTN} onClick={() => setOpen(true)} data-testid="profile-edit">
        프로필 편집
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="profile-photo-input" />
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => !pending && setOpen(false)} data-testid="profile-sheet">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="프로필 편집"
            className="gg-sheet-up w-full rounded-t-[26px] bg-[var(--gg-card)] pt-2 pb-[calc(var(--nn-safe-bottom)+12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--gg-line)]" />
            <button type="button" className={ROW} onClick={() => input.current?.click()} disabled={pending}>
              {pending ? "저장 중…" : "새 사진 고르기"}
            </button>
            {hasPhoto ? (
              <button type="button" className={ROW} onClick={toDefault} disabled={pending}>
                기본 사진으로 바꾸기
              </button>
            ) : null}
            <Link href="/me/edit" className={ROW} onClick={() => setOpen(false)}>
              소개 · 말씀 · 관심사 쓰기
            </Link>
            {msg ? <p className="px-6 pb-1 text-[13px] text-[var(--gg-berry-ink)]">{msg}</p> : null}
            <button type="button" className={`${ROW} text-[var(--gg-hint)]`} onClick={() => setOpen(false)} disabled={pending}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
