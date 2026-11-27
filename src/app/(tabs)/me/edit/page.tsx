import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "프로필 편집 · 구구",
};

/** 소개 · 좋아하는 말씀 · 관심사 쓰기(2026-11-11) — 내 정보 '프로필 편집' 목록에서 온다 */
export default async function ProfileEditPage() {
  await requireAppUser();
  const { data } = await (await createClient()).from("user_profiles").select("bio, verse, interests").maybeSingle();
  return (
    <>
      <AppHeader back="/me" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">프로필 편집</h1>
        <ProfileForm bio={data?.bio ?? ""} verse={data?.verse ?? ""} interests={data?.interests ?? []} />
      </main>
    </>
  );
}
