import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAppUser } from "@/lib/auth/session";
import { loadGroupByName } from "@/lib/group-profile-data";
import { createClient } from "@/lib/supabase/server";

import { GroupHome } from "../group-home";

export const metadata: Metadata = {
  title: "목장 프로필 · 구구",
};

/**
 * L-5a 목장 프로필 — 승인된 전원이 12목장 전부를 본다. 식별자는 이름(/groups/새싹).
 * 격리의 예외 구역이므로 화면이 범위를 거르지 않는다. 없는 이름·해산한 목장은 404.
 * 2026-11-11 — 목장 탭 첫 화면과 같은 모양(group-home): 그 목장 집 안 사진 위에 이름, 아래에 프로필.
 */
export default async function GroupProfilePage({ params }: PageProps<"/groups/[name]">) {
  const me = await requireAppUser();
  const { name: raw } = await params;
  const supabase = await createClient();
  const group = await loadGroupByName(supabase, decodeURIComponent(raw));
  if (!group) notFound();

  return <GroupHome me={me} group={group} />;
}
