"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MENU_ICON, type MenuSection } from "@/lib/all-menu";
import { buildSideNav, navTabs } from "@/lib/side-nav";

import { LogoutRow } from "./logout-row";
import { TabIcon } from "./tab-bar";

/**
 * 넓은 화면 왼쪽 메뉴(2026-11-27) — 768px 이상에서 하단 탭바 대신(작은 화면에서는 아예 보이지 않는다, display:none).
 *   768~1023px  아이콘 레일(--nn-side 72px) — 아이콘 아래 짧은 이름, 마우스를 올리면 전체 이름(title). 묶음 제목 · 사용자 칸은 숨긴다
 *   1024px 이상 펼친 사이드바(232px) — 로고 · 사용자 칸 · 묶음 제목 · 항목 이름 · 오른쪽 빨간 숫자
 * 화면 높이에 붙어 있고, 메뉴가 길면 이 안에서만 스크롤한다. 홈 화면 앱(아이패드)은 위아래 안전 영역만큼 띄운다(PC 는 0).
 * 메뉴는 '전체' 화면과 같은 원천(lib/all-menu → lib/side-nav). 레이아웃은 화면을 옮겨도 다시 그려지지 않으므로 지금 화면 칠하기는 여기서 주소를 보고 한다.
 */
export function SideNav({ name, sub, sections, groups }: { name: string; sub: string; sections: MenuSection[]; groups: boolean }) {
  const pathname = usePathname() ?? "/";
  const nav = buildSideNav(sections, navTabs(groups), pathname);
  const row =
    "flex flex-col items-center gap-1 rounded-[14px] px-1 py-2 text-center transition-colors hover:bg-[var(--gg-tile)] lg:flex-row lg:gap-3 lg:px-3 lg:py-[7px] lg:text-left";
  return (
    <aside
      aria-label="메뉴"
      className="sticky top-0 hidden h-dvh w-[var(--nn-side)] shrink-0 flex-col border-r border-[var(--gg-line)] bg-[var(--gg-card)] md:flex print:hidden"
      data-testid="side-nav"
    >
      <Link href="/" className="flex shrink-0 items-center justify-center gap-2.5 px-3 pt-[calc(var(--nn-safe-top)+18px)] pb-3 lg:justify-start lg:px-5" aria-label="구구 홈">
        <Image src="/icon-192.png" alt="" width={36} height={36} unoptimized className="size-9 shrink-0 rounded-[11px] shadow-[0_1px_4px_rgb(16_24_40/0.12)]" />
        <span className="hidden min-w-0 lg:block">
          <span className="gg-display block text-[20px] leading-none">구구</span>
          <span className="mt-1 block text-[11.5px] leading-none text-[var(--gg-hint)]">청년부 목장보고서</span>
        </span>
      </Link>
      <div className="mx-4 mb-2 hidden items-center gap-2.5 rounded-[16px] bg-[var(--gg-tile)] px-3 py-2.5 lg:flex" data-testid="side-user">
        <span aria-hidden className="gg-display grid size-9 shrink-0 place-items-center rounded-full bg-[var(--gg-sky-soft)] text-[16px] text-[var(--gg-sky-ink)]">
          {name.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold">{name}</span>
          <span className="block truncate text-[12px] text-[var(--gg-section)]">{sub}</span>
        </span>
      </div>
      <nav aria-label="주 메뉴" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 lg:px-3">
        {nav.groups.map((g, gi) => (
          <section key={g.title ?? "tabs"} aria-label={g.title ?? undefined} className={gi > 0 ? "mt-2 border-t border-[var(--gg-line)] pt-2 lg:mt-3 lg:border-0 lg:pt-0" : ""}>
            {g.title ? <h2 className="hidden px-3 pt-1 pb-1.5 text-[12.5px] font-semibold text-[var(--gg-hint)] lg:block">{g.title}</h2> : null}
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={`${it.href}-${it.label}`}>
                  <Link
                    href={it.href}
                    title={it.label}
                    aria-current={it.active ? "page" : undefined}
                    className={`${row} ${it.active ? "bg-[var(--gg-sky-soft)] font-bold text-[var(--gg-nav-ink)] hover:bg-[var(--gg-sky-soft)]" : "text-[var(--gg-section)]"}`}
                    data-testid={it.testid ?? "side-item"}
                  >
                    <span className="relative grid size-7 shrink-0 place-items-center">
                      {it.tab ? (
                        <TabIcon href={it.tab} active={it.active} />
                      ) : it.icon ? (
                        <Image src={MENU_ICON[it.icon]} alt="" width={24} height={24} unoptimized loading="eager" className="size-6" />
                      ) : null}
                      {it.badge ? (
                        // 레일에서는 아이콘 귀퉁이에 — 펼친 사이드바에서는 오른쪽 끝(아래)
                        <span className="absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--gg-berry)] px-1 text-[10.5px] leading-none font-bold text-white tabular-nums lg:hidden" aria-hidden>
                          {it.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className={`text-[10.5px] leading-tight lg:hidden ${it.active ? "font-bold" : "font-semibold"}`}>{it.short}</span>
                    <span className="hidden min-w-0 flex-1 truncate text-[15px] lg:block">{it.label}</span>
                    {it.badge ? (
                      <span className="hidden h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--gg-berry)] px-1.5 text-[11.5px] leading-none font-bold text-white tabular-nums lg:grid" data-testid="side-badge">
                        {it.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      {nav.logout ? (
        <div className="shrink-0 border-t border-[var(--gg-line)] px-2 pt-2 pb-[calc(var(--nn-safe-bottom)+10px)] lg:px-3">
          <LogoutRow item={nav.logout} rowClass={`${row} text-[var(--gg-section)]`} side />
        </div>
      ) : null}
    </aside>
  );
}
