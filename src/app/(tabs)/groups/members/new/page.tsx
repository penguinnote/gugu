import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { requireAppUser } from "@/lib/auth/session";
import { canAddTo, canChooseRole, emptyForm } from "@/lib/roster-edit";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { MemberForm } from "../member-form";

export const metadata: Metadata = {
  title: "새가족 추가 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 목장 명단에 인원 추가(2026-10-28) — 자기 목장 리더 · 목사님(어느 목장이든, 2026-10-29)은 양으로만, 운영자는 리더 · 양 모두(DB persons_insert 와 같은 규칙).
 * 들어온 날은 오늘 — 4주 동안 '신규' 로 보이고, 다음 보고서부터 작성 명단에 나온다.
 */
export default async function MemberNewPage({ searchParams }: PageProps<"/groups/members/new">) {
  const me = await requireAppUser();
  const sp = await searchParams;
  const groupId = typeof sp.group === "string" && UUID.test(sp.group) ? sp.group : me.leadsGroup ? me.groupId : null;
  if (!groupId || !canAddTo(me, groupId)) notFound();

  const supabase = await createClient();
  const [groupRes, ministryRes] = await Promise.all([
    supabase.from("groups").select("name").eq("id", groupId).eq("status", "active").maybeSingle(),
    supabase.from("ministries").select("id, name").eq("active", true).order("sort"),
  ]);
  if (!groupRes.data) notFound();
  // 보고서 화면에서 왔으면(2026-11-05) 넣고 나서 그 보고서로 돌아간다 — 그 주 명단에 새 사람이 들어 있다(아직 안 낸 주)
  const back = typeof sp.back === "string" && /^\/reports\/\d{4}-\d{2}-\d{2}$/.test(sp.back) ? sp.back : null;
  const listHref =
    back ?? (me.role === "admin" || me.role === "pastor" ? `/groups/members?group=${groupId}` : "/groups/members");

  return (
    <>
      <AppHeader back={listHref} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          {/* 보고서 화면의 '새가족 추가' 와 이름을 맞췄다(2026-11-26 사용자 — 예전 '인원 추가') */}
          <h1 className="gg-display text-[26px] leading-tight">새가족 추가</h1>
        </header>
        <MemberForm
          mode="new"
          initial={emptyForm()}
          ministries={ministryRes.data ?? []}
          groupId={groupId}
          listHref={listHref}
          canChooseRole={canChooseRole(me)}
          canMarkLeft={false}
          joinedWeek={back ? back.slice("/reports/".length) : undefined}
          thisYear={Number(kstToday().slice(0, 4))}
        />
      </main>
    </>
  );
}
