import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, isWeekKey } from "@/lib/week";

import { bookWeeks, buildBook, type Book, type BookGroupIn, type BookPersonIn, type BookRecordIn } from "./attendance-book";

/**
 * 출석부 읽기(2026-11-16) — 보는 사람 세션으로 함수 셋을 부른다(운영자 · 목사님 · 임원진만 통과, 그 밖은 오류).
 * 기간: 출석부 시작 주(attendance_start) ~ 이번 주. from · to 를 주면 그 안에서만(엑셀). 회원 자격은 늘 시작 주부터 센다.
 */
type Client = Awaited<ReturnType<typeof createClient>>;

/** 화면에 한 번에 보이는 주 수 — 더 오래된 주는 엑셀로 */
export const SCREEN_WEEKS = 12;
const FIRST_SUNDAY = "2000-01-02";

export type AttendanceData = { book: Book; people: BookPersonIn[]; groups: BookGroupIn[]; start: string | null; /** 출석부 기간 안의 휴주(넓은 화면 표의 빈 열, 2026-11-27) */ skipped: string[] };

/** own — 화면에서 맨 위로 올릴 내 목장. 엑셀은 주지 않는다(가나다 그대로) */
export async function loadAttendance(supabase: Client, own: string | null = null): Promise<AttendanceData> {
  const thisWeek = currentWeekKey();
  const [startRes, peopleRes, groupsRes, records, skippedRes] = await Promise.all([
    supabase.rpc("attendance_start"),
    supabase.rpc("attendance_people"),
    supabase.from("groups").select("id, name, number").eq("status", "active"),
    allRecords(supabase, thisWeek),
    supabase.from("skipped_weeks").select("week_key").lte("week_key", thisWeek),
  ]);
  for (const r of [startRes, peopleRes, groupsRes, skippedRes]) if (r.error) throw new Error(r.error.message);
  // 시작 주가 정해져 있지 않으면(아주 옛날 값) 기록이 있는 첫 주부터
  const set = typeof startRes.data === "string" && isWeekKey(startRes.data) && startRes.data > FIRST_SUNDAY ? startRes.data : null;
  const first = set ?? records.reduce<string>((min, r) => (r.week_key < min ? r.week_key : min), thisWeek);
  const skipped = (skippedRes.data ?? []).map((s) => s.week_key).filter((w) => w >= first);
  const weeks = bookWeeks(first, thisWeek, skipped);
  const people = (peopleRes.data ?? []) as BookPersonIn[];
  const groups = (groupsRes.data ?? []) as BookGroupIn[];
  return { book: buildBook({ weeks, groups, people, records, own }), people, groups, start: set, skipped };
}

/** 출석 줄 모두 — PostgREST 는 한 번에 1000줄까지라 나눠 읽는다(사람 × 주) */
async function allRecords(supabase: Client, to: string): Promise<BookRecordIn[]> {
  const PAGE = 1000;
  const out: BookRecordIn[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .rpc("attendance_book", { p_to: to })
      .order("week_key")
      .order("person_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as BookRecordIn[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** 이번 주가 아직 안 온 시작 주(다음 주부터 시작)면 빈 출석부 */
export const notStarted = (d: AttendanceData) => d.book.weeks.length === 0;
export const nextWeek = () => addDays(currentWeekKey(), 7);

/**
 * 홈 카드의 출석부 줄(2026-11-16) — 이번 주 출석 인원(현장 + 온라인, 제출된 보고서만, 청년부 전체). 못 읽으면 null(줄을 그리지 않는다).
 * 앱을 쓰는 사람 모두가 부를 수 있다(attendance_book).
 */
export async function loadWeekAttendance(supabase: Client, weekKey: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("attendance_book", { p_from: weekKey, p_to: weekKey });
  if (error) return null;
  return ((data ?? []) as BookRecordIn[]).filter((r) => r.onsite || r.online).length;
}
