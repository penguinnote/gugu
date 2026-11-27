import { byKoName, sortGroups } from "@/lib/group-order";
import { addDays, weekdayOf } from "@/lib/week";

/**
 * 출석부(2026-11-16) — 목장 보고서가 제출되면 그 주 예배 출석이 여기에 저절로 나온다(따로 적지 않는다).
 *
 *   두 가지 출석부   현장 예배 출석부(기본 — 현장만 출석) · 현장 + 온라인 출석부(회원 관리 — 온라인도 출석)
 *   칸               현장 · 온라인 · 결석 · 빈칸(그 주 보고서가 없거나 아직 명단에 없던 주 — 결석으로 세지 않는다)
 *   온라인 비율       온라인 ÷ (현장 + 온라인). 1/5 을 넘으면 노랗게(ONLINE_FLAG)
 *
 * 회원 자격(회칙 제4조) — 시작은 명단의 '공동의회 회원' 표시, 그 뒤는 출석으로 계산한다. 출석은 현장 + 온라인.
 *   · 회원이 8주 연속 결석하면 회원 자격이 중지된다(LOSE_AFTER). 중지된 사람이 4주 연속 출석하면 되찾는다(REGAIN_AFTER)
 *   · 합당한 사유(목장 리더 · 목회자의 판단) — 명단의 돌봄 상태가 군 복무 · 원거리 · 주말 근무인 사람은 결석을 세지 않는다
 *   · 회원이 아닌 사람 — 6개월(26주) 이상 기록이 있고 그 가운데 3/4 이상 출석이면 '출석 요건 충족'.
 *     새가족반 수료 · 세례(입교) · 회칙 동의 · 신앙고백은 출석으로 알 수 없어 회원으로 올리지는 않는다(운영자가 명단에서 표시)
 * 빈칸인 주는 연속을 끊지도 잇지도 않는다(건너뛴다). 계산만 한다 — 명단의 표시는 바꾸지 않는다.
 */

export const ONLINE_FLAG = 1 / 5;
export const LOSE_AFTER = 8;
export const REGAIN_AFTER = 4;
export const QUALIFY_WEEKS = 26;
export const QUALIFY_RATE = 3 / 4;

/** off — 출석을 세지 않는 사람(군 복무 · 교환학생 등)의 결석 · 빈 주. 결석으로 세지 않고 엑셀에 회색 칸 + 사유(2026-11-17) */
export type Mark = "onsite" | "online" | "absent" | "off";
export type MemberState = "member" | "regained" | "lost" | "qualified" | "none";
export const MEMBER_LABEL: Record<MemberState, string> = { member: "회원", regained: "회원(회복)", lost: "회원 자격 중지", qualified: "출석 요건 충족", none: "" };

/**
 * 출석을 세지 않는 사람과 그 사유(두세 글자) — 명단의 '출석 제외' 칸이 먼저, 없으면 돌봄 상태, 보고서 명단에서 숨긴 사람은 '제외'.
 * 이 사람들은 결석을 세지 않는다(합당한 사유 — 회칙 제4조 2항). 2026-11-17
 */
const OFF_BY_CARE: Record<string, string> = { military: "군복무", remote: "원거리", exchange: "교환", weekend_work: "근무", other_church: "타교회" };
export const OFF_MAX = 4;
export function offLabelOf(p: Pick<BookPersonIn, "care_status" | "attendance_off" | "report_hidden">): string | null {
  const note = p.attendance_off?.trim();
  if (note) return note.slice(0, OFF_MAX);
  return OFF_BY_CARE[p.care_status] ?? (p.report_hidden ? "제외" : null);
}

export type BookPersonIn = {
  id: string;
  name: string;
  group_id: string;
  group_role: string;
  is_group_head: boolean;
  care_status: string;
  assembly_member: boolean;
  campus: string | null;
  /** 출석 제외 사유(두세 글자, 2026-11-17) — 있으면 그 사람은 출석을 세지 않는다 */
  attendance_off?: string | null;
  /** 보고서 명단에서 숨긴 사람 */
  report_hidden?: boolean;
  /** 들어온 날 — 그 앞 주는 빈칸 그대로 */
  joined_at?: string | null;
};
export type BookGroupIn = { id: string; name: string; number: number };
export type BookRecordIn = { person_id: string; week_key: string; onsite: boolean; online: boolean };

export type Membership = { state: MemberState; /** 지금 이어지는 결석 주 수 */ absentRun: number; /** 자격을 잃은 주 */ lostAt: string | null; excused: boolean };
export type BookRow = {
  id: string;
  name: string;
  leader: boolean;
  marks: (Mark | null)[];
  /** 출석을 세지 않는 사유(두세 글자). 없으면 null */
  off: string | null;
  onsite: number;
  online: number;
  absent: number;
  /** 온라인 ÷ (현장 + 온라인). 출석이 없으면 null */
  onlineShare: number | null;
  flagged: boolean;
  membership: Membership;
};
export type BookGroup = { id: string; name: string; rows: BookRow[] };
export type Book = { weeks: string[]; groups: BookGroup[]; start: string; end: string };

