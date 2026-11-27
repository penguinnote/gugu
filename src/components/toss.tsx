import type { ReactNode } from "react";

/**
 * 토스 결 조각(2026-11-11 UI 통일) — '전체' · '기록' 탭과 같은 모양을 다른 화면도 쓴다.
 *   TossCard     흰 카드 하나(둥근 26px · 옅은 그림자). 안에 묶음 여럿
 *   TossSection  묶음 — 회색 제목(15px) · 오른쪽 회색 글씨 하나. 아이콘 칸 · 색칠한 머리는 쓰지 않는다
 * 줄은 좌우 24px(px-6), 이름 16~17px, 오른쪽 글씨는 --gg-hint(13.5px).
 */
export function TossCard({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    // overflow-hidden — 줄 바탕색(우리 목장 라임 등)이 둥근 모서리 밖으로 튀어나오지 않게(2026-11-11)
    <div className={`overflow-hidden rounded-[26px] bg-[var(--gg-card)] pt-1 pb-3 shadow-[var(--gg-card-shadow)] ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

export function TossSection({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 px-6 pt-4 pb-1.5">
        <h2 id={id} className="text-[15px] font-semibold text-[var(--gg-section)]">
          {title}
        </h2>
        {aside ? <span className="shrink-0 text-[13.5px] text-[var(--gg-hint)] tabular-nums">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 묶음 카드(2026-11-11 목장 프로필 A안) — 묶음마다 흰 카드 하나, 머리에 토스페이스 아이콘(22px) · 굵은 제목(16px) · 오른쪽 회색 글씨.
 * 글이 많은 화면에서 카드 사이 빈틈으로 묶음을 나눈다.
 */
export function IconCard({ icon, title, aside, sub, children, id, testId }: { icon: string; title: string; aside?: ReactNode; sub?: ReactNode; children?: ReactNode; id?: string; testId?: string }) {
  return (
    <section aria-labelledby={id} className={`overflow-hidden rounded-[22px] bg-[var(--gg-card)] px-4 pt-3.5 shadow-[var(--gg-card-shadow)] ${children ? "pb-4" : "pb-2"}`} data-testid={testId}>
      <div className="mb-2.5 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- 토스페이스 원본 SVG(public/icons/tossface) */}
        <img src={icon} alt="" width={22} height={22} className="size-[22px] shrink-0" />
        <h2 id={id} className="min-w-0 flex-1 text-[16px] font-bold">
          {title}
        </h2>
        {aside ? <span className="shrink-0 text-[13px] text-[var(--gg-hint)] tabular-nums">{aside}</span> : null}
      </div>
      {sub ? <div className="-mt-1.5 mb-2.5 pl-[32px] text-[13px] leading-snug text-[var(--gg-hint)]">{sub}</div> : null}
      {children}
    </section>
  );
}

/**
 * 카드 안 줄 목록(2026-11-11 목사님 화면) — 회색 칸 없이 카드 폭 그대로, 줄 사이 옅은 선. 오른쪽 꺾쇠(›)는 두지 않는다('전체' 와 같다).
 *   <ul className={CARD_LIST}><li><Link className={CARD_ROW}>…</Link></li></ul>
 */
export const CARD_LIST = "-mx-4 -mb-2 divide-y divide-[var(--gg-line)]";
export const CARD_ROW = "flex items-center justify-between gap-3 px-4 py-3";
/** 줄 오른쪽 짧은 글씨(결석 · 목장 불참 · 연속 n주) — 붉은색 없이 진한 회색 */
export const ROW_TAG = "shrink-0 text-right text-[12.5px] font-semibold text-[var(--gg-section)] tabular-nums";
