import Image from "next/image";
import Link from "next/link";

import { MENU_ICON, type MenuSection } from "@/lib/all-menu";

import { LogoutRow } from "./logout-row";

const ROW = "flex items-center gap-3.5 px-5 py-[7px]";

/**
 * 토스 '전체' 결의 메뉴 줄(2026-11-10 전체 탭 → 2026-11-11 목장 탭도) — 흰 카드 안에서 묶음 제목(회색) 아래 한 줄에 하나:
 * 왼쪽 아이콘 칸(토스페이스 원본) · 이름 · 오른쪽 회색 글씨(warn 이면 붉게) · 배지(빨간 숫자). 카드 자체(흰 바탕 · 둥근 모서리 · 스크롤)는 쓰는 쪽이 감싼다.
 */
export function MenuList({
  sections,
  idPrefix,
  itemTestId = "all-item",
}: {
  sections: MenuSection[];
  idPrefix: string;
  itemTestId?: string;
}) {
  return sections.map((s) => (
    <section key={s.title} aria-labelledby={`${idPrefix}-${s.title}`}>
      <h2
        id={`${idPrefix}-${s.title}`}
        className="px-6 pt-4 pb-1.5 text-[15px] font-semibold text-[var(--gg-section)]"
      >
        {s.title}
      </h2>
      <ul>
        {s.items.map((it) => (
          <li key={`${it.href}-${it.label}`}>
            {it.action === "logout" ? (
              <LogoutRow item={it} rowClass={ROW} />
            ) : (
              <Link
                href={it.href}
                className={ROW}
                data-testid={it.testid ?? itemTestId}
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-[13px] bg-[var(--gg-tile)]">
                  <Image
                    src={MENU_ICON[it.icon]}
                    alt=""
                    width={26}
                    height={26}
                    unoptimized
                    loading="eager"
                    className="size-[26px]"
                    data-testid="all-icon"
                  />
                  {it.badge ? (
                    <span
                      className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gg-berry)] px-1 text-[11px] leading-none font-bold text-white tabular-nums"
                      data-testid="all-badge"
                    >
                      {it.badge}
                    </span>
                  ) : null}
                </span>
                {/* 이름은 다 보이고 회색 글씨가 줄어든다(2026-11-18 — 이름이 길어져 '챙김이 필…' 로 잘렸다) */}
                <span className="max-w-full shrink-0 truncate text-[17px] font-medium">
                  {it.label}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-right text-[13.5px] tabular-nums ${it.warn ? "font-bold text-[var(--gg-berry-ink)]" : "text-[var(--gg-hint)]"}`}
                >
                  {it.hint}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  ));
}
