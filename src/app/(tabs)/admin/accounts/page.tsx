import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { BTN, CARD } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { AUTH_PROVIDER_LABELS, groupLabel } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { updateAccount } from "./actions";

export const metadata: Metadata = {
  title: "계정 권한 · 구구",
};

type User = Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "name" | "email" | "role" | "is_officer" | "status" | "provider">;
type Action = "pastor_off" | "officer_on" | "officer_off" | "lock" | "unlock";

const DONE: Record<Action, string> = {
  pastor_off: "목사님 권한을 거뒀습니다.",
  officer_on: "임원진을 맡겼습니다.",
  officer_off: "임원진 권한을 거뒀습니다.",
  lock: "계정을 잠갔습니다.",
  unlock: "잠금을 풀었습니다.",
};

/**
 * 계정 권한(2026-11-05) — 운영자 전용. 승인 뒤에 권한을 고칠 곳이 없었다(목사님 승인을 잘못 해도 되돌릴 수 없고,
 * 나중에 임원진이 된 리더에게 권한을 줄 수 없었다).
 *   목사님   권한 거두기(신청 전 상태로) · 잠그기
 *   임원진   임원진 그만두기
 *   리더     임원진 맡기기 · 잠그기 — 명단 연결 해제는 명단 관리(사람 화면)에서
 *   잠긴 계정 잠금 풀기
 * 운영자 계정은 여기 나오지 않는다(DB 도 막는다). 단추는 바로 처리된다 — 모두 되돌릴 수 있는 일이다.
 *
 * 로그인이 붙은 행만 계정이다(2026-11-12). 로그인 초기화가 남긴 옛 행(auth_user_id 없음)은 지난 보고서의 작성자 기록일 뿐이라
 * 보이지 않는다 — 다시 로그인한 사람이 '잠긴 계정'에 한 번 더 나오던 것. DB 도 그 행은 고치지 않는다.
 */
export default async function AccountsPage({ searchParams }: PageProps<"/admin/accounts">) {
  await requireRole("admin");
  const params = await searchParams;
  const done = typeof params.done === "string" && params.done in DONE ? DONE[params.done as Action] : null;
  const error = typeof params.error === "string";

  const supabase = await createClient();
  const [usersRes, personsRes] = await Promise.all([
    supabase.from("users").select("id, name, email, role, is_officer, status, provider").neq("role", "admin").not("auth_user_id", "is", null).order("name"),
    supabase.from("persons").select("user_id, name, groups(name)").not("user_id", "is", null),
  ]);
  const users = (usersRes.data ?? []) as User[];
  const personOf = new Map(
    (personsRes.data ?? []).map((p) => [p.user_id ?? "", { name: p.name, group: (p.groups as unknown as { name: string } | null)?.name ?? null }]),
  );

  const active = users.filter((u) => u.status === "active");
  const sections: { title: string; rows: User[]; actions: (u: User) => [Action, string][] }[] = [
    { title: "목사님", rows: active.filter((u) => u.role === "pastor"), actions: () => [["pastor_off", "권한 거두기"], ["lock", "잠그기"]] },
    { title: "임원진", rows: active.filter((u) => u.role === "officer" || (u.role === "leader" && u.is_officer)), actions: () => [["officer_off", "임원진 그만두기"], ["lock", "잠그기"]] },
    { title: "리더", rows: active.filter((u) => u.role === "leader" && !u.is_officer), actions: () => [["officer_on", "임원진 맡기기"], ["lock", "잠그기"]] },
    { title: "잠긴 계정", rows: users.filter((u) => u.status === "inactive"), actions: () => [["unlock", "잠금 풀기"]] },
  ];

  return (
    <>
      <AppHeader back="/admin" />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">계정 권한</h1>
        {done ? <p className="rounded-2xl bg-[var(--gg-leaf-soft)] px-3.5 py-3 text-sm font-semibold text-[var(--gg-leaf-ink)]">{done}</p> : null}
        {error ? (
          <p role="alert" className="rounded-2xl bg-[var(--gg-berry-soft)] px-3.5 py-3 text-sm font-semibold text-[var(--gg-berry-ink)]">
            처리하지 못했습니다. 화면을 새로 고친 뒤 다시 해 주세요.
          </p>
        ) : null}

        {sections
          .filter((s) => s.rows.length > 0)
          .map((s) => (
            <section key={s.title} className={`${CARD} space-y-1 px-4 pt-3.5 pb-1.5`} aria-label={s.title}>
              <h2 className="gg-display text-[17px]">
                {s.title} <span className="text-[14px] text-muted tabular-nums">{s.rows.length}</span>
              </h2>
              <ul className="divide-y divide-[var(--gg-line)]">
                {s.rows.map((u) => {
                  const person = personOf.get(u.id);
                  const sub = [person?.group ? groupLabel(person.group) : null, u.email ?? (u.provider ? AUTH_PROVIDER_LABELS[u.provider] : null)]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={u.id} className="space-y-2 py-3" data-testid="account-row">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold">{person?.name ?? u.name}</p>
                        {sub ? <p className="text-xs break-all text-muted">{sub}</p> : null}
                      </div>
                      <form action={updateAccount} className="flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        {s.actions(u).map(([action, label]) => (
                          <button key={action} type="submit" name="action" value={action} className={`${BTN("white", "sm")} !h-9 !px-3 !text-[13px]`}>
                            {label}
                          </button>
                        ))}
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </main>
    </>
  );
}
