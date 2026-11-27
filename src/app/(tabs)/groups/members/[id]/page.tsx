import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ICON, Icon } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { requireAppUser } from "@/lib/auth/session";
import { groupLabel, memberRoleLabel } from "@/lib/labels";
import { canChooseRole, canEditGroup, formOf, type RosterPersonEditRow } from "@/lib/roster-edit";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { MemberForm } from "../member-form";
import { type MoveItem } from "../move-inbox";
import { MoveRequest } from "../move-request";
import { PersonActions } from "../person-actions";

export const metadata: Metadata = {
  title: "명단 고치기 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 명단 한 사람 고치기(2026-10-28) — 명단 엑셀의 칸 전부: 이름 · 구분 · 훈련단계 · 출생년도 · 성별 · 직업 · 소속 · 회원 둘 · 섬김 부서 · 비고.
 * 자기 목장 리더 · 목사님 · 운영자(그 외 404 — 운영자 겸 리더도 persons 를 전부 읽으므로 화면이 한 번 더 거른다).
 * 목장 옮기기 · 상태 · 판정 태그 · 계정은 운영자 화면(/admin/people/[id]) 몫이다.
 * 목장 이동 신청(2026-11-26) — 이 목장 리더가 본인 포함 누구든 다른 목장으로 신청한다(받는 목장 리더 · 목사님이 수락).
 */
export default async function MemberEditPage({ params }: PageProps<"/groups/members/[id]">) {
  const me = await requireAppUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [personRes, ministryRes, serveRes] = await Promise.all([
    supabase
      .from("persons")
      .select(
        "id, name, group_id, group_role, is_group_head, status, user_id, training_stage, birth_year, gender, occupation, affiliation, campus, attendance_off, youth_member, assembly_member, note, updated_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ministries").select("id, name").eq("active", true).order("sort"),
    supabase.from("person_ministries").select("ministry_id").eq("person_id", id),
  ]);
  const person = personRes.data as RosterPersonEditRow | null;
  if (!person || person.status === "left" || !canEditGroup(me, person.group_id)) notFound();
  // 목장 이동 신청(2026-11-26) — 이 목장 리더는 본인 포함 누구든 신청한다. 대기 중인 신청이 있으면 그 줄
  const canRequestMove = me.leadsGroup && me.groupId === person.group_id && (person.status === "active" || person.status === "dormant");
  const [{ data: group }, { data: extra }, { data: allGroups }, movesRes] = await Promise.all([
    supabase.from("groups").select("name").eq("id", person.group_id!).maybeSingle(),
    supabase.from("persons").select("care_status").eq("id", person.id).maybeSingle(),
    supabase.from("groups").select("id, name, number").eq("status", "active"),
    canRequestMove ? supabase.rpc("list_group_moves") : Promise.resolve({ data: [] }),
  ]);
  const pendingMove = (((movesRes.data ?? []) as (MoveItem & { person_id: string })[]).find((m) => m.person_id === person.id) ?? null) as MoveItem | null;

  const wide = me.role === "pastor" || me.role === "admin";
  // 목사님 · 운영자는 늘 그 목장 명단으로(운영자는 어느 목장에도 속하지 않는다, 2026-11-06)
  const listHref = wide ? `/groups/members?group=${person.group_id}` : "/groups/members";

  return (
    <>
      <AppHeader back={listHref} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-0.5">
          <h1 className="gg-display text-[26px] leading-tight">{person.name}</h1>
          <p className="text-sm text-muted">
            {groupLabel(group?.name)} · {memberRoleLabel(person.group_role, person.is_group_head)}
          </p>
          {me.role === "pastor" || (me.leadsGroup && me.groupId === person.group_id) ? (
            // 전체 명단에서 바로 여기로 온다(2026-10-29) — 이 사람의 기록은 한 번 더 눌러서
            <Link href={`/groups/people/${person.id}`} className="inline-flex w-fit items-center gap-1 pt-1.5 text-[13px] font-bold text-[var(--gg-sky-ink)]" data-testid="person-records">
              <Icon d={ICON.history} className="h-4 w-4" strokeWidth={2.2} />
              출석/기도제목 기록 보기
            </Link>
          ) : null}
        </header>
        <MemberForm
          mode="edit"
          initial={formOf(person, (serveRes.data ?? []).map((r) => r.ministry_id))}
          ministries={ministryRes.data ?? []}
          personId={person.id}
          canBeHead={person.status === "active"}
          groupId={person.group_id!}
          expectedUpdatedAt={person.updated_at}
          listHref={listHref}
          canChooseRole={canChooseRole(me)}
          canMarkLeft={person.group_role === "member"}
          thisYear={Number(kstToday().slice(0, 4))}
          beforeSave={
            <>
            <PersonActions
              personId={person.id}
              status={person.status}
              groupRole={person.group_role}
              careStatus={extra?.care_status ?? "active"}
              canMove={me.role === "pastor" || me.role === "admin"}
              linked={!!person.user_id}
              groupId={person.group_id!}
              groups={sortGroups(allGroups ?? [], me.leadsGroup ? me.groupId : null).map((g) => ({ id: g.id, name: g.name }))}
              listHref={listHref}
            />
            {/* 목장 이동 신청(2026-11-26) — 저장 단추 위에(저장은 늘 맨 아래) */}
            {canRequestMove ? (
              <MoveRequest
                personId={person.id}
                groupId={person.group_id!}
                groups={sortGroups(allGroups ?? [], me.groupId).map((g) => ({ id: g.id, name: g.name }))}
                pending={pendingMove}
              />
            ) : null}
            </>
          }
        />
      </main>
    </>
  );
}
