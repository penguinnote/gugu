import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { requireAppUser } from "@/lib/auth/session";
import { canEditProfile } from "@/lib/group-profile";
import { loadGroupByName, loadProfile } from "@/lib/group-profile-data";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { saveGroupProfile } from "./actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "프로필 편집 · 구구",
};

/**
 * L-5b 프로필 편집 — 자기 목장 리더, 그리고 '내리기' 권한의 목사님·운영자. 그 외는 404 (403 이 아니라 —
 * 한 가지 방식으로만 답한다, session.ts). 진짜 강제는 RLS 다.
 */
export default async function GroupProfileEditPage({ params }: PageProps<"/groups/[name]/edit">) {
  const me = await requireAppUser();
  const { name: raw } = await params;
  const supabase = await createClient();
  const group = await loadGroupByName(supabase, decodeURIComponent(raw));
  if (!group || !canEditProfile(me, group.id)) notFound();

  const profile = await loadProfile(supabase, group.id);
  const profileHref = `/groups/${encodeURIComponent(group.name)}`;

  return (
    <>
      <AppHeader back={profileHref} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header>
          <h1 className="gg-display text-[26px] leading-tight">프로필 편집</h1>
        </header>
        <ProfileForm
          save={saveGroupProfile.bind(null, group.id)}
          doneHref={profileHref}
          initial={{
            verse: profile.blocks.verse ?? "",
            intro: profile.blocks.intro ?? "",
            freeText: profile.blocks.freeText ?? "",
            ddays: profile.blocks.ddays,
            themeSongs: profile.blocks.themeSongs,
          }}
          expectedUpdatedAt={profile.updatedAt}
          today={kstToday()}
        />
      </main>
    </>
  );
}
