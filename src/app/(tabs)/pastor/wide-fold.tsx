"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 넓은 화면(1024px 이상)에서만 접히는 칸(2026-11-27) — 제출 현황의 AI 주간 정리를 첫 줄만 보이게 접어 두고 '펼치기'.
 * 작은 화면에는 아무것도 닿지 않는다(접는 모양 · 단추 모두 lg: 에서만). 내용이 접힌 높이보다 길 때만 단추가 나온다.
 */
const FOLD = "lg:max-h-[92px] lg:overflow-hidden lg:[mask-image:linear-gradient(black_55%,transparent)]";

export function WideFold({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 4);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div ref={box} id={id} className={`peer ${className} ${open ? "" : FOLD}`}>
        {children}
      </div>
      {long || open ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="hidden h-9 w-fit items-center gap-1 justify-self-center rounded-full bg-[var(--gg-card)] px-4 text-[13.5px] font-bold text-[var(--gg-sky-ink)] shadow-[var(--gg-card-shadow)] peer-empty:hidden lg:order-2 lg:col-span-2 lg:-mt-2 lg:inline-flex"
          data-testid="wide-fold"
        >
          {open ? "접기" : "펼치기"}
        </button>
      ) : null}
    </>
  );
}
