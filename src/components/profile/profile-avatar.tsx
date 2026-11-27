"use client";

import { useEffect, useState } from "react";

import { dotColor, initialOf } from "@/lib/profile-photo";

/**
 * 프로필 동그라미(2026-11-11 인스타처럼) — 사진, 없으면 사람마다 정해진 색에 이름 둘째 글자.
 * 사진이 있으면 누르면 크게(어두운 바탕 위 큰 동그라미 — 인스타에서 프로필 사진을 누른 모습). 아무 데나 누르면 닫힌다.
 */
export function ProfileAvatar({ photoUrl, name, seed, size = 88 }: { photoUrl: string | null; name: string; seed: string; size?: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  const circle = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 프로필 사진(작은 정사각 WebP · JPEG)
    <img src={photoUrl} alt="" className="size-full object-cover" />
  ) : (
    <span className="grid size-full place-items-center font-extrabold text-white" style={{ background: dotColor(seed), fontSize: size * 0.4 }}>
      {initialOf(name)}
    </span>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => photoUrl && setOpen(true)}
        aria-label={photoUrl ? `${name} 프로필 사진 크게 보기` : `${name} 프로필`}
        className="shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--gg-line)]"
        style={{ width: size, height: size }}
        data-testid="profile-avatar"
      >
        {circle}
      </button>
      {open && photoUrl ? (
        <div role="dialog" aria-modal="true" aria-label={`${name} 프로필 사진`} className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-8" onClick={() => setOpen(false)} data-testid="photo-zoom">
          {/* eslint-disable-next-line @next/next/no-img-element -- 크게 본 프로필 사진 */}
          <img src={photoUrl} alt="" className="aspect-square w-[min(78vw,340px)] rounded-full object-cover shadow-[0_10px_40px_rgb(0_0_0/0.4)]" />
        </div>
      ) : null}
    </>
  );
}
