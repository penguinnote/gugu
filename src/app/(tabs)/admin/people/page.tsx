import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { PeopleRoster } from "@/components/people-roster";
import { BTN } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { requireRole } from "@/lib/auth/session";
import { isPeopleFilter, type PeopleFilter } from "@/lib/people-admin";
import { createClient } from "@/lib/supabase/server";

import { loadPersonAdmin, PersonAdminBody } from "./[id]/person-body";
import { PeopleWide, type WidePerson } from "./people-wide";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "명단 · 구구",
};

/**
 * A-1 명단 — 운영자 전용. 목장별로 전원, 한 줄에 이름·역할과 눈에 띄어야 할 표시만(목장장 · 활동 외 상태 · 태그 ·
 * 계정). 필터는 쿼리 하나(?filter=leaders …). '확인 필요' 는 뺐다(2026-11-11). 사람을 누르면 상세.
 * 구구 테마: 목장 하나가 카드 하나, 표시는 작은 알약, 필터는 고른 것만 하늘색으로 찬 알약. 목록은 리더 · 목사님의 전체 명단과 같은 조각(components/people-roster.tsx).
 */
export default async function PeopleAdminPage({ searchParams }: PageProps<"/admin/people">) {
  await requireRole("admin");
  const sp = await searchParams;
  const filter: PeopleFilter = isPeopleFilter(sp.filter) ? sp.filter : "all";

  const supabase = await createClient();
  const [peopleRes, groupsRes, officerRes] = await Promise.all([
    // 넓은 화면 표(2026-11-27)는 명단 칸 셋(훈련 단계 · 성별 · 캠퍼스)을 더 보인다 — 같은 한 번의 읽기에 칸만 더했다
    supabase.from("persons").select("id, name, group_id, group_role, is_group_head, status, care_status, needs_check, user_id, birth_year, training_stage, gender, campus"),
    supabase.from("groups").select("id, name, number").eq("status", "active"),
    // 임원진 표시(2026-11-26) — 연결된 계정이 임원진인 사람
    supabase.from("users").select("id").eq("is_officer", true),
  ]);
  const officers = new Set(((officerRes.data ?? []) as { id: string }[]).map((u) => u.id));
  const people: WidePerson[] = ((peopleRes.data ?? []) as WidePerson[]).map((p) => ({ ...p, is_officer: p.user_id ? officers.has(p.user_id) : false }));
  const groups = sortGroups(groupsRes.data ?? []);
  // 넓은 화면 오른쪽 편집 칸 — 고른 사람(?p=)이 있으면 사람 화면과 같은 것을 불러 그린다. 휴대폰 목록은 ?p= 를 만들지 않는다
  const pickedId = typeof sp.p === "string" && UUID.test(sp.p) ? sp.p : null;
  const picked = pickedId ? await loadPersonAdmin(pickedId) : null;

  return (
    <>
      <AppHeader back="/admin" wide />
      {/* 1024px 이상은 넓은 표(./people-wide) — 같은 데이터. 휴대폰 목록은 lg:hidden */}
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:max-w-[1200px] lg:px-8">
        <div className="hidden lg:block">
          <PeopleWide people={people} groups={groups} selectedId={picked ? pickedId : null} panel={picked ? <PersonAdminBody data={picked} wide /> : null} />
        </div>
        <header className="space-y-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <h1 className="gg-display text-[26px] leading-tight">명단</h1>
            <div className="flex shrink-0 gap-2">
              <Link href="/admin/people/ai-consent" className={BTN("white", "sm")} data-testid="ai-consent-link">
                AI 동의
              </Link>
              <Link href="/admin/people/new" className={BTN("leaf", "sm")}>
                새 사람 등록
              </Link>
            </div>
          </div>
        </header>

        <div className="contents lg:hidden">
        <PeopleRoster
          people={people}
          groups={groups}
          filter={filter}
          filterHref={(f) => (f === "all" ? "/admin/people" : `/admin/people?filter=${f}`)}
          hrefFor={(p) => `/admin/people/${p.id}`}
        />
        </div>
      </main>
    </>
  );
}
