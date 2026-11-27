"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { goTab } from "@/lib/nav-history";
import { getFromAll, getFromAllServer, setFromAll, subscribeFromAll, TAB_ROOTS } from "@/lib/tab-origin";

/**
 * 하단 탭바 — 홈 / 목장 / 기록 / 전체(2026-11-10 — 상점을 빼고 토스처럼 맨 오른쪽에 '전체', 정보 탭은 '기록' 으로 바꿨다). 목장이 없는 역할은 세 칸.
 *
 * 아이콘은 한 가지 결의 선 그림(2026-10-18). 떠 있는 유리 알약(2026-10-23) — 지금 탭은 옅은 유리 칸 안에 진하게.
 * 높이는 :root 의 --nn-tabbar 하나로 정해지고, 본문 하단 여백과
 * 작성 화면의 고정 제출 바가 같은 값을 쓴다(globals.css).
 *
 * 탭바가 보이는 화면은 (tabs) 라우트 그룹 안에 있다. 로그인·신청(/login, /apply)은 그룹 밖이라
 * 구조적으로 안 보이지만, 여기서도 한 번 더 막는다 — 두 겹이 싸다.
 */
export const TABS = [
  { href: "/", label: "홈", match: (p: string) => p === "/" || p.startsWith("/reports") || p.startsWith("/pastor") },
  { href: "/groups", label: "목장", match: (p: string) => p.startsWith("/groups") || p.startsWith("/profile/") }, // 사람 프로필(2026-11-11)도 목장
  // 기록 — 모든 목장의 연속 제출 · 열매(2026-11-10, 정보 탭 자리)
  { href: "/records", label: "기록", match: (p: string) => p.startsWith("/records") },
  // 전체 — 갈 곳을 모두 모은 메뉴. 칠하는 것은 '전체' 화면 하나뿐 — 전체에서 들어간 화면(상점 · 내 정보 · 운영 …)은 아무 탭도 칠하지 않는다(2026-11-12)
  { href: "/all", label: "전체", match: (p: string) => p.startsWith("/all") },
] as const;

/**
 * 탭 아이콘 — 선 그림 한 가지 결(2026-10-18, 민트 소다). 색은 글자색을 따라 지금 탭은 짙은 민트, 나머지는 회색.
 * 지금 탭은 그림 안쪽을 옅게 채운다. 홈은 집, 목장은 두 사람, 기록은 막대 셋(2026-11-10), 전체는 줄 셋(2026-11-10).
 */
export function TabIcon({ href, active }: { href: (typeof TABS)[number]["href"]; active: boolean }) {
  const fill = active ? "currentColor" : "none";
  const svg = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
  if (href === "/")
    return svg(
      <>
        <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill={fill} fillOpacity={0.16} />
        <path d="M9.5 20.5v-5.5h5v5.5" />
      </>,
    );
  if (href === "/groups")
    return svg(
      <>
        <circle cx="9" cy="8.5" r="3.2" fill={fill} fillOpacity={0.16} />
        <path d="M3 19.5c.6-3.4 2.8-5.2 6-5.2s5.4 1.8 6 5.2" fill={fill} fillOpacity={0.16} />
        <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.8.6 3 2.2 3.5 4.9" />
      </>,
    );
  if (href === "/all") return svg(<path d={active ? "M4 6.5h16M4 12h16M4 17.5h16" : "M4.5 6.5h15M4.5 12h15M4.5 17.5h15"} strokeWidth={active ? 2.3 : 1.9} />);
  // 기록 — 높이가 다른 막대 셋
  return svg(
    <>
      <rect x="4" y="12.5" width="4" height="7.5" rx="1.3" fill={fill} fillOpacity={0.16} />
      <rect x="10" y="5" width="4" height="15" rx="1.3" fill={fill} fillOpacity={0.16} />
      <rect x="16" y="9" width="4" height="11" rx="1.3" fill={fill} fillOpacity={0.16} />
    </>,
  );
}

const NO_TABBAR = ["/login", "/apply", "/auth"];

export function TabBar({ groups = true }: { groups?: boolean }) {
  const pathname = usePathname() ?? "/";
  const fromAll = useSyncExternalStore(subscribeFromAll, getFromAll, getFromAllServer);
  const atRoot = TAB_ROOTS.includes(pathname);
  useEffect(() => {
    if (atRoot) setFromAll(false);
  }, [atRoot]);
  if (NO_TABBAR.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  // 목장이 없는 역할(목사님 · 운영자 · 임원진)은 목장 탭 없이 세 칸 — 명단 · 목장 프로필 화면은 '전체' 에서 가므로 아무 탭도 칠하지 않는다
  const tabs = groups ? TABS : TABS.filter((t) => t.href !== "/groups");
  // '전체' 메뉴로 들어간 화면이면(lib/tab-origin) 탭 첫 화면이 아닌 동안 아무 탭도 칠하지 않는다(2026-11-12 사용자 요청)
  const isActive = (t: (typeof TABS)[number]) => (fromAll && !atRoot ? false : t.match(pathname));

  return (
    <nav
      aria-label="주 메뉴"
      // 768px 이상은 왼쪽 메뉴(components/side-nav)가 대신한다(2026-11-27)
      className="kb-hide fixed inset-x-0 bottom-[var(--nn-tabbar-gap)] z-20 px-3.5 md:hidden print:hidden"
    >
      {/* 떠 있는 유리 알약(2026-10-23) — 유리 색은 globals.css 의 --gg-glass*. 모든 화면에서 같은 자리 */}
      <ul
        className={`mx-auto grid h-16 w-full max-w-sm ${groups ? "grid-cols-4" : "grid-cols-3"} rounded-[32px] border border-[var(--gg-glass-line)] bg-[var(--gg-glass)] px-1.5 shadow-[var(--gg-glass-shadow)] backdrop-blur-[22px] backdrop-saturate-[1.6]`}
      >
        {tabs.map((t) => {
          const active = isActive(t);
          return (
            <li key={t.href} className="flex items-center justify-center">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  // 뒤로가기 구조(lib/nav-history) — 홈은 바닥으로 돌아가고, 다른 탭은 홈 바로 위 한 칸에 갈아 끼운다
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  setFromAll(false);
                  goTab(t.href);
                }}
                className={[
                  // 누르는 느낌(2026-11-11) — 다른 링크처럼 회색(안쪽 그림자)과 살짝 작아짐이 부드럽게 들고, 다음 화면까지 붙잡는다(data-pressing).
                  // 예전엔 transition-colors 가 그림자 · 크기 바뀜을 빼서, 손을 떼고 붙잡기가 걸리는 사이 회색이 한 번 깜빡였다
                  "flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[26px] transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-95 data-pressing:scale-95",
                  active ? "bg-[var(--gg-glass-on)] text-foreground" : "text-muted",
                ].join(" ")}
              >
                <TabIcon href={t.href} active={active} />
                <span className="text-[10.5px] leading-none font-semibold">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
