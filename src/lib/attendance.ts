/**
 * 출석 분류(2026-10-30 v2) — 화면 표현과 DB 표현 사이의 매핑.
 *
 * 화면은 칩 넷이다. 예배는 셋 중 하나(현장 · 온라인 · 결석), 목장 모임 불참은 덧붙는 표시다.
 *
 *   현장 예배              예배 O · 온라인 X · 목장 O
 *   현장 예배 + 목장 불참  예배 O · 온라인 X · 목장 X   ← 예전 '예배만'. 현장 예배와 겹쳐 고를 수 있다
 *   온라인 예배            예배 O · 온라인 O · 목장 X   ← 목장 불참이 자동으로 함께 켜지고 끌 수 없다
 *   결석                   예배 X · 목장 X             ← 다른 칩과 겹치지 않는다
 *
 * 사유는 온라인 예배 · 목장 모임 불참(현장 예배와 겹칠 때) · 결석에 하나씩. 온라인은 불참을 겸하므로 온라인 사유 한 칸만 받는다.
 * 기본값은 없다. 사람마다 예배를 한 번 골라야 제출할 수 있다(Step 4 확정 ①).
 */

export type Worship = "in_person" | "online" | "absent";

export type Attendance = { worship: Worship; meetingOff: boolean };

export type Reasons = { online: string; meeting: string; absent: string };

export const EMPTY_REASONS: Reasons = { online: "", meeting: "", absent: "" };

export type AttendanceFlags = {
  worship_attended: boolean;
  group_meeting_attended: boolean;
  worship_online: boolean;
};

export function toFlags(a: Attendance): AttendanceFlags {
  switch (a.worship) {
    case "in_person":
      return { worship_attended: true, group_meeting_attended: !a.meetingOff, worship_online: false };
    case "online":
      return { worship_attended: true, group_meeting_attended: false, worship_online: true };
    case "absent":
      return { worship_attended: false, group_meeting_attended: false, worship_online: false };
  }
}

/**
 * DB 값 → 화면 값. (예배 X · 목장 O)는 화면에서 만들 수 없는 조합이므로
 * 미입력(null)으로 돌려준다 — 리더가 다시 한 번 탭해서 바로잡는다.
 */
export function fromFlags(worship: boolean, meeting: boolean, online = false): Attendance | null {
  if (!worship) return meeting ? null : { worship: "absent", meetingOff: true };
  if (online) return { worship: "online", meetingOff: true };
  return { worship: "in_person", meetingOff: !meeting };
}

/**
 * 칩 하나를 눌렀을 때 — 예배 셋은 서로 바뀌고(다시 누르면 꺼진다), 불참은 현장 예배일 때만 켜고 끈다.
 * 예배를 고르기 전에 불참을 누르면 현장 예배가 함께 켜진다 — 불참과 겹칠 수 있는 예배는 현장뿐이다.
 */
export type Chip = Worship | "meeting_off";

export function tapChip(cur: Attendance | null, chip: Chip): Attendance | null {
  if (chip === "meeting_off") {
    if (cur?.worship === "online" || cur?.worship === "absent") return cur;
    return { worship: "in_person", meetingOff: !(cur?.meetingOff ?? false) };
  }
  if (cur?.worship === chip) return null;
  if (chip === "in_person") return { worship: "in_person", meetingOff: false };
  return { worship: chip, meetingOff: true };
}

/** 칩이 켜져 있나 */
export function chipOn(a: Attendance | null, chip: Chip): boolean {
  if (!a) return false;
  if (chip === "meeting_off") return a.worship !== "absent" && a.meetingOff;
  return a.worship === chip;
}

/**
 * 넓은 화면 목장보고서(2026-11-27) — 칩 넷 대신 두 칸: 예배(현장 · 온라인 · 결석)는 tapChip 그대로, 목장 모임(참석 · 불참)은 이것.
 * 참석 · 불참은 현장 예배일 때만 고른다(예배를 아직 안 골랐으면 현장 예배가 함께 켜진다 — 휴대폰의 '목장 모임 불참' 칩과 같은 규칙).
 * 온라인 · 결석이면 바꾸지 않는다(온라인은 불참이 함께 켜져 잠긴다). 고른 칸을 다시 눌러도 그대로다.
 */
export function tapMeeting(cur: Attendance | null, attend: boolean): Attendance | null {
  if (cur?.worship === "online" || cur?.worship === "absent") return cur;
  return { worship: "in_person", meetingOff: !attend };
}

export const WORSHIP_SEG: ReadonlyArray<{ value: Worship; label: string }> = [
  { value: "in_person", label: "현장" },
  { value: "online", label: "온라인" },
  { value: "absent", label: "결석" },
];

export const CHIPS: ReadonlyArray<{ value: Chip; label: string }> = [
  { value: "in_person", label: "현장 예배" },
  { value: "online", label: "온라인 예배" },
  { value: "meeting_off", label: "목장 모임 불참" },
  { value: "absent", label: "결석" },
];

/** 보이는 사유 칸 — 고른 칩마다 하나 */
export function reasonSlots(a: Attendance | null): Array<keyof Reasons> {
  if (!a) return [];
  if (a.worship === "online") return ["online"];
  if (a.worship === "absent") return ["absent"];
  return a.meetingOff ? ["meeting"] : [];
}

export const REASON_LABEL: Record<keyof Reasons, string> = {
  online: "온라인 예배 사유",
  meeting: "목장 모임 불참 사유",
  absent: "결석 사유",
};

/** 저장할 사유 — 보이지 않는 칸은 비운다 */
export function reasonFields(a: Attendance | null, r: Reasons) {
  const slots = reasonSlots(a);
  const v = (k: keyof Reasons) => (slots.includes(k) && r[k].trim() !== "" ? r[k].trim() : null);
  return { online_reason: v("online"), meeting_absent_reason: v("meeting"), absent_reason: v("absent") };
}

/** 한 줄 라벨 — 목사님 보고서 · 타임라인. "현장 예배 · 목장 불참" */
export function attendanceLabel(a: Attendance): string {
  if (a.worship === "online") return "온라인 예배";
  if (a.worship === "absent") return "결석";
  return a.meetingOff ? "현장 예배 · 목장 불참" : "현장 예배";
}

/** 기도제목이 필수인 상태 — 목장모임에 참석한 사람만. */
export function requiresPrayer(a: Attendance | null): boolean {
  return a?.worship === "in_person" && !a.meetingOff;
}
