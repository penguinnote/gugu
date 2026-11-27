/**
 * 상태 코드 ↔ 한국어 라벨.
 *
 * DB 에는 영문 소문자 코드로만 저장한다. 한국어는 여기서만 만든다.
 * 이유는 두 가지다.
 *   · 표기를 바꾸고 싶을 때(예: '목사님' → '담당목사') 마이그레이션이 필요 없다.
 *   · 쿼리·인덱스·로그가 한글에 묶이지 않는다.
 *
 * 각 매핑은 생성된 DB 타입(`Enums`)을 키로 받는 `Record` 다. 마이그레이션에서
 * enum 값을 추가·삭제하고 타입을 다시 생성하면, 여기 라벨을 고치기 전까지
 * 타입 검사가 실패한다. 코드와 라벨이 조용히 어긋나는 일을 막는 장치다.
 */

import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const AUTH_PROVIDER_LABELS: Record<Enums["auth_provider"], string> = {
  kakao: "카카오",
  google: "구글",
};

/** 앱 권한. 목장 안에서의 역할(group_role)과는 다른 것이다. */
export const USER_ROLE_LABELS: Record<Enums["user_role"], string> = {
  pending: "미승인",
  leader: "리더",
  pastor: "목사님",
  admin: "운영자",
  officer: "임원진",
};

export const USER_STATUS_LABELS: Record<Enums["user_status"], string> = {
  active: "활성",
  inactive: "비활성",
};

export const GROUP_STATUS_LABELS: Record<Enums["group_status"], string> = {
  active: "운영",
  disbanded: "해산",
  special: "월드 집",
};

export const GENDER_LABELS: Record<Enums["gender"], string> = {
  male: "남",
  female: "여",
};

/**
 * 한 사람의 목장 안 역할을 부르는 말(2026-11-16) — 리더는 목자(목장장)와 목동(그 밖의 리더)으로 나뉜다. 양은 앱을 쓰지 않는다.
 * 리더 전체를 묶어 부를 때는 그대로 '리더'(GROUP_ROLE_LABELS · USER_ROLE_LABELS).
 */
export const HEAD_LABEL = "목자";
export const memberRoleLabel = (groupRole: string | null | undefined, isHead: boolean | null | undefined): string =>
  groupRole === "leader" ? (isHead ? HEAD_LABEL : "목동") : "양";

/** 목장 안에서의 역할. 앱 권한(user_role)과는 다른 것이다. */
export const GROUP_ROLE_LABELS: Record<Enums["group_role"], string> = {
  leader: "리더",
  member: "양",
};

export const PERSON_STATUS_LABELS: Record<Enums["person_status"], string> = {
  active: "활동",
  dormant: "휴면",
  // 운영 화면(A-1)에서만 쓴다. 리더 화면에는 이 상태를 어떤 식으로도 표시하지 않는다 — 낙인이 된다.
  opted_out: "기록 제외",
  left: "이탈",
};

/** 돌봄 판정 축(04 v0.12). 판정 대상은 active·long_absent 둘뿐이라 화면에는 '장기 미출석' 만 나온다. */
export const CARE_STATUS_LABELS: Record<Enums["care_status"], string> = {
  active: "재적",
  military: "군 복무",
  remote: "원거리",
  exchange: "교환 학생",
  weekend_work: "주말 근무",
  other_church: "타 교회",
  long_absent: "장기 미출석",
};

/** 교육과정(2026-11-16) — 프로필의 숫자 칸. 명단의 훈련단계(persons.training_stage)에서 온다: 목자 · 목동은 '리더', 양 · 빈칸은 '—'(persons_public.course 가 바꿔 준다) */
export const COURSES = ["newcomer", "disciple", "pre_shepherd", "leader"] as const;
export type Course = (typeof COURSES)[number];
export const COURSE_LABELS: Record<Course, string> = { newcomer: "새가족반", disciple: "제자반", pre_shepherd: "예비목자반", leader: "리더" };
export const courseLabel = (c: string | null | undefined): string => (c && c in COURSE_LABELS ? COURSE_LABELS[c as Course] : "—");

