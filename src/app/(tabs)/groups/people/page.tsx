import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { PeopleRoster } from "@/components/people-roster";
import { GuguSays } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { requireReportAccess } from "@/lib/auth/session";
import { isPeopleFilter, type PeopleFilter, type PersonAdminRow } from "@/lib/people-admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type RosterRow = Database["public"]["Functions"]["roster_people"]["Returns"][number];

const FILTERS: PeopleFilter[] = ["all", "leaders"];

export const metadata: Metadata = {
  title: "출석/기도제목 기록 · 구구",
};

/**
 * 사람별 기록(2026-11-12 — 전체 메뉴에서 바로) — 사람을 누르면 곧바로 그 사람 기록 화면(/groups/people/[id]: 6개월 출석 · 기도제목 ·
 * '✨ 최근 흐름' AI 요약). 예전에는 전체 명단 → 명단 고치기 → '기록 보기' 로 네 번을 눌러야 했다.
 * 보는 범위는 사람 기록 화면과 같다 — 리더는 지금 자기 목장 사람만, 목사님은 전부. 떠난 사람은 뺀다.
 */
export default async function PeopleIndexPage({ searchParams }: PageProps<"/groups/people">) {
  const me = await requireReportAccess();
  const sp = await searchParams;
  const filter: PeopleFilter = isPeopleFilter(sp.filter) && FILTERS.includes(sp.filter) ? sp.filter : "all";

  const supabase = await createClient();
  const [peopleRes, groupsRes] = await Promise.all([supabase.rpc("roster_people"), supabase.from("groups").select("id, name, number").eq("status", "active")]);
  const rows = (peopleRes.data ?? []) as RosterRow[];
  const people: PersonAdminRow[] = rows
    .filter((p) => p.status !== "left" && (me.role === "pastor" || p.group_id === me.groupId))
    .map(({ has_account, ...p }) => ({ ...p, user_id: has_account ? "linked" : null, birth_year: null }));
  const groups = sortGroups((groupsRes.data ?? []).filter((g) => me.role === "pastor" || g.id === me.groupId), me.leadsGroup ? me.groupId : null);

  return (
    <>
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8" data-testid="people-index">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">출석/기도제목 기록</h1>
        </header>
        {peopleRes.error ? (
          <GuguSays mood="sleepy" size={72} lines={["명단을 불러오지 못했어요.", "잠시 뒤 다시 열어 주세요."]} />
        ) : (
          <PeopleRoster
            people={people}
            groups={groups}
            filter={filter}
            filterHref={(f) => (f === "all" ? "/groups/people" : `/groups/people?filter=${f}`)}
            hrefFor={(p) => `/groups/people/${p.id}`}
            filters={FILTERS}
            brief
          />
        )}
      </main>
    </>
  );
}
