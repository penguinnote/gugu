import Image from "next/image";
import Link from "next/link";

import { MENU_ICON, type MenuIcon } from "@/lib/all-menu";

export type SummaryCard = {
  href: string | null;
  title: string;
  value: string;
  /** 이름 아래 작은 회색 줄(기준 · 마지막 정리 …) — 없으면 한 줄 */
  note: string;
  icon?: MenuIcon;
  /** 손볼 것이 남았다 — 오른쪽 값을 붉고 굵게 */
  warn?: boolean;
};

/**
 * 운영 홈 줄 목록(2026-11-11 토스 결로 다시 — 예전 두 칸 숫자 카드) — '전체' 탭 메뉴 줄과 같은 모양:
 * 왼쪽 토스페이스 칸 · 이름(아래 작은 회색 줄) · 오른쪽 값. 갈 곳이 있는 줄만 링크다. 흰 카드(TossCard)는 쓰는 쪽이 감싼다.
 */
export function AdminSummary({ cards, title, testId = "admin-summary" }: { cards: SummaryCard[]; title?: string; testId?: string }) {
  const id = `${testId}-title`;
  return (
    <section aria-labelledby={title ? id : undefined}>
      {title ? (
        <h2 id={id} className="px-6 pt-4 pb-1.5 text-[15px] font-semibold text-[var(--gg-section)]">
          {title}
        </h2>
      ) : null}
      <ul data-testid={testId}>
        {cards.map((c) => {
          const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[var(--gg-tile)]">
                {c.icon ? <Image src={MENU_ICON[c.icon]} alt="" width={26} height={26} unoptimized loading="eager" className="size-[26px]" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-medium">{c.title}</span>
                {c.note ? <span className="block text-[12.5px] leading-snug text-[var(--gg-hint)]">{c.note}</span> : null}
              </span>
              <span className={`shrink-0 text-right text-[14px] tabular-nums ${c.warn ? "font-bold text-[var(--gg-berry-ink)]" : "text-[var(--gg-hint)]"}`}>{c.value}</span>
            </>
          );
          const cls = "flex items-center gap-3.5 px-5 py-[7px]";
          return (
            <li key={c.title}>
              {c.href ? (
                <Link href={c.href} className={cls}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
