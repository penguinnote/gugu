/**
 * A-1 명단 관리 — 순수 계산 (Step 9b).
 *
 * 화면은 있는 사람을 고친다(등록은 Step 11). 여기 있는 규칙은 서버 액션과 폼이 같이 쓴다. 진짜 강제는 DB 다
 * (컬럼 권한 · 트리거 · 인덱스 — tests/rls/people-admin.test.mjs). 여기서는 DB 가 거부할 조합을 미리 말로
 * 알려주는 것까지다 — "먼저 연결을 해제하세요" 를 23514 코드 대신 보여준다.
 */

import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type PersonAdminRow = {
  id: string;
  name: string;
  group_id: string | null;
  group_role: Enums["group_role"];
  is_group_head: boolean;
  status: Enums["person_status"];
  care_status: Enums["care_status"];
  needs_check: boolean | null;
  user_id: string | null;
  birth_year: number | null;
  /** 연결된 계정이 임원진인가(2026-11-26 명단에 표시) — 운영자 명단만 채운다 */
  is_officer?: boolean;
};

export type GroupRef = { id: string; name: string; number: number };

export const PEOPLE_FILTERS = {
  all: "전체",
  leaders: "리더",
  linked: "계정 연결",
  flagged: "활동 외·태그",
} as const;
export type PeopleFilter = keyof typeof PEOPLE_FILTERS;

export function isPeopleFilter(v: unknown): v is PeopleFilter {
  return typeof v === "string" && v in PEOPLE_FILTERS;
}

export function matchesFilter(p: PersonAdminRow, f: PeopleFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "leaders":
      return p.group_role === "leader";
    case "linked":
      return p.user_id !== null;
    case "flagged":
      return p.status !== "active" || p.care_status !== "active";
  }
}

export type GroupSection = { group: GroupRef; people: PersonAdminRow[]; leaders: number; members: number };

/** 목장별 묶음 — 목장은 받은 순서 그대로(부르는 화면이 lib/group-order 로 정한다, 2026-11-17), 안에서는 리더(목장장 먼저) → 청년, 이름순. 떠난 사람은 맨 아래. */
export function groupSections(people: PersonAdminRow[], groups: GroupRef[], filter: PeopleFilter): GroupSection[] {
  const rank = (p: PersonAdminRow) => (p.status === "left" ? 3 : p.group_role === "leader" ? (p.is_group_head ? 0 : 1) : 2);
  const cmp = (a: PersonAdminRow, b: PersonAdminRow) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return [...groups]
    .map((group) => {
      const all = people.filter((p) => p.group_id === group.id);
      return {
        group,
        people: all.filter((p) => matchesFilter(p, filter)).sort(cmp),
        leaders: all.filter((p) => p.group_role === "leader" && p.status !== "left").length,
        members: all.filter((p) => p.group_role === "member" && p.status !== "left").length,
      };
    })
    .filter((s) => filter === "all" || s.people.length > 0);
}

/** 목록 한 줄에 붙는 표시들. '활동'·'재적' 같은 기본값은 붙이지 않는다 — 다른 것만 눈에 띄게. */
export function personFlags(
  p: PersonAdminRow,
  labels: { status: Record<Enums["person_status"], string>; care: Record<Enums["care_status"], string> },
): string[] {
  const out: string[] = [];
  if (p.is_group_head) out.push("목자");
  if (p.status !== "active") out.push(labels.status[p.status]);
  if (p.care_status !== "active") out.push(labels.care[p.care_status]);
  if (p.user_id) out.push("계정");
  if (p.is_officer) out.push("임원진");
  return out;
}

export type PersonPatch = {
  group_id: string;
  group_role: Enums["group_role"];
  is_group_head: boolean;
  status: Enums["person_status"];
  care_status: Enums["care_status"];
  needs_check: boolean | null;
};

/**
 * 저장 전에 말로 막을 수 있는 조합. null 이면 통과 — 나머지는 DB 가 본다.
 *   · 계정 있는 리더 → 청년: 먼저 연결 해제 (DB 23514)
 *   · 목장장은 리더만 (DB 23514)
 *   · 기록 제외는 활동에서만 들어가고 활동으로만 나온다 (set_person_recording 의 규칙)
 */
