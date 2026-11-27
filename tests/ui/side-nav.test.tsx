import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allMenuFor } from "@/lib/all-menu";
import { activeNavIndex, buildSideNav, navTabs } from "@/lib/side-nav";

/**
 * 넓은 화면 왼쪽 메뉴(2026-11-27)
 *   · 메뉴는 '전체' 화면과 같은 원천(allMenuFor) — 역할마다 같은 묶음 · 같은 항목, 맨 위에 탭바의 홈 · 목장 · 기록
 *   · 로그아웃은 맨 아래 따로, 승인 대기 빨간 숫자는 그대로
 *   · 지금 화면 칠하기 — 가장 길게 맞는 항목 하나, '/' 는 똑같을 때만, # 칸은 첫 줄만
 *   · 768px 아래는 그리지 않는다(display:none) · 탭바는 768px 이상에서 숨는다
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/sign-out-button", () => ({ SignOutButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button> }));

const { SideNav } = await import("@/components/side-nav");

type Me = Parameters<typeof allMenuFor>[0];
const LEADER: Me = { role: "leader", leadsGroup: true };
const PASTOR: Me = { role: "pastor", leadsGroup: false };
const ADMIN: Me = { role: "admin", leadsGroup: false };
const OFFICER: Me = { role: "officer", leadsGroup: false };
const WEEK = "2026-11-22";

const activeOf = (me: Me, path: string, groups = me.leadsGroup) =>
  buildSideNav(allMenuFor(me, { week: WEEK }), navTabs(groups), path)
    .groups.flatMap((g) => g.items)
    .filter((it) => it.active)
    .map((it) => it.label);

describe("왼쪽 메뉴 — 역할별 항목", () => {
  for (const [name, me] of [["리더", LEADER], ["목사님", PASTOR], ["운영자", ADMIN], ["임원진", OFFICER]] as const) {
    it(`${name} — 전체 메뉴와 같은 묶음 · 같은 항목(로그아웃만 맨 아래로), 맨 위는 탭바 항목`, () => {
      const sections = allMenuFor(me, { week: WEEK, pending: 2 });
      const nav = buildSideNav(sections, navTabs(me.leadsGroup), "/");
      expect(nav.groups[0].title).toBeNull();
      expect(nav.groups[0].items.map((it) => it.href)).toEqual(me.leadsGroup ? ["/", "/groups", "/records"] : ["/", "/records"]);
      expect(nav.groups.slice(1).map((g) => g.title)).toEqual(sections.map((s) => s.title));
      expect(nav.groups.slice(1).flatMap((g) => g.items.map((it) => it.href))).toEqual(
        sections.flatMap((s) => s.items.filter((it) => it.action !== "logout").map((it) => it.href)),
      );
      expect(nav.logout?.href).toBe("/auth/signout");
    });
  }

  it("승인 대기 수는 '승인' 항목의 빨간 숫자 그대로", () => {
    const nav = buildSideNav(allMenuFor(ADMIN, { pending: 3 }), navTabs(false), "/");
    expect(nav.groups.flatMap((g) => g.items).find((it) => it.href === "/approvals")?.badge).toBe(3);
  });

  it("레일의 짧은 이름 — 정해 둔 것, 없으면 이름 그대로. 모두 여섯 글자 안", () => {
    for (const me of [LEADER, PASTOR, ADMIN, OFFICER, { role: "admin", leadsGroup: true, isOfficer: false } as Me]) {
      const items = buildSideNav(allMenuFor(me, { week: WEEK, ai: true, digest: true }), navTabs(true), "/").groups.flatMap((g) => g.items);
      for (const it of items) expect(it.short.replace(/\s/g, "").length, it.label).toBeLessThanOrEqual(6);
    }
  });
});

describe("지금 화면 강조", () => {
  it("가장 길게 맞는 항목 하나 — 상세 화면은 그 목록 항목", () => {
    expect(activeOf(LEADER, "/groups/members/abc")).toEqual(["우리 목장 명단"]);
    expect(activeOf(LEADER, "/groups/people/abc")).toEqual(["출석/기도제목 기록 보기"]);
    expect(activeOf(LEADER, "/groups/가온")).toEqual(["목장"]);
    expect(activeOf(ADMIN, "/admin/people/new")).toEqual(["새 사람 추가"]);
    expect(activeOf(ADMIN, "/admin/people/abc")).toEqual(["명단"]);
    expect(activeOf(ADMIN, "/admin")).toEqual(["운영 홈"]);
  });
  it("홈('/')은 똑같을 때만", () => {
    expect(activeOf(LEADER, "/")).toEqual(["홈"]);
    expect(activeOf(LEADER, "/shop")).toEqual(["상점"]);
    expect(activeOf(LEADER, "/all")).toEqual([]);
  });
  it("같은 화면의 # 칸(제출 현황 #ai · #care …)은 첫 줄만", () => {
    expect(activeOf(PASTOR, "/pastor")).toEqual(["제출 현황"]);
  });
  it("이번 주 보고서 — 이번 주면 그 줄, 지난 주면 '지난 목장보고서'", () => {
    expect(activeOf(LEADER, `/reports/${WEEK}`)).toEqual(["이번 주 목장보고서"]);
    expect(activeOf(LEADER, "/reports/2026-11-15")).toEqual(["지난 목장보고서"]);
  });
  it("activeNavIndex — 주소의 ? · # 는 떼고 본다, 없으면 -1", () => {
    expect(activeNavIndex(["/world?open=dress", "/pastor#ai"], "/pastor")).toBe(1);
    expect(activeNavIndex(["/a", "/b"], "/c")).toBe(-1);
  });
});

describe("그리기", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("지금 화면 항목에 aria-current=page, 768px 아래에서는 숨는다(hidden md:flex), 로그아웃은 맨 아래", async () => {
    pathname = "/groups/members/abc";
    await act(async () => root.render(<SideNav name="한가람" sub="가온 목장 · 목자" sections={allMenuFor(LEADER, { week: WEEK })} groups />));
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/(^| )hidden( |$)/);
    expect(aside.className).toContain("md:flex");
    const current = container.querySelectorAll("a[aria-current=page]");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/groups/members");
    expect(container.querySelector("[data-testid=side-user]")?.textContent).toContain("가온 목장 · 목자");
    const last = [...aside.children].at(-1)!;
    expect(last.querySelector("[data-testid=side-logout]")).not.toBeNull();
  });

  it("하단 탭바는 768px 이상에서 숨는다 · 본문 열은 작은 화면에서 예전 max-w-sm 그대로", () => {
    const bar = readFileSync(join(process.cwd(), "src/components/tab-bar.tsx"), "utf8");
    expect(bar).toMatch(/fixed inset-x-0 bottom-\[var\(--nn-tabbar-gap\)\] z-20 px-3\.5 md:hidden/);
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/@utility gg-col \{\s*max-width: 24rem;\s*@media \(width >= 48rem\) \{\s*max-width: 640px;/);
    // 768px 이상에서만 탭바 높이를 아래 안전 영역으로 바꾼다
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*:root \{\s*--nn-tabbar: var\(--nn-safe-bottom\);/);
  });
});
