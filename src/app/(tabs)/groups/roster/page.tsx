import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { PeopleRoster } from "@/components/people-roster";
import { BTN, GuguSays, ICON, Icon } from "@/components/ui";
import { RosterExport } from "@/components/roster-export";
import { sortGroups, sortGroupsByVillage } from "@/lib/group-order";
import { requireAppUser } from "@/lib/auth/session";
import { isPeopleFilter, type PeopleFilter, type PersonAdminRow } from "@/lib/people-admin";
import { canEditGroup } from "@/lib/roster-edit";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type RosterRow = Database["public"]["Functions"]["roster_people"]["Returns"][number];

/** 전체 명단의 필터 — 계정 연결 · 활동 외·태그는 운영자 명단에만(2026-10-29) */
const ROSTER_FILTERS: PeopleFilter[] = ["all", "leaders"];

export const metadata: Metadata = {
  title: "전체 명단 · 구구",
};

/**
 * 전체 명단(2026-10-14) — 운영자 명단(A-1)과 같은 꼴을 리더 · 목사님도 본다. 필터는 전체 · 리더, 표시는 목장장만
 * (2026-10-29). persons 는 RLS 로 리더에게 자기 목장만 보이므로 roster_people() 로 읽는다(연락처 · 생년 · 기록 없음).
 * 사람을 누르면: 운영자는 운영자 화면, 고칠 수 있는 사람(목사님 — 전부, 리더 — 우리 목장)은 명단 고치기, 그 밖엔 기록(목사님) · 없음.
 */
export default async function RosterPage({ searchParams }: PageProps<"/groups/roster">) {
  const me = await requireAppUser();
  const sp = await searchParams;
  // '확인 필요' 필터 · 표시는 뺐다(2026-11-11 사용자 요청)
  const filters = ROSTER_FILTERS;
  const filter: PeopleFilter = isPeopleFilter(sp.filter) && filters.includes(sp.filter) ? sp.filter : "all";

  const supabase = await createClient();
  const [peopleRes, groupsRes] = await Promise.all([
    supabase.rpc("roster_people"),
    supabase.from("groups").select("id, name, number, village").eq("status", "active"),
  ]);
  // 함수가 주는 '계정 있음' 을 목록 조각이 보는 user_id 자리에 — 계정 id 자체는 받지 않는다
  const rows = (peopleRes.data ?? []) as RosterRow[];
  const people: PersonAdminRow[] = rows.map(({ has_account, ...p }) => ({ ...p, user_id: has_account ? "linked" : null, birth_year: null }));

  // 고칠 수 있는 사람은 바로 고치는 화면으로(2026-10-29) — 기록은 그 화면의 '기록 보기'로. 떠난 사람은 기록만
  const wide = me.role === "pastor" || me.role === "admin";
  // 전체 명단 엑셀 — 목사님 · 운영자 · 임원진(2026-10-30). 목장 하나는 목사님 · 운영자(고르기) · 리더(우리 목장)
  const canAll = wide || me.isOfficer;
  // 전체 명단은 마을별로 묶고 마을 안에서 가나다, 내 목장 맨 위(2026-11-17). 엑셀 고르기 목록은 가나다
  const own = me.leadsGroup ? me.groupId : null;
  const ordered = sortGroupsByVillage(groupsRes.data ?? [], own);
  const groupList = sortGroups(groupsRes.data ?? []).map((g) => ({ id: g.id, name: g.name }));

  const hrefFor = (p: PersonAdminRow): string | null => {
    if (me.role === "admin") return `/admin/people/${p.id}`;
    if (p.status !== "left" && canEditGroup(me, p.group_id)) return `/groups/members/${p.id}`;
    if (me.role === "pastor" || (me.leadsGroup && p.group_id === me.groupId)) return `/groups/people/${p.id}`;
    return null;
  };

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">전체 명단</h1>
        </header>

        {/* 명단 엑셀(2026-10-28) — 교회가 쓰던 명단 엑셀과 같은 모양, 받을 때마다 로그. 내보내기 화면에서 여기로 옮겼다(2026-10-29).
            목사님 · 운영자는 전체 + 고른 목장, 리더는 우리 목장 */}
        {canAll || me.leadsGroup ? (
          <RosterExport
            canAll={canAll}
            // 목사님 · 운영자는 목장이 없다 — 늘 전체 + 목장 고르기(2026-11-06). 리더만 우리 목장
            ownGroup={!wide && me.leadsGroup ? me.groupId : null}
            groups={wide ? groupList : me.leadsGroup ? groupList.filter((g) => g.id === me.groupId) : []}
          />
        ) : null}
        {wide || me.leadsGroup ? (
          <Link href="/groups/members" className={`${BTN("white")} w-full`}>
            <Icon d={ICON.write} className="h-4 w-4" strokeWidth={2.4} />
            {wide ? "명단 고치기" : "우리 목장 명단 고치기"}
          </Link>
        ) : null}

        {peopleRes.error ? (
          <GuguSays mood="sleepy" size={72} lines={["명단을 불러오지 못했어요.", "잠시 뒤 다시 열어 주세요."]} />
        ) : (
          <PeopleRoster
            people={people}
            groups={ordered}
            filter={filter}
            filterHref={(f) => (f === "all" ? "/groups/roster" : `/groups/roster?filter=${f}`)}
            hrefFor={hrefFor}
            filters={filters}
            brief
          />
        )}
      </main>
    </>
  );
}
