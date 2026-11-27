import type { Database } from "@/lib/supabase/database.types";
import { sortGroupsByVillage } from "@/lib/group-order";

type Enums = Database["public"]["Enums"];

/**
 * 명단 엑셀(2026-10-28) — 교회가 쓰던 '명단_및_현황' 시트와 같은 모양으로 내보내기 위한 순수 부분.
 * DB 를 읽어 모으는 것은 roster-data.ts, 엑셀을 그리는 것은 roster-xlsx.ts.
 *
 * 목장 명단(scope)은 같은 모양에 그 목장 사람만 — 현황 · 섬김 부서 표도 그 목장만 센다.
 * 순서: 목장은 명단 순서(number), 목장 안에서는 목장장 → 리더 → 양, 같으면 이름순. 목장을 떠난 사람(left)은 빠진다.
 * 엑셀 원본은 목장마다 첫 줄을 굵게, 목장이 바뀔 때마다 줄 색을 번갈아 칠한다 — groupIndex · first 로 넘긴다.
 */

export type RosterPersonRow = {
  id: string;
  name: string;
  group_id: string | null;
  group_role: Enums["group_role"];
  is_group_head: boolean;
  status: Enums["person_status"];
  training_stage: string | null;
  birth_year: number | null;
  gender: Enums["gender"] | null;
  occupation: string | null;
  affiliation: string | null;
  youth_member: boolean;
  assembly_member: boolean;
  note: string | null;
};

export type RosterGroupRow = { id: string; name: string; number: number; village: string | null };

export type RosterLine = {
  village: string;
  group: string;
  name: string;
  kind: string; // 리더 · 양
  stage: string;
  birthYear: number | null;
  gender: string; // 남 · 여
  occupation: string;
  affiliation: string;
  youth: boolean;
  assembly: boolean;
  note: string;
  /** 목장의 첫 줄 — 굵게 */
  first: boolean;
  /** 몇 번째 목장인가(0부터) — 줄 색이 번갈아 바뀐다 */
  groupIndex: number;
};

/** 섬김 부서 하나와 그 부서 사람들(명단 순서) */
export type RosterMinistry = { name: string; people: string[] };

export type RosterModel = {
  lines: RosterLine[];
  /** 목장별 현황 — 명단 순서 */
  groups: string[];
  /** 마을별 현황 — 목장 순서에서 처음 나오는 차례 */
  villages: string[];
  ministries: RosterMinistry[];
  /** 기준일(내보낸 날, KST) — YYYY-MM-DD */
  asOf: string;
  /** 목장 명단이면 그 목장 이름, 전체 명단이면 null — 제목 · 파일 이름에만 쓴다 */
  scope: string | null;
};

const GENDER: Record<Enums["gender"], string> = { male: "남", female: "여" };
const KIND: Record<Enums["group_role"], string> = { leader: "리더", member: "양" };

const rank = (p: RosterPersonRow) => (p.group_role === "leader" ? (p.is_group_head ? 0 : 1) : 2);
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildRosterModel(input: {
  people: RosterPersonRow[];
  groups: RosterGroupRow[];
  ministries: { id: string; name: string; sort: number }[];
  memberships: { person_id: string; ministry_id: string }[];
  asOf: string;
  scope?: string | null;
}): RosterModel {
  // 마을별로 묶고 마을 안에서 가나다(2026-11-17, lib/group-order). 마을 순서는 그대로 — 번호가 가장 앞선 목장의 마을부터
  const groups = sortGroupsByVillage(input.groups);
  const lines: RosterLine[] = [];
  const order: string[] = []; // 명단 순서의 사람 id — 부서 표도 이 순서
  groups.forEach((g, groupIndex) => {
    const people = input.people
      .filter((p) => p.group_id === g.id && p.status !== "left")
      .sort((a, b) => rank(a) - rank(b) || byName(a.name, b.name));
    people.forEach((p, i) => {
      order.push(p.id);
      lines.push({
        village: g.village ?? "",
        group: g.name,
        name: p.name,
        kind: KIND[p.group_role],
        stage: p.training_stage ?? "",
        birthYear: p.birth_year,
        gender: p.gender ? GENDER[p.gender] : "",
        occupation: p.occupation ?? "",
        affiliation: p.affiliation ?? "",
        youth: p.youth_member,
        assembly: p.assembly_member,
        note: p.note ?? "",
        first: i === 0,
        groupIndex,
      });
    });
  });

  const nameOf = new Map(input.people.map((p) => [p.id, p.name]));
  const pos = new Map(order.map((id, i) => [id, i]));
  const ministries = [...input.ministries]
    .sort((a, b) => a.sort - b.sort)
    .map((m) => ({
      name: m.name,
      people: input.memberships
        .filter((x) => x.ministry_id === m.id && pos.has(x.person_id))
        .sort((a, b) => pos.get(a.person_id)! - pos.get(b.person_id)!)
        .map((x) => nameOf.get(x.person_id)!),
    }));

  const villages: string[] = [];
  for (const g of groups) if (g.village && !villages.includes(g.village)) villages.push(g.village);

  return { lines, groups: groups.map((g) => g.name), villages, ministries, asOf: input.asOf, scope: input.scope ?? null };
}

/** 시트 제목 — 목장 명단은 목장 이름이 들어간다 */
export function rosterTitle(scope: string | null = null): string {
  return scope ? `로뎀나무교회 청년대학부 ${scope} 목장 명단` : "로뎀나무교회 청년대학부 명단";
}

/** 파일 이름 — 원본처럼 날짜(YYMMDD)를 앞에 */
export function rosterFileName(asOf: string, scope: string | null = null): string {
  return `${asOf.slice(2).replaceAll("-", "")}_${rosterTitle(scope)}.xlsx`;
}
