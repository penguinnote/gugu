/**
 * 우리 목장 명단 고치기(2026-10-28) — 순수 계산. 폼과 서버 액션이 같이 쓴다. 진짜 강제는 DB 다
 * (컬럼 권한 · RLS · 제약 — tests/rls/roster-details.test.mjs). 여기서는 DB 가 거부할 값을 미리 말로 알려준다.
 *
 * 명단 엑셀의 칸 그대로: 이름 · 구분(리더/양) · 훈련단계 · 출생년도 · 성별 · 직업 · 소속 · 청년대학부 회원 · 공동의회 회원 · 비고 · 섬김 부서(여럿).
 * 마을 · 목장은 사람 칸이 아니다 — 마을은 목장에 붙고(set_group_village), 목장 옮기기는 운영자 화면에서.
 */

import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

/** 훈련단계 — 명단에 나오는 값. 지금 값이 이 밖이면 폼이 그 값도 보여 준다 */
export const TRAINING_STAGES = ["목자", "목동", "예비목자반", "제자반", "새가족반", "양"] as const;
/** 직업 — 고르기 쉽게 띄우는 값(자유롭게 적어도 된다) */
export const OCCUPATION_HINTS = ["대학생", "직장인", "취준생", "대학원생", "학생", "휴학생"] as const;

export const LIMITS = { name: 20, occupation: 30, affiliation: 40, campus: 30, attendanceOff: 4, note: 200 } as const;

export type RosterPersonEditRow = {
  id: string;
  name: string;
  group_id: string | null;
  group_role: Enums["group_role"];
  is_group_head: boolean;
  status: Enums["person_status"];
  user_id: string | null;
  training_stage: string | null;
  birth_year: number | null;
  gender: Enums["gender"] | null;
  occupation: string | null;
  affiliation: string | null;
  /** 캠퍼스 모임 이름(2026-11-16) — 없으면 캠퍼스 모임을 하지 않는다 */
  campus: string | null;
  /** 출석 제외 사유(1~4자, 2026-11-17) — 있으면 출석부에서 결석을 세지 않는다 */
  attendance_off: string | null;
  youth_member: boolean;
  assembly_member: boolean;
  note: string | null;
  updated_at: string;
};

/** 폼의 값 — 글자 칸은 문자열 그대로(빈칸 = 없음) */
export type RosterForm = {
  name: string;
  group_role: Enums["group_role"];
  training_stage: string;
  birth_year: string;
  gender: Enums["gender"] | "";
  occupation: string;
  affiliation: string;
  campus: string;
  attendance_off: string;
  youth_member: boolean;
  assembly_member: boolean;
  note: string;
  ministries: string[];
  /** 목장장(2026-11-06) — 리더만. DB 칸이 아니라 set_group_head 로 쓴다(한 목장에 한 명) */
  is_group_head: boolean;
};

/** DB 에 쓰는 값 */
export type RosterPatch = {
  name: string;
  group_role: Enums["group_role"];
  training_stage: string | null;
  birth_year: number | null;
  gender: Enums["gender"] | null;
  occupation: string | null;
  affiliation: string | null;
  /** 캠퍼스 모임 이름(2026-11-16) — 없으면 캠퍼스 모임을 하지 않는다 */
  campus: string | null;
  /** 출석 제외 사유(1~4자, 2026-11-17) — 있으면 출석부에서 결석을 세지 않는다 */
  attendance_off: string | null;
  youth_member: boolean;
  assembly_member: boolean;
  note: string | null;
};

export function emptyForm(): RosterForm {
  return {
    name: "",
    group_role: "member",
    training_stage: "",
    birth_year: "",
    gender: "",
    occupation: "",
    affiliation: "",
    campus: "",
    attendance_off: "",
    youth_member: false,
    assembly_member: false,
    note: "",
    ministries: [],
    is_group_head: false,
  };
}

export function formOf(p: RosterPersonEditRow, ministries: string[]): RosterForm {
  return {
    name: p.name,
    group_role: p.group_role,
    training_stage: p.training_stage ?? "",
    birth_year: p.birth_year == null ? "" : String(p.birth_year),
    gender: p.gender ?? "",
    occupation: p.occupation ?? "",
    affiliation: p.affiliation ?? "",
    campus: p.campus ?? "",
    attendance_off: p.attendance_off ?? "",
    youth_member: p.youth_member,
    assembly_member: p.assembly_member,
    note: p.note ?? "",
    ministries: [...ministries].sort(),
    is_group_head: p.is_group_head,
  };
}

export function isSameForm(a: RosterForm, b: RosterForm): boolean {
  const ka = JSON.stringify({ ...a, ministries: [...a.ministries].sort() });
  const kb = JSON.stringify({ ...b, ministries: [...b.ministries].sort() });
  return ka === kb;
}