export const DORMANCY_REQUEST_LABELS: Record<Enums["dormancy_request_status"], string> = {
  none: "없음",
  pending: "승인 대기",
  approved: "승인됨",
};

export const APPLICATION_STATUS_LABELS: Record<Enums["application_status"], string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "거절됨",
};

export const PRAYER_STATUS_LABELS: Record<Enums["prayer_status"], string> = {
  new: "새 제목",
  ongoing: "진행 중",
  answered: "응답됨",
};

export const EVENT_TYPE_LABELS: Record<Enums["event_type"], string> = {
  report_opened: "목장보고서 열람",
  report_submitted: "목장보고서 제출",
  comment_created: "코멘트 작성",
  account_unlinked: "계정 연결 해제",
};

export const EXPORT_FORMAT_LABELS: Record<Enums["export_format"], string> = {
  xlsx: "Excel",
  print: "PDF", // 2026-10-29 인쇄용 화면 → PDF 파일. 값(print)은 그대로
  roster: "명단 Excel",
  attendance: "출석부 Excel",
};

/**
 * 출석 세 축의 라벨. enum 이 아니라 boolean 이지만 화면 문구가 흩어지면
 * 같은 개념을 여러 이름으로 부르게 되므로 여기 모아둔다.
 */
export const ATTENDANCE_LABELS = {
  worship_attended: "예배출석",
  group_meeting_attended: "목장참석",
  one_on_one_contacted: "개별 연락으로 교제",
} as const;

/**
 * 목장 표시 이름. DB 에는 "새싹" 만 저장하고 화면에서 "새싹 목장" 으로 부른다 —
 * 명단 표기가 "새싹" 이고 실제로 부를 때는 "새싹 목장" 이다. 붙이는 곳은 여기 한 군데다.
 * "새싹 목장 보고서" 같은 조합이 자연스럽게 나온다.
 */
export function groupLabel(name: string | null | undefined): string {
  return name ? `${name} 목장` : "우리 목장";
}

/**
 * 목사님 스탬프. 코드는 DB enum(report_stamp), 문구는 여기뿐이다 — 목사님 말투에 맞춰 시범
 * 운영 전에 바꾼다. 지금은 하나다 — "수고했어요"·"힘내세요" 는 같은 자리 말이라 고르는 것
 * 자체가 부담이었다(2026-09-28). 늘리려면 enum add value + 여기 한 줄.
 */
export const REPORT_STAMPS: ReadonlyArray<Enums["report_stamp"]> = ["pray"];
export const REPORT_STAMP_LABELS: Record<Enums["report_stamp"], string> = {
  pray: "기도하겠습니다",
};

/**
 * 연속 제출(streak) 문구 — 한 곳. 순위는 없다. 각 목장이 자기 기록만 본다.
 *   이어지는 중        "3주 연속 제출 중"
 *   끊긴 뒤            "이번 주부터 다시" — 실패를 크게 쓰지 않는다
 *   첫 주(정시 없음)   null — 아무것도 보이지 않는다. 0 을 띄우지 않는다. 첫 정시 제출이
 *                      "1주 연속 제출 중" 으로 나타나는 것이 첫 보상이다
 */
export type StreakInfo = { streak: number; currentIncluded: boolean; everOnTime: boolean; broken: boolean };
export function streakLabel(s: StreakInfo | null | undefined): string | null {
  if (!s) return null;
  if (s.streak >= 1) return `${s.streak}주 연속 제출 중`;
  if (s.broken) return "이번 주부터 다시";
  return null;
}
/** 목사님 카드용 짧은 형태 — "3주 연속". 첫 주·끊김이면 null. */
export function streakShort(s: StreakInfo | null | undefined): string | null {
  if (!s || s.streak < 1) return null;
  return `${s.streak}주 연속`;
}
