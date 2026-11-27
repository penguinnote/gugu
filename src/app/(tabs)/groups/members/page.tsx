import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BTN, CARD, Chevron, Icon } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { requireAppUser } from "@/lib/auth/session";
import { groupLabel } from "@/lib/labels";
import { canAddTo, canEditGroup } from "@/lib/roster-edit";
import { createClient } from "@/lib/supabase/server";

import { MemberList, type MemberRow } from "./member-list";
import { MoveInbox, type MoveItem } from "./move-inbox";
import { UndoLeft } from "./undo-left";
import { VillagePicker } from "./village-picker";

export const metadata: Metadata = {
  title: "목장 명단 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 마을 — 지금 쓰는 이름(다른 목장에 이미 있는 마을과 함께 고르기 칸에 띄운다) */
const VILLAGES = ["믿음", "소망", "사랑", "은혜"];


/**
 * 목장 명단(2026-10-28) — 교회 명단 엑셀의 우리 목장 줄을 앱에서 고친다. 리더는 자기 목장, 목사님 · 운영자는 ?group= 으로 어느 목장이든.
 * 사람마다 한 줄(구분 · 훈련단계 · 직업 · 소속 · 섬김) · 새가족 추가(2026-11-26 '인원 추가' 에서 이름을 보고서 화면과 맞춤) · 맨 밑에 마을(목장에 붙는다). 사람을 누르면 모든 칸을 고친다.
 * 고친 것은 전체 명단 · 명단 엑셀(목사님 · 운영자가 내보낸다)에 바로 나온다.
 */
export default async function MembersPage({ searchParams }: PageProps<"/groups/members">) {
  const me = await requireAppUser();
  const sp = await searchParams;
  const asked = typeof sp.group === "string" && UUID.test(sp.group) ? sp.group : null;
  const wide = me.role === "pastor" || me.role === "admin";
  // 목사님 · 운영자는 늘 목장 고르기(전체 목장)부터(2026-11-06 사용자 요청) — 운영자는 어느 목장에도 속하지 않는다고 본다.
  // 리더는 우리 목장
  const groupId = wide ? asked : me.leadsGroup ? me.groupId : null;

  const supabase = await createClient();
  const [{ data: groupRows }, { data: moveRows }] = await Promise.all([
    supabase.from("groups").select("id, name, number, village").eq("status", "active"),
    // 목장 이동 대기 신청(2026-11-26) — 리더는 우리 목장이 걸린 것, 목사님 · 운영자는 모두
    supabase.rpc("list_group_moves"),
  ]);
  const moves = (moveRows ?? []) as (MoveItem & { from_group_id: string; to_group_id: string })[];
  // 가나다 순, 내 목장 맨 위(2026-11-17)
  const groups = sortGroups(groupRows ?? [], me.leadsGroup ? me.groupId : null);

  // 목사님 · 운영자가 목장을 고르지 않았으면 — 목장 고르기
  if (!groupId) {
    if (!wide) notFound();
    return (
      <>
        <AppHeader back="/all" />
        <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <h1 className="gg-display text-[26px] leading-tight">명단 고치기</h1>
          <MoveInbox items={moves} />
          <ul className={`${CARD} divide-y divide-[var(--gg-line)] overflow-hidden`}>
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/members?group=${g.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <span className="gg-display text-[17px]">{groupLabel(g.name)}</span>
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    {g.village ? `${g.village} 마을` : null}
                    <Chevron className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </>
    );
  }

  const group = groups.find((g) => g.id === groupId);
  if (!group || !canEditGroup(me, groupId)) notFound();

  const [peopleRes, ministryRes] = await Promise.all([
    supabase
      .from("persons")
      .select("id, name, group_role, is_group_head, training_stage, birth_year, gender, occupation, affiliation, youth_member, assembly_member, status")
      .eq("group_id", groupId)
      .neq("status", "left"),
    supabase.from("ministries").select("id, name, sort").eq("active", true).order("sort"),
  ]);
  const rank = (p: MemberRow) => (p.group_role === "leader" ? (p.is_group_head ? 0 : 1) : 2);
  const people = ((peopleRes.data ?? []) as MemberRow[]).sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const ids = people.map((p) => p.id);
  const { data: serveRows } = ids.length
    ? await supabase.from("person_ministries").select("person_id, ministry_id").in("person_id", ids)
    : { data: [] as { person_id: string; ministry_id: string }[] };
  const ministryName = new Map((ministryRes.data ?? []).map((m) => [m.id, m.name]));
  const ministrySort = new Map((ministryRes.data ?? []).map((m) => [m.id, m.sort]));
  const serves = new Map<string, string[]>();
  for (const r of [...(serveRows ?? [])].sort((a, b) => (ministrySort.get(a.ministry_id) ?? 0) - (ministrySort.get(b.ministry_id) ?? 0))) {
    const name = ministryName.get(r.ministry_id);
    if (name) serves.set(r.person_id, [...(serves.get(r.person_id) ?? []), name]);
  }

  const villages = [...new Set([...VILLAGES, ...groups.map((g) => g.village).filter((v): v is string => !!v)])];
  const q = wide ? `?group=${groupId}` : "";
  const leaders = people.filter((p) => p.group_role === "leader").length;

  return (
    <>
      <AppHeader back={wide ? "/groups/members" : "/all"} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="gg-display text-[26px] leading-tight">{groupLabel(group.name)} 명단</h1>
            {wide ? (
              <Link href="/groups/members" className="gg-pill shrink-0 bg-[var(--gg-btn2)] text-muted" data-testid="pick-group">
                다른 목장
              </Link>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-muted">
            리더 {leaders} · 양 {people.length - leaders}
          </p>
        </header>

        <MoveInbox items={wide ? moves.filter((m) => m.from_group_id === groupId || m.to_group_id === groupId) : moves} />

        <UndoLeft />

        <MemberList people={people} serves={serves} />

        {canAddTo(me, groupId) ? (
          <Link href={`/groups/members/new${q || `?group=${groupId}`}`} className={`${BTN("white")} w-full`} data-testid="member-add">
            <Icon d="M12 5v14M5 12h14" className="h-4 w-4" strokeWidth={2.6} />새가족 추가
          </Link>
        ) : null}

        {/* 마을은 거의 바뀌지 않는다 — 맨 밑에(2026-10-28) */}
        <VillagePicker groupId={groupId} value={group.village ?? ""} options={villages} />
      </main>
    </>
  );
}
