import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { GuguSays } from "@/components/ui";
import { buildCampus, type BookGroupIn, type BookPersonIn, type CampusGroup } from "@/lib/attendance-book";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "캠퍼스 모임 · 구구",
};

/**
 * 캠퍼스 모임 명단(2026-11-16) — 앱을 쓰는 사람 모두(2026-11-26 사용자 결정, 예전엔 운영자 · 목사님 · 임원진). attendance_people 도 앱 사용자 모두가 부른다. 캠퍼스별로 사람과 목장을 보인다.
 * 캠퍼스는 명단 고치기의 '캠퍼스' 칸에 적는다(persons.campus). 구조만 먼저 — 명단은 나중에 채운다(사용자).
 */
export default async function CampusPage() {
  const me = await requireAppUser();
  const supabase = await createClient();
  const [people, groups] = await Promise.all([supabase.rpc("attendance_people"), supabase.from("groups").select("id, name, number").eq("status", "active")]);
  const failed = !!people.error || !!groups.error;
  const list: CampusGroup[] = failed ? [] : buildCampus((people.data ?? []) as BookPersonIn[], (groups.data ?? []) as BookGroupIn[]);
  const total = list.reduce((s, c) => s + c.people.length, 0);

  return (
    <>
      <AppHeader back={me.role === "admin" ? "/admin" : "/all"} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="flex items-baseline justify-between">
          <h1 className="gg-display text-[26px] leading-tight">캠퍼스 모임</h1>
          {total > 0 ? <span className="text-[14px] font-semibold text-muted tabular-nums">{total}명</span> : null}
        </header>
        {failed ? (
          <GuguSays mood="sleepy" size={72} lines={["명단을 불러오지 못했어요.", "잠시 뒤 다시 열어 주세요."]} />
        ) : list.length === 0 ? (
          <GuguSays size={72} lines={["아직 캠퍼스 모임 명단이 없어요.", "명단 고치기에서 캠퍼스를 적어 주세요."]} />
        ) : (
          list.map((c) => (
            <section key={c.campus} className="rounded-3xl bg-[var(--gg-card)] px-5 py-4" data-testid="campus">
              <h2 className="flex items-baseline justify-between text-[17px] font-extrabold">
                {c.campus}
                <span className="text-[13.5px] font-semibold text-muted tabular-nums">{c.people.length}명</span>
              </h2>
              <ul className="mt-2 divide-y divide-[var(--gg-line)]">
                {c.people.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-[15.5px]">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[14px] text-muted">{p.group}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