/** from ~ to 의 주일(둘 다 포함, 휴주 빼고) */
export function bookWeeks(from: string, to: string, skipped: Iterable<string> = []): string[] {
  const skip = new Set(skipped);
  const out: string[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) if (!skip.has(w)) out.push(w);
  return out;
}

/** 회원 자격 — 시작 표시와 주마다의 출석으로 */
export function membershipOf(startMember: boolean, weeks: string[], marks: (Mark | null)[], excused: boolean): Membership {
  let state: MemberState = startMember ? "member" : "none";
  let absentRun = 0;
  let attendRun = 0;
  let lostAt: string | null = null;
  let known = 0;
  let attended = 0;
  marks.forEach((m, i) => {
    if (m === null || m === "off") return;
    const here = m !== "absent";
    known++;
    if (here) attended++;
    absentRun = here ? 0 : absentRun + 1;
    attendRun = here ? attendRun + 1 : 0;
    if ((state === "member" || state === "regained") && !excused && absentRun >= LOSE_AFTER) {
      state = "lost";
      lostAt = weeks[i];
      attendRun = 0;
    } else if (state === "lost" && attendRun >= REGAIN_AFTER) {
      state = "regained";
      lostAt = null;
    }
  });
  if (state === "none" && known >= QUALIFY_WEEKS && attended / known >= QUALIFY_RATE) state = "qualified";
  return { state, absentRun, lostAt, excused };
}

/** own — 맨 위로 올릴 목장(화면에서 내 목장). 파일은 주지 않는다 — 가나다 순 그대로(lib/group-order) */
export function buildBook(input: { weeks: string[]; groups: BookGroupIn[]; people: BookPersonIn[]; records: BookRecordIn[]; own?: string | null }): Book {
  const { weeks } = input;
  const col = new Map(weeks.map((w, i) => [w, i]));
  const byPerson = new Map<string, (Mark | null)[]>();
  for (const r of input.records) {
    const i = col.get(r.week_key);
    if (i === undefined) continue;
    let m = byPerson.get(r.person_id);
    if (!m) byPerson.set(r.person_id, (m = weeks.map(() => null)));
    m[i] = r.online ? "online" : r.onsite ? "onsite" : "absent";
  }
  // 목장은 가나다 순, 화면이면 내 목장 맨 위(2026-11-17)
  const groups = sortGroups(input.groups, input.own)
    .map((g) => {
      const rows = input.people
        .filter((p) => p.group_id === g.id)
        // 목자 → 목동 → 양, 그 안에서는 이름 순
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ko"))
        .map((p): BookRow => {
          const off = offLabelOf(p);
          const joined = p.joined_at ? addDays(p.joined_at.slice(0, 10), -weekdayOf(p.joined_at.slice(0, 10))) : null;
          // 출석을 세지 않는 사람은 결석 · 빈 주(들어온 뒤)를 'off' 로 — 결석으로 세지 않는다
          const marks = (byPerson.get(p.id) ?? weeks.map(() => null)).map((m, i) =>
            off && (m === "absent" || (m === null && (!joined || weeks[i] >= joined))) ? ("off" as const) : m,
          );
          const onsite = marks.filter((m) => m === "onsite").length;
          const online = marks.filter((m) => m === "online").length;
          const absent = marks.filter((m) => m === "absent").length;
          const onlineShare = onsite + online > 0 ? online / (onsite + online) : null;
          return {
            id: p.id,
            name: p.name,
            leader: p.group_role === "leader",
            marks,
            off,
            onsite,
            online,
            absent,
            onlineShare,
            flagged: onlineShare !== null && onlineShare > ONLINE_FLAG,
            membership: membershipOf(p.assembly_member, weeks, marks, off !== null),
          };
        });
      return { id: g.id, name: g.name, rows };
    })
    .filter((g) => g.rows.length > 0);
  return { weeks, groups, start: weeks[0] ?? "", end: weeks[weeks.length - 1] ?? "" };
}

const rank = (p: BookPersonIn) => (p.is_group_head ? 0 : p.group_role === "leader" ? 1 : 2);

export const isMember = (s: MemberState) => s === "member" || s === "regained";
/** 0.25 → '25%'. null 이면 '-' */
export const shareText = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
/** '2026-11-22' → '11/22' */
export const weekShort = (w: string) => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}`;

/** 캠퍼스 명단 — 캠퍼스 이름별(가나다), 그 안에서는 목장 이름 · 사람 이름 가나다 순 */
export type CampusGroup = { campus: string; people: { id: string; name: string; group: string }[] };
export function buildCampus(people: BookPersonIn[], groups: BookGroupIn[]): CampusGroup[] {
  const g = new Map(groups.map((x) => [x.id, x]));
  const by = new Map<string, { id: string; name: string; group: string; n: number }[]>();
  for (const p of people) {
    const c = p.campus?.trim();
    if (!c) continue;
    by.set(c, [...(by.get(c) ?? []), { id: p.id, name: p.name, group: g.get(p.group_id)?.name ?? "", n: g.get(p.group_id)?.number ?? 999 }]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([campus, list]) => ({ campus, people: list.sort((a, b) => byKoName(a.group, b.group) || byKoName(a.name, b.name)).map((x) => ({ id: x.id, name: x.name, group: x.group })) }));
}
