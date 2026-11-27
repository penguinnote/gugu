import "server-only";

import type { createClient } from "@/lib/supabase/server";

import { buildRosterModel, type RosterGroupRow, type RosterModel, type RosterPersonRow } from "./roster-model";

/**
 * 명단 엑셀 데이터 읽기(2026-10-28) — 받는 사람 세션으로, RLS 를 그대로 탄다. 전체 명단은 목사님 · 운영자(persons 전부),
 * 목장 명단(groupId)은 그 목장만 — 리더도 자기 목장 사람은 다 읽는다. 서버 키는 쓰지 않는다. 사람은 몇백 명이라 PostgREST 한 번 상한(1000행) 안이다.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadRosterModel(supabase: Client, asOf: string, groupId?: string): Promise<RosterModel> {
  let groupQuery = supabase.from("groups").select("id, name, number, village").eq("status", "active");
  let peopleQuery = supabase
    .from("persons")
    .select(
      "id, name, group_id, group_role, is_group_head, status, training_stage, birth_year, gender, occupation, affiliation, youth_member, assembly_member, note",
    )
    .neq("status", "left");
  if (groupId) {
    groupQuery = groupQuery.eq("id", groupId);
    peopleQuery = peopleQuery.eq("group_id", groupId);
  }
  const [groups, people, ministries, memberships] = await Promise.all([
    groupQuery,
    peopleQuery,
    supabase.from("ministries").select("id, name, sort").eq("active", true).order("sort"),
    supabase.from("person_ministries").select("person_id, ministry_id"),
  ]);
  for (const r of [groups, people, ministries, memberships]) if (r.error) throw new Error(r.error.message);
  return buildRosterModel({
    groups: (groups.data ?? []) as RosterGroupRow[],
    people: (people.data ?? []) as RosterPersonRow[],
    ministries: ministries.data ?? [],
    memberships: memberships.data ?? [],
    asOf,
    scope: groupId ? (groups.data?.[0]?.name ?? null) : null,
  });
}
