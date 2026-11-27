"use client";

import { useState } from "react";

import { MenuList } from "@/components/menu-list";
import { setFromAll } from "@/lib/tab-origin";
import { searchMenu, type MenuSection } from "@/lib/all-menu";

/**
 * '전체' 화면 본문(2026-11-10) — 토스 '전체' 와 같은 짜임.
 *   맨 위 이름 · 그 아래 검색(흰 칸, 돋보기) · 흰 카드 안에 묶음 제목(회색)과 줄(아이콘 칸 · 이름 · 오른쪽 회색 키워드).
 *   검색은 지금은 메뉴 이름 · 키워드에서 찾는다 — 나중에 AI 기능이 붙으면 찾을 것이 늘어난다.
 *   아이콘은 토스페이스 원본(public/icons/tossface, 출처 표시는 맨 아래 한 줄 — 저작권 안내가 요구한다).
 * 화면 전체는 움직이지 않고(data-no-scroll · 탭바 위까지의 높이) 메뉴 카드만 그 안에서 스크롤된다(2026-11-10 사용자 요청).
 * 양옆 여백은 예전(16px, 넓은 화면은 가운데 384px 판 바깥까지)의 2/3 — 화면 폭에 따라 같은 비율로.
 * 화면(page)과 디자인 확인 화면이 같이 쓴다.
 */
const SIDE = "px-[calc(max(16px,(100vw_-_384px)/2_+_16px)*2/3)]"; // calc 의 + · - 는 앞뒤 칸이 있어야 한다(_ = 칸)
export function AllMenu({ name, sections, diag = false }: { name: string; sections: MenuSection[]; diag?: boolean }) {
  const [q, setQ] = useState("");
  const shown = searchMenu(sections, q);
  return (
    // 넓은 화면(2026-11-27)은 본문 가운데 640px 열 — 위 SIDE 는 화면 전체 폭(100vw)으로 셈해 왼쪽 메뉴 몫을 모른다
    <main className={`flex h-[calc(100dvh-var(--nn-tabbar))] w-full flex-col overflow-hidden ${SIDE} pt-[calc(var(--nn-safe-top)+1.25rem)] pb-3 md:mx-auto md:max-w-[640px] md:px-5`} data-no-scroll>
      <h1 className="shrink-0 px-2 text-[22px] leading-tight font-bold tracking-tight">{name}</h1>
      <label className="mt-4 flex h-[52px] shrink-0 items-center gap-2.5 rounded-[18px] bg-[var(--gg-card)] px-4 shadow-[var(--gg-card-shadow)]">
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색"
          aria-label="메뉴 검색"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          data-testid="all-search"
        />
      </label>
      {/* 메뉴를 누르면 '전체에서 들어간 화면' 으로 표시 — 하단 탭을 아무것도 칠하지 않는다(lib/tab-origin, 2026-11-12) */}
      <div
        className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[26px] bg-[var(--gg-card)] pt-2 pb-3 shadow-[var(--gg-card-shadow)]"
        data-testid="all-menu"
        onClickCapture={(e) => {
          if ((e.target as Element).closest("a[href]")) setFromAll(true);
        }}
      >
        {shown.length === 0 ? (
          <p className="px-6 py-8 text-center text-[15px] text-muted" data-testid="all-empty">
            찾는 메뉴가 없어요
          </p>
        ) : (
          <MenuList sections={shown} idPrefix="all" />
        )}
        <p className="mt-3 px-2 text-center text-[11px] text-[#b0b8c1]">아이콘 · 토스팀의 토스페이스</p>
        {/* 화면 진단(2026-11-23, 운영자만) — 홈 화면 앱엔 주소창이 없어 여기서 들어간다. 다른 기기에서 가림이 생기면 이 화면으로 값을 받는다 */}
        {diag ? (
          <p className="mt-1 text-center">
            <a href="/dev/insets" className="text-[11px] text-[#b0b8c1] underline" data-testid="all-insets">
              화면 진단
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
