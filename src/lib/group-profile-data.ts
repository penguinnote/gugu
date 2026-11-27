import "server-only";

import { parseDDays, parseThemeSongs, type DDay, type MemberRow, type ProfileBlocks } from "@/lib/group-profile";
import { createClient } from "@/lib/supabase/server";

/**
 * 목장 프로필 읽기 경로 (Step 8). 범위는 전부 RLS 가 정한다 — 승인된 전원이 12목장 프로필과
 * persons_public(이름·성별·역할)을 읽는다(tests/rls/group-profile.test.mjs). 화면은 거르지 않는다 —
 * 이 탭은 격리의 예외 구역이다(02 §4).
 */

export type GroupRow = { id: string; name: string; number: number };

export type ProfileRecord = {
  blocks: ProfileBlocks;
  /** 낙관적 잠금에 쓴다. 행이 없으면 null — 첫 편집은 insert */
  updatedAt: string | null;
};

export type HubCard = GroupRow & {
  leaders: number;
  members: number;
  intro: string | null;
  ddays: DDay[];
};

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadGroupByName(supabase: Client, name: string): Promise<GroupRow | null> {
  const { data } = await supabase
    .from("groups")
    .select("id, name, number")
    .eq("name", name)
    .eq("status", "active")
    .maybeSingle();
  return data ?? null;
}

export async function loadProfile(supabase: Client, groupId: string): Promise<ProfileRecord> {
  const { data } = await supabase
    .from("group_profiles")
    .select("verse, intro, free_text, ddays, theme_songs, updated_at")
    .eq("group_id", groupId)
    .maybeSingle();
  if (!data) {
    return { blocks: { verse: null, intro: null, freeText: null, ddays: [], themeSongs: [] }, updatedAt: null };
  }
  return {
    blocks: {
      verse: data.verse,
      intro: data.intro,
      freeText: data.free_text,
      ddays: parseDDays(data.ddays),
      themeSongs: parseThemeSongs(data.theme_songs),
    },
    updatedAt: data.updated_at,
  };
}

export async function loadMembers(supabase: Client, groupId: string): Promise<MemberRow[]> {
  const { data } = await supabase
    .from("persons_public")
    .select("id, name, group_role, is_group_head")
    .eq("group_id", groupId);
  return (data ?? []).flatMap((r) =>
    r.id && r.name && r.group_role ? [{ id: r.id, name: r.name, group_role: r.group_role, is_group_head: r.is_group_head ?? false }] : [],
  );
}

/** 전체 목장 허브 — 운영 중인 목장 전부(순서는 화면이 정한다 — lib/group-order). 카드 한 장에 인원 수·소개·디데이. */
export async function loadHub(supabase: Client): Promise<HubCard[]> {
  const [groupsRes, profilesRes, personsRes] = await Promise.all([
    supabase.from("groups").select("id, name, number").eq("status", "active"),
    supabase.from("group_profiles").select("group_id, intro, ddays"),
    supabase.from("persons_public").select("group_id, group_role"),
  ]);
  const profile = new Map((profilesRes.data ?? []).map((p) => [p.group_id, p]));
  const counts = new Map<string, { leaders: number; members: number }>();
  for (const p of personsRes.data ?? []) {
    if (!p.group_id) continue;
    const c = counts.get(p.group_id) ?? { leaders: 0, members: 0 };
    if (p.group_role === "leader") c.leaders += 1;
    else c.members += 1;
    counts.set(p.group_id, c);
  }
  return (groupsRes.data ?? []).map((g) => {
    const p = profile.get(g.id);
    const c = counts.get(g.id) ?? { leaders: 0, members: 0 };
    return { ...g, leaders: c.leaders, members: c.members, intro: p?.intro ?? null, ddays: parseDDays(p?.ddays) };
  });
}

