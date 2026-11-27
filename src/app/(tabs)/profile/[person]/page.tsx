import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ProfileHeader, PROFILE_BTN } from "@/components/profile/profile-header";
import { requireAppUser } from "@/lib/auth/session";
import { groupLabel } from "@/lib/labels";
import { loadPersonProfile } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

import { ProfileEditSheet } from "../../me/profile-edit-sheet";

export const metadata: Metadata = {
  title: "프로필 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 사람 프로필(2026-11-11 사용자 요청 — 인스타 그대로). 목장 프로필 '함께하는 사람' 에서 이름을 누르면.
 * 큰 동그라미(누르면 크게) · 목장 · 구분 · 훈련 단계, 이름 · 소개 · 말씀 · 관심사. 내 것이면 '프로필 편집', 아니면 그 목장으로.
 * 승인된 앱 사용자 누구나 본다(이름 · 소속 · 역할은 persons_public, 글 · 사진은 person_profile). 계정 없는 청년은 이름 · 소속만.
 */
export default async function PersonProfilePage({ params }: PageProps<"/profile/[person]">) {
  const me = await requireAppUser();
  const { person } = await params;
  if (!UUID.test(person)) notFound();
  const supabase = await createClient();
  const p = await loadPersonProfile(supabase, person);
  if (!p) notFound();
  const mine = me.personId === person;
  return (
    <>
      <AppHeader back={p.groupName ? `/groups/${encodeURIComponent(p.groupName)}` : "/groups"} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-6 px-5 pt-1 pb-8">
        <ProfileHeader
          p={p}
          actions={
            mine ? (
              <ProfileEditSheet hasPhoto={Boolean(p.photoUrl)} />
            ) : p.groupName ? (
              <Link href={`/groups/${encodeURIComponent(p.groupName)}`} className={PROFILE_BTN}>
                {groupLabel(p.groupName)}
              </Link>
            ) : null
          }
        />
      </main>
    </>
  );
}
