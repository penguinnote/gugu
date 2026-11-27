import "server-only";

import Link from "next/link";

import { ICON, Icon } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { AUTH_PROVIDER_LABELS, memberRoleLabel, USER_ROLE_LABELS, groupLabel } from "@/lib/labels";
import type { GroupRef, PersonAdminRow } from "@/lib/people-admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { AiConsent } from "./ai-consent";
import { OfficerToggle } from "./officer-toggle";
import { PersonAdminForm, type LinkedAccount } from "./person-admin-form";

// 서버 클라이언트가 Database 제네릭 없이 만들어져 쿼리 결과가 any 다. 여기서는 생성된 Row 타입으로 고정한다.
type UserRow = Pick<Database["public"]["Tables"]["users"]["Row"], "name" | "provider" | "role" | "is_officer">;
type PersonRow = PersonAdminRow & { updated_at: string; ai_consented_at: string | null };
export type PersonAdminData = { person: PersonRow; groups: GroupRef[]; groupName: string | undefined; linked: LinkedAccount; officer: boolean };

/**
 * 운영자 사람 한 명(2026-11-27 상세 화면에서 떼어 냈다) — 상세(/admin/people/[id])와 넓은 화면 명단의 오른쪽 편집 칸(?p=)이 같이 쓴다.
 * 이동 · 역할 · 목장장 · 상태 · 판정 태그 · 계정 연결 · 임원진 · AI 동의. 출석 · 기도제목은 여기 없다 — 운영자는 본문을 못 본다(04 §4).
 */
export async function loadPersonAdmin(id: string): Promise<PersonAdminData | null> {
  const supabase = await createClient();
  const [personRes, groupsRes] = await Promise.all([
    supabase
      .from("persons")
      .select("id, name, group_id, group_role, is_group_head, status, care_status, needs_check, user_id, birth_year, updated_at, ai_consented_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("groups").select("id, name, number").eq("status", "active"),
  ]);
  const person: PersonRow | null = personRes.data;
  if (!person) return null;

  let linked: LinkedAccount = null;
  let officer = false;
  if (person.user_id) {
    const { data } = await supabase.from("users").select("name, provider, role, is_officer").eq("id", person.user_id).maybeSingle();
    const u: UserRow | null = data;
    officer = u?.is_officer === true;
    if (u) linked = { name: u.name, providerLabel: u.provider ? AUTH_PROVIDER_LABELS[u.provider] : null, roleLabel: USER_ROLE_LABELS[u.role] };
  }
  const groups = sortGroups(groupsRes.data ?? []);
  return { person, groups, groupName: groups.find((g) => g.id === person.group_id)?.name, linked, officer };
}

/** 머리(이름 · 목장 · 구분) · 등록 직후 알림 · 명단 정보 고치기 · 저장 폼 · 임원진 · AI 동의 — 부르는 쪽의 세로 칸(gap) 안에 그대로 놓인다 */
export function PersonAdminBody({ data, created = false, wide = false }: { data: PersonAdminData; created?: boolean; /** 넓은 화면 오른쪽 편집 칸 — 작은 머리 · 임원진 설명 한 줄 */ wide?: boolean }) {
  const { person, groups, groupName, linked, officer } = data;
  const row: PersonAdminRow = person;
  return (
    <>
      <header className="flex items-center gap-3.5">
        <span
          aria-hidden
          className={`gg-display grid shrink-0 place-items-center rounded-full bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)] ${wide ? "size-11 text-[19px]" : "size-14 text-[24px]"}`}
        >
          {person.name.slice(0, 1)}
        </span>
        <div className="min-w-0 space-y-0.5">
          <h1 className={`gg-display leading-tight ${wide ? "text-[22px]" : "text-[26px]"}`}>
            {person.name}
            {person.birth_year ? <span className="ml-2 font-[family-name:var(--font-sans)] text-sm text-muted">{person.birth_year}</span> : null}
          </h1>
          <p className="text-sm text-muted">
            {groupLabel(groupName)} · {memberRoleLabel(person.group_role, person.is_group_head)}
          </p>
        </div>
      </header>
      {created ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl bg-[var(--gg-leaf-soft)] px-3.5 py-3 text-sm leading-relaxed font-semibold text-[var(--gg-leaf-ink)]"
          data-testid="created"
        >
          <Icon d={ICON.check} className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.6} />
          <span>등록했습니다. 다음 목장보고서부터 {groupLabel(groupName)} 작성 명단에 나타납니다.</span>
        </p>
      ) : null}
      {person.status !== "left" ? (
        <Link href={`/groups/members/${person.id}`} className="inline-flex w-fit items-center gap-1 px-1 text-[13px] font-bold text-[var(--gg-sky-ink)]" data-testid="edit-roster">
          <Icon d={ICON.write} className="h-4 w-4" strokeWidth={2.2} />
          명단 정보 고치기 — 훈련단계 · 직업 · 소속 · 섬김 부서 · 비고
        </Link>
      ) : null}
      {/* 넓은 화면 편집 칸은 저장 단추가 맨 아래에 오게 임원진 · AI 동의를 폼 위로(휴대폰 상세는 예전 차례 그대로) */}
      {wide && person.status !== "left" ? <OfficerToggle key={`o-${person.id}`} personId={person.id} linked={person.user_id !== null} initial={officer} hint="전체 명단 엑셀을 받아요" /> : null}
      {wide && person.status !== "left" ? <AiConsent key={`a-${person.id}`} personId={person.id} initial={person.ai_consented_at} /> : null}
      <PersonAdminForm key={person.id} person={row} groups={groups} expectedUpdatedAt={person.updated_at} linked={linked} />
      {!wide && person.status !== "left" ? <OfficerToggle personId={person.id} linked={person.user_id !== null} initial={officer} /> : null}
      {!wide && person.status !== "left" ? <AiConsent personId={person.id} initial={person.ai_consented_at} /> : null}
    </>
  );
}
