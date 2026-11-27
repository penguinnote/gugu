import type { MenuIcon, MenuItem, MenuSection } from "@/lib/all-menu";

/**
 * 넓은 화면 왼쪽 메뉴(2026-11-27) — 768px 이상에서 하단 탭바 대신. 메뉴는 '전체' 화면과 같은 원천(lib/all-menu)을 그대로 읽는다.
 *   맨 위 묶음(제목 없음)  하단 탭바의 홈 · 목장 · 기록 — 탭바가 사라지므로 여기로. '전체' 는 사이드바가 곧 전체 메뉴라 뺀다
 *   그 아래               allMenuFor() 의 묶음 그대로(제목 · 항목 · 승인 대기 빨간 숫자)
 *   맨 아래               로그아웃(나 묶음에서 빼서 따로 붙인다)
 * 지금 화면 칠하기 — 주소에 가장 길게 맞는 항목 하나. 같은 길이면 먼저 나온 것(#ai · #care 처럼 같은 화면의 칸은 첫 줄만). '/' 는 똑같을 때만.
 */
export type NavTabHref = "/" | "/groups" | "/records";
export type NavTab = { href: NavTabHref; label: string };

/** 하단 탭바와 같은 이름 · 같은 갈 곳(components/tab-bar TABS). 목장 탭은 목장을 맡은 리더에게만 */
export function navTabs(groups: boolean): NavTab[] {
  const all: NavTab[] = [
    { href: "/", label: "홈" },
    { href: "/groups", label: "목장" },
    { href: "/records", label: "기록" },
  ];
  return groups ? all : all.filter((t) => t.href !== "/groups");
}

export type SideItem = {
  href: string;
  label: string;
  /** 레일(768~1023px) 아이콘 아래 짧은 이름 */
  short: string;
  /** 메뉴 아이콘(토스페이스) — 탭 항목은 null 이고 tab 에 탭바 그림 */
  icon: MenuIcon | null;
  tab?: NavTabHref;
  badge?: number;
  active: boolean;
  testid?: string;
};
export type SideGroup = { title: string | null; items: SideItem[] };
export type SideNavModel = { groups: SideGroup[]; logout: MenuItem | null };

const pathOf = (href: string) => href.replace(/[?#].*$/, "") || "/";

/** 칠할 항목의 차례(평평하게 늘어놓은 hrefs 안). 없으면 -1 */
export function activeNavIndex(hrefs: string[], pathname: string): number {
  let best = -1;
  let bestLen = -1;
  hrefs.forEach((href, i) => {
    const p = pathOf(href);
    const hit = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`);
    if (hit && p.length > bestLen) {
      best = i;
      bestLen = p.length;
    }
  });
  return best;
}

export function buildSideNav(sections: MenuSection[], tabs: NavTab[], pathname: string): SideNavModel {
  const logout = sections.flatMap((s) => s.items).find((it) => it.action === "logout") ?? null;
  const groups: SideGroup[] = [
    { title: null, items: tabs.map((t) => ({ href: t.href, label: t.label, short: t.label, icon: null, tab: t.href, active: false })) },
    ...sections
      .map((s) => ({
        title: s.title,
        items: s.items
          .filter((it) => it.action !== "logout")
          .map((it): SideItem => ({ href: it.href, label: it.label, short: it.short ?? it.label, icon: it.icon, badge: it.badge, active: false, testid: it.testid })),
      }))
      .filter((g) => g.items.length > 0),
  ];
  const flat = groups.flatMap((g) => g.items);
  const at = activeNavIndex(
    flat.map((it) => it.href),
    pathname,
  );
  if (at >= 0) flat[at].active = true;
  return { groups, logout };
}
