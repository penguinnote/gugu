import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { hasGroupTab, requireAppUser } from "@/lib/auth/session";

import { GroupHome } from "./group-home";

export const metadata: Metadata = {
  title: "목장 · 구구",
};

/**
 * 목장 탭 — 내 목장 화면(2026-11-11 사용자 요청). 우리 목장 집 안 사진 위에 이름, 아래에 프로필. '전체 목장' 을 누르면 목장 목록(/groups/profiles),
 * 거기서 목장을 누르면 그 목장 화면(/groups/[이름]) — 같은 모양. 예전 이 화면의 메뉴(명단 · 사각지대 · 지난 보고서 · 내보내기 …)는 '전체' 탭에 있다.
 * 목장 탭은 목장을 맡은 리더만(2026-11-06) — 목사님 · 운영자 · 임원진은 '전체' 의 목장 프로필로 간다.
 */
export default async function Page() {
  const me = await requireAppUser();
  if (!hasGroupTab(me) || !me.groupId || !me.groupName) redirect("/");
  return <GroupHome me={me} group={{ id: me.groupId, name: me.groupName, number: me.groupNumber ?? 0 }} />;
}
