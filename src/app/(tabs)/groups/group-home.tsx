import Link from "next/link";

import { TabHeader } from "@/components/tab-header";
import { FixedPage, GLASS_PILL } from "@/components/tab-title";
import type { UserContext } from "@/lib/auth/session";
import { canEditProfile } from "@/lib/group-profile";
import { loadMembers, loadProfile, type GroupRow } from "@/lib/group-profile-data";
import { groupLabel } from "@/lib/labels";
import { freshShotAt } from "@/lib/room-shot";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { ProfileView } from "./[name]/profile-view";

/**
 * 목장 한 곳의 화면(2026-11-11 사용자 요청 — 목장 탭을 목장 프로필로). 맨 위는 그 목장 집 안(월드가 찍은 사진, world_room_shots —
 * 없으면 빈 집 안 그림에 이름판), 그 위에 이름 · 리더와 양 수 · 오른쪽 '전체 목장'(목장 목록). 아래는 프로필(소개 · 함께하는 사람 · 디데이 · 찬양 · 이야기).
 * 목장 탭 첫 화면(/groups — 내 목장)과 목장마다의 화면(/groups/[이름])이 같이 쓴다.
 */
export async function GroupHome({ me, group }: { me: UserContext; group: GroupRow }) {
  const supabase = await createClient();
  const [profile, members, shotRes] = await Promise.all([
    loadProfile(supabase, group.id),
    loadMembers(supabase, group.id),
    // 저장 시각만 읽고 그림은 /groups/room-shot 이 준다(승인된 앱 사용자 누구나 — 다른 목장 집도 구경한다)
    supabase.from("world_room_shots").select("updated_at").eq("group_id", group.id).maybeSingle(),
  ]);
  // 프로필 사진이 있는 사람(2026-11-11) — '함께하는 사람' 동그라미에. 실패하면 사진 없이(이름 글자)
  const photoRes = members.length ? await supabase.rpc("person_photos", { p_person_ids: members.map((m) => m.id) }) : null;
  const photoRows = (photoRes?.data ?? []) as { person_id: string; updated_at: string }[];
  const photos = new Map<string, number>(photoRows.map((r) => [r.person_id, Date.parse(r.updated_at)]));
  const shotAt = freshShotAt(shotRes.data?.updated_at); // 예전 방 모습(2026-11-10 전) 사진은 없는 것으로 — lib/room-shot
  const leaders = members.filter((m) => m.group_role === "leader").length;
  const youths = members.filter((m) => m.group_role === "member").length;
  const editHref = canEditProfile(me, group.id) ? `/groups/${encodeURIComponent(group.name)}/edit` : null;
  // 머리 그림은 제자리, 요절 말씀부터 아래만 스크롤(2026-11-15 사용자 요청)
  return (
    <FixedPage
      header={
        <TabHeader
      title={groupLabel(group.name)}
      sub={`리더 ${leaders} · 양 ${youths}`}
      photo={shotAt ? `/groups/room-shot/${group.id}/${shotAt}` : "/home/hd-room-blank.webp"}
      photoLabel={shotAt ? undefined : groupLabel(group.name)}
      pin
      pinDrop={8}
      aside={
        <Link href="/groups/profiles" className={GLASS_PILL} data-testid="all-groups-link">
          전체 목장
        </Link>
      }
    />
      }
    >
      <main className="mx-auto flex w-full gg-col flex-col gap-5 px-5 pt-1 pb-8">
        <ProfileView blocks={profile.blocks} members={members} today={kstToday()} editHref={editHref} photos={photos} />
      </main>
    </FixedPage>
  );
}