/** 줄바꿈 · 겹친 공백을 한 칸으로, 앞뒤 공백은 뺀다. 빈칸이면 null */
const clean = (s: string): string | null => {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/**
 * 폼 → DB 값. 막을 것은 말로:
 *   이름(1~20자) · 출생년도(네 자리, 1950~올해) · 글자 칸 길이 · 계정 있는 리더를 양으로 내리기(먼저 운영자가 연결 해제) ·
 *   목장장을 양으로 내리기(목장장은 리더여야 한다)
 */
export function validateRosterForm(
  f: RosterForm,
  thisYear: number,
  current?: Pick<RosterPersonEditRow, "user_id" | "group_role" | "is_group_head">,
): { ok: true; value: RosterPatch } | { ok: false; message: string } {
  const name = clean(f.name);
  if (!name) return { ok: false, message: "이름을 적으세요." };
  if (name.length > LIMITS.name) return { ok: false, message: `이름은 ${LIMITS.name}자까지입니다.` };
  if (f.group_role !== "leader" && f.group_role !== "member") return { ok: false, message: "구분(리더 · 양)을 고르세요." };
  if (current && f.group_role === "member" && current.group_role === "leader") {
    if (current.user_id) return { ok: false, message: "앱 계정이 연결된 리더는 양으로 내릴 수 없습니다. 운영자에게 연결 해제를 부탁하세요." };
  }
  if (f.is_group_head && f.group_role !== "leader") return { ok: false, message: "목자는 리더만 될 수 있습니다." };
  let birth_year: number | null = null;
  const by = f.birth_year.trim();
  if (by) {
    if (!/^\d{4}$/.test(by)) return { ok: false, message: "출생년도는 네 자리 숫자입니다." };
    birth_year = Number(by);
    if (birth_year < 1950 || birth_year > thisYear) return { ok: false, message: `출생년도는 1950~${thisYear} 사이입니다.` };
  }
  if (f.gender !== "" && f.gender !== "male" && f.gender !== "female") return { ok: false, message: "성별을 고르세요." };
  const stage = clean(f.training_stage);
  if (stage && stage.length > 20) return { ok: false, message: "훈련단계는 20자까지입니다." };
  const occupation = clean(f.occupation);
  if (occupation && occupation.length > LIMITS.occupation) return { ok: false, message: `직업은 ${LIMITS.occupation}자까지입니다.` };
  const affiliation = clean(f.affiliation);
  if (affiliation && affiliation.length > LIMITS.affiliation) return { ok: false, message: `소속은 ${LIMITS.affiliation}자까지입니다.` };
  const campus = clean(f.campus);
  if (campus && campus.length > LIMITS.campus) return { ok: false, message: `캠퍼스는 ${LIMITS.campus}자까지입니다.` };
  const attendanceOff = clean(f.attendance_off);
  if (attendanceOff && attendanceOff.length > LIMITS.attendanceOff) return { ok: false, message: `출석 제외는 ${LIMITS.attendanceOff}자까지입니다.` };
  const note = clean(f.note);
  if (note && note.length > LIMITS.note) return { ok: false, message: `비고는 ${LIMITS.note}자까지입니다.` };
  return {
    ok: true,
    value: {
      name,
      group_role: f.group_role,
      training_stage: stage,
      birth_year,
      gender: f.gender === "" ? null : f.gender,
      occupation,
      affiliation,
      campus,
      attendance_off: attendanceOff,
      youth_member: !!f.youth_member,
      assembly_member: !!f.assembly_member,
      note,
    },
  };
}

/** 섬김 부서 — 넣을 것 · 뺄 것 */
export function ministryDiff(before: readonly string[], after: readonly string[]): { add: string[]; remove: string[] } {
  const a = new Set(after);
  const b = new Set(before);
  return { add: [...a].filter((x) => !b.has(x)), remove: [...b].filter((x) => !a.has(x)) };
}

type Who = { role: string; leadsGroup: boolean; groupId: string | null };

/** 그 목장 명단을 고칠 수 있나 — 자기 목장 리더 · 목사님 · 운영자(RLS persons_update 와 같은 규칙) */
export function canEditGroup(me: Who, groupId: string | null): boolean {
  if (!groupId) return false;
  return me.role === "pastor" || me.role === "admin" || (me.leadsGroup && me.groupId === groupId);
}

/** 그 목장에 인원을 추가할 수 있나 — 운영자, 목사님(어느 목장이든 양으로, 2026-10-29), 자기 목장에 양을 넣는 리더(RLS persons_insert) */
/**
 * 구분(리더 · 양)을 고를 수 있나(2026-11-26 사용자 결정) — 목사님 · 운영자만. 리더는 새 사람을 양으로만 넣고, 양을 리더로 올리지 못한다
 * (DB 도 persons_insert · persons_staff_only 로 같게 막는다).
 */
export function canChooseRole(me: Pick<Who, "role">): boolean {
  return me.role === "admin" || me.role === "pastor";
}

export function canAddTo(me: Who, groupId: string | null): boolean {
  if (!groupId) return false;
  return me.role === "admin" || me.role === "pastor" || (me.leadsGroup && me.groupId === groupId);
}
