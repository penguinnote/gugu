import { offLabelOf } from "@/lib/attendance-book";
import { byKoName } from "@/lib/group-order";

/**
 * 연속 결석(2026-11-17 사용자 — 목사님 화면에만). 예배를 2주 이상 연속 빠진 사람을 컨택 여부와 상관없이 보인다.
 *   돌봄 사각지대는 그대로 '아직 아무도 연락하지 않은 사람'(컨택하면 빠진다) — 이것은 '연락은 닿았지만 계속 못 나오는 사람' 까지.
 *   · 제출된 보고서의 기록만, 기록이 없는 주(미제출 · 휴주)는 건너뛴다(출석부와 같은 규칙)
 *   · 온라인 예배는 출석
 *   · 출석을 세지 않는 사람(군 복무 · 교환 학생 · 출석 제외 · 숨김 …)은 뺀다(lib/attendance-book offLabelOf)
 *   · 그 연속 결석 주들 가운데 리더 컨택이 한 번이라도 있었으면 '컨택함'
 */

export const STREAK_MIN = 2;

export type StreakPerson = { id: string; name: string; group_id: string | null; care_status: string; status: string; attendance_off?: string | null; report_hidden?: boolean };
export type StreakRecord = { person_id: string; week_key: string; worship_attended: boolean; one_on_one_contacted: boolean };
export type AbsenceStreak = { id: string; name: string; group: string; weeks: number; contacted: boolean; since: string };

export function absenceStreaks(people: StreakPerson[], groups: { id: string; name: string }[], records: StreakRecord[]): AbsenceStreak[] {
  const gname = new Map(groups.map((g) => [g.id, g.name]));
  const byPerson = new Map<string, StreakRecord[]>();
  for (const r of records) byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), r]);
  const out: AbsenceStreak[] = [];
  for (const p of people) {
    if (p.status !== "active" || !p.group_id || offLabelOf({ care_status: p.care_status, attendance_off: p.attendance_off ?? null, report_hidden: p.report_hidden ?? false })) continue;
    const recs = (byPerson.get(p.id) ?? []).sort((a, b) => (a.week_key < b.week_key ? 1 : -1));
    let weeks = 0;
    let contacted = false;
    let since = "";
    for (const r of recs) {
      if (r.worship_attended) break;
      weeks++;
      contacted ||= r.one_on_one_contacted;
      since = r.week_key;
    }
    if (weeks >= STREAK_MIN) out.push({ id: p.id, name: p.name, group: gname.get(p.group_id) ?? "", weeks, contacted, since });
  }
  // 오래 빠진 사람부터, 같으면 목장 · 이름 가나다
  return out.sort((a, b) => b.weeks - a.weeks || byKoName(a.group, b.group) || byKoName(a.name, b.name));
}
