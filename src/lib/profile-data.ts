import type { ProfileFacts } from "@/components/profile/profile-header";
import type { UserContext } from "@/lib/auth/session";
import { GROUP_ROLE_LABELS, USER_ROLE_LABELS } from "@/lib/labels";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * 프로필 화면 값(2026-11-11 인스타처럼) — 명단 사람(person) 하나, 또는 명단에 없는 내 계정(목사님 · 운영자 · 임원진).
 * 숫자 칸: 목장 · 구분(리더 · 양) · 훈련 단계(목자 · 목동 · 예비목자반 · 제자반 · 새가족반 · 양) — 목장 명단에 적힌 그대로(2026-11-16). 글 · 사진은 계정이 이어진 사람만(person_profile).
 */
export async function loadPersonProfile(supabase: Client, personId: string): Promise<(ProfileFacts & { groupName: string | null }) | null> {
  const { data: p } = await supabase.from("persons_public").select("id, name, group_id, group_role, is_group_head, training_stage").eq("id", personId).maybeSingle();
  if (!p?.id || !p.name) return null;
  const [groupRes, profRes] = await Promise.all([
    p.group_id ? supabase.from("groups").select("name").eq("id", p.group_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("person_profile", { p_person_id: personId }),
  ]);
  const prof = (profRes.data ?? [])[0] as { bio: string | null; verse: string | null; interests: string[] | null; photo_at: string | null } | undefined;
  const groupName = (groupRes.data as { name: string } | null)?.name ?? null;
  return {
    seed: p.id,
    name: p.name,
    photoUrl: prof?.photo_at ? `/groups/photo/${p.id}/${Date.parse(prof.photo_at)}` : null,
    stats: [
      { label: "목장", value: groupName ?? "—" },
      { label: "구분", value: p.group_role === "leader" || p.group_role === "member" ? GROUP_ROLE_LABELS[p.group_role as "leader" | "member"] : "—" },
      { label: "훈련 단계", value: p.training_stage?.trim() || "—" },
    ],
    bio: prof?.bio ?? null,
    verse: prof?.verse ?? null,
    interests: prof?.interests ?? [],
    groupName,
  };
}

/** 내 프로필 — 명단에 이어져 있으면 그 사람으로, 아니면 내 계정(역할만) */
export async function loadMyProfile(supabase: Client, me: UserContext): Promise<ProfileFacts> {
  if (me.personId) {
    const p = await loadPersonProfile(supabase, me.personId);
    if (p) return p;
  }
  const [profRes, photoRes] = await Promise.all([
    supabase.from("user_profiles").select("bio, verse, interests").maybeSingle(),
    supabase.from("profile_photos").select("updated_at").maybeSingle(),
  ]);
  return {
    seed: me.userId,
    name: me.displayName,
    photoUrl: photoRes.data?.updated_at ? `/me/photo/${Date.parse(photoRes.data.updated_at)}` : null,
    stats: [
      { label: "구분", value: USER_ROLE_LABELS[me.role] },
      { label: "목장", value: me.groupName ?? "—" },
      { label: "훈련 단계", value: "—" },
    ],
    bio: profRes.data?.bio ?? null,
    verse: profRes.data?.verse ?? null,
    interests: profRes.data?.interests ?? [],
  };
}
