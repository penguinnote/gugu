import { cookies } from "next/headers";

import { SideNav } from "@/components/side-nav";
import { TabBar } from "@/components/tab-bar";
import { aiDigestEnabled } from "@/lib/ai/digest";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { allMenuFor, type MenuSection } from "@/lib/all-menu";
import { getUserContext, hasGroupTab, type UserContext } from "@/lib/auth/session";
import { groupLabel, memberRoleLabel, USER_ROLE_LABELS } from "@/lib/labels";
import { loadMenuPending } from "@/lib/menu-badges";
import { currentWeekKey } from "@/lib/week";

/**
 * 탭바가 보이는 화면들의 레이아웃 — 로그인·이름 연결·승인이 끝난 사용자의 화면.
 * 권한 판정은 각 화면의 require*() 가 한다(session.ts). 여기는 자리만 잡는다:
 * 본문 아래에 탭바 높이만큼 여백을 두어 마지막 내용이 가려지지 않게 한다.
 *
 * 넓은 화면(2026-11-27) — 768px 이상이면 하단 탭바 대신 왼쪽 메뉴(components/side-nav)와 본문. 폭 판단은 CSS 뿐이다:
 * 작은 화면에서는 감싼 칸이 display:contents 라 예전과 똑같이 본문 · 탭바가 body 바로 아래에 놓이고, 왼쪽 메뉴는 display:none.
 * 탭바 높이(--nn-tabbar)는 768px 이상에서 아래 안전 영역으로 바뀐다(globals.css) — 본문 아래 여백 · 탭바 위까지의 높이를 쓰는 화면이 그대로 맞는다.
 * 레이아웃은 화면을 옮겨도 다시 그려지지 않는다 — 메뉴의 빨간 숫자는 처음 열 때 · 새로 고칠 때 값이다.
 */
export default async function TabsLayout({ children }: LayoutProps<"/">) {
  // 목장 탭은 목장을 맡은 리더에게만(2026-11-06) — 목사님 · 운영자는 목장이 없다
  const me = await getUserContext();
  const side = await sideNavProps(me);
  return (
    <div className="contents md:flex md:flex-1 md:flex-row">
      {side ? <SideNav {...side} /> : null}
      <div className="flex flex-1 flex-col pb-[var(--nn-tabbar)] md:min-w-0 print:pb-0">{children}</div>
      <TabBar groups={hasGroupTab(me)} />
    </div>
  );
}

const APP_ROLES: UserContext["role"][] = ["leader", "pastor", "admin", "officer"];

async function sideNavProps(me: UserContext | null): Promise<{ name: string; sub: string; sections: MenuSection[]; groups: boolean } | null> {
  if (!me) return devSideNav();
  // 미승인 · 동의 전은 각 화면이 신청 · 동의 화면으로 보낸다 — 메뉴를 그리지 않는다
  if (!APP_ROLES.includes(me.role)) return null;
  const pending = await loadMenuPending(me.role);
  const sections = allMenuFor(me, { pending, ai: guguAiEnabled(), digest: aiDigestEnabled(), week: currentWeekKey() });
  return { name: me.displayName, sub: roleLine(me), sections, groups: hasGroupTab(me) };
}

/** 사용자 칸의 둘째 줄 — '토브 목장 · 목자', '목사님', '토브 목장 · 목동 · 운영자 · 임원진' */
function roleLine(me: Pick<UserContext, "role" | "leadsGroup" | "groupName" | "groupRole" | "isGroupHead" | "isOfficer">): string {
  const parts = me.leadsGroup ? [groupLabel(me.groupName), memberRoleLabel(me.groupRole, me.isGroupHead)] : [USER_ROLE_LABELS[me.role]];
  if (me.leadsGroup && me.role === "admin") parts.push(USER_ROLE_LABELS.admin);
  if (me.isOfficer && me.role !== "officer") parts.push(USER_ROLE_LABELS.officer);
  return parts.join(" · ");
}

/**
 * 디자인 확인(개발 서버만) — 로그인 없이 /dev/design 에서 왼쪽 메뉴를 보려고 쿠키 gg-dev-nav 에 역할을 넣으면 지어낸 사람으로 그린다.
 * 운영 · 프리뷰 빌드에서는 아무것도 하지 않는다. 메뉴는 링크뿐이라 데이터에 닿지 않는다.
 */
async function devSideNav() {
  if (process.env.NODE_ENV !== "development") return null;
  const role = (await cookies()).get("gg-dev-nav")?.value;
  const fake: Record<string, Pick<UserContext, "role" | "leadsGroup" | "groupName" | "groupRole" | "isGroupHead" | "isOfficer">> = {
    leader: { role: "leader", leadsGroup: true, groupName: "가온", groupRole: "leader", isGroupHead: true, isOfficer: false },
    pastor: { role: "pastor", leadsGroup: false, groupName: null, groupRole: null, isGroupHead: false, isOfficer: false },
    admin: { role: "admin", leadsGroup: false, groupName: null, groupRole: null, isGroupHead: false, isOfficer: false },
    officer: { role: "officer", leadsGroup: false, groupName: null, groupRole: null, isGroupHead: false, isOfficer: true },
  };
  const me = role ? fake[role] : undefined;
  if (!me) return null;
  return {
    name: "한가람",
    sub: roleLine(me),
    sections: allMenuFor(me, { pending: me.role === "admin" ? 3 : 0, week: currentWeekKey() }),
    groups: me.leadsGroup,
  };
}
