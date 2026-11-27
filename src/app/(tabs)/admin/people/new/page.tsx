import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { sortGroups } from "@/lib/group-order";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

import { NewPersonForm } from "./new-person-form";

export const metadata: Metadata = {
  title: "새 사람 등록 · 구구",
};

/** Step 11 새 사람 등록 — 운영자 전용(그 외 404). 이동·역할·상태는 명단 상세(9b)에서. 구구 테마. */
export default async function NewPersonPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("id, name, number").eq("status", "active");
  const groups = sortGroups((data ?? []) as { id: string; name: string }[]).map((g) => ({ id: g.id, name: g.name }));

  return (
    <>
      <AppHeader back="/admin/people" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <header className="space-y-1.5">
          <h1 className="gg-display text-[26px] leading-tight">새 사람 등록</h1>
        </header>
        <NewPersonForm groups={groups} thisYear={Number(kstToday().slice(0, 4))} />
      </main>
    </>
  );
}