export function validatePatch(current: PersonAdminRow, next: PersonPatch): string | null {
  if (current.user_id && current.group_role === "leader" && next.group_role === "member") {
    return "계정이 연결된 리더는 양으로 내릴 수 없습니다. 먼저 아래에서 연결을 해제하세요.";
  }
  if (next.is_group_head && next.group_role !== "leader") return "목자는 리더여야 합니다.";
  if (next.status === "opted_out" && current.status !== "opted_out" && current.status !== "active") {
    return "기록 제외는 활동 중인 사람만 됩니다. 먼저 활동으로 바꾸세요.";
  }
  if (current.status === "opted_out" && next.status !== "opted_out" && next.status !== "active") {
    return "기록 제외를 풀면 먼저 활동이 됩니다. 활동으로 바꾼 뒤 다시 고치세요.";
  }
  return null;
}

export function patchOf(p: PersonAdminRow): PersonPatch {
  return {
    group_id: p.group_id ?? "",
    group_role: p.group_role,
    is_group_head: p.is_group_head,
    status: p.status,
    care_status: p.care_status,
    needs_check: p.needs_check,
  };
}

export function isSamePatch(a: PersonPatch, b: PersonPatch): boolean {
  return (
    a.group_id === b.group_id &&
    a.group_role === b.group_role &&
    a.is_group_head === b.is_group_head &&
    a.status === b.status &&
    a.care_status === b.care_status &&
    a.needs_check === b.needs_check
  );
}

/** DB 오류 → 사람 말. 코드와 메시지 조각으로 가른다. */
export function explainDbError(code: string | null | undefined, message: string): string {
  // 제약 이름으로 가른다 — 같은 코드(23505·23514)를 여러 규칙이 쓴다
  if (code === "23514" && message.includes("청년에게는")) return "계정이 연결된 리더는 양으로 내릴 수 없습니다. 먼저 연결을 해제하세요.";
  if (code === "23514" && message.includes("persons_name_ck")) return "이름은 앞뒤 공백 없이 1~20자입니다.";
  if (code === "23514" && message.includes("persons_head_is_leader_ck")) return "목자는 리더여야 합니다.";
  if (code === "23505" && message.includes("persons_unique_name_in_group")) {
    return "그 목장에 같은 이름이 있습니다. 같은 목장 안에서는 이름이 겹칠 수 없습니다 — 구분 표시를 붙여 주세요(예: 한가람B).";
  }
  if (code === "23505" && message.includes("persons_one_head_per_group")) return "그 목장에는 이미 목자가 있습니다. 먼저 그분을 내리세요.";
  if (code === "42501") return "운영자만 바꿀 수 있습니다.";
  return message;
}

/**
 * Step 11 새 사람 등록 — 입력 검증. 서버 액션과 폼이 같이 쓴다. DB 가 한 번 더 본다
 * (persons_name_ck · persons_unique_name_in_group · persons_insert 정책).
 *   목장·이름·역할·성별 필수(성별은 성별 수급 통계가 쓴다, 2026-10-06), 출생년도는 선택 — 4자리, 1950~올해.
 */
export type NewPersonInput = {
  group_id: string;
  name: string;
  group_role: "leader" | "member" | "";
  gender: "male" | "female" | "";
  birth_year: string;
};

export type NewPersonRow = {
  group_id: string;
  name: string;
  group_role: "leader" | "member";
  gender: "male" | "female";
  birth_year: number | null;
};

export function validateNewPerson(
  input: NewPersonInput,
  activeGroupIds: readonly string[],
  thisYear: number,
): { ok: true; value: NewPersonRow } | { ok: false; message: string } {
  if (!input.group_id || !activeGroupIds.includes(input.group_id)) return { ok: false, message: "목장을 고르세요." };
  const name = input.name.trim();
  if (!name) return { ok: false, message: "이름을 적으세요." };
  if (name.length > 20) return { ok: false, message: "이름은 20자까지입니다." };
  if (input.group_role !== "leader" && input.group_role !== "member") return { ok: false, message: "역할을 고르세요." };
  if (input.gender !== "male" && input.gender !== "female") return { ok: false, message: "성별을 고르세요." };
  let birth_year: number | null = null;
  const by = input.birth_year.trim();
  if (by) {
    if (!/^\d{4}$/.test(by)) return { ok: false, message: "출생년도는 네 자리 숫자입니다." };
    birth_year = Number(by);
    if (birth_year < 1950 || birth_year > thisYear) return { ok: false, message: `출생년도는 1950~${thisYear} 사이입니다.` };
  }
  return { ok: true, value: { group_id: input.group_id, name, group_role: input.group_role, gender: input.gender, birth_year } };
}
