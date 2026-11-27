/**
 * 교회 공통 절기(2026-11-15 사용자 요청) — 목장이 디데이를 정해 두지 않았을 때 홈 카드가 대신 보여 준다.
 *   부활절(서방 교회 셈) · 맥추감사절(7월 첫 주일) · 추수감사절(11월 셋째 주일) · 크리스마스(12/25) · 송구영신예배(12/31)
 * 가까워졌을 때만(CHURCH_DAY_WITHIN 일 안) 보인다. 날짜 셈은 UTC 로만 — 시간대에 흔들리지 않게.
 */
import { daysBetween } from "@/lib/group-profile";

export type ChurchDay = { title: string; date: string };

/** 이 날 수 안으로 다가온 절기만 보인다(D-50 부터) */
export const CHURCH_DAY_WITHIN = 50;

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 부활절 주일(그레고리력, 익명 알고리즘) */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** 그 달의 n번째 주일 */
export function nthSunday(year: number, month: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = 주일
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}

export function churchDays(year: number): ChurchDay[] {
  return [
    { title: "부활절", date: easterSunday(year) },
    { title: "맥추감사절", date: nthSunday(year, 7, 1) },
    { title: "추수감사절", date: nthSunday(year, 11, 3) },
    { title: "크리스마스", date: ymd(year, 12, 25) },
    { title: "송구영신예배", date: ymd(year, 12, 31) },
  ];
}

/** 오늘부터 within 일 안에 오는 가장 가까운 절기(오늘 포함). 없으면 null */
export function nextChurchDay(today: string, within: number = CHURCH_DAY_WITHIN): ChurchDay | null {
  const year = Number(today.slice(0, 4));
  const all = [...churchDays(year), ...churchDays(year + 1)]
    .filter((d) => d.date >= today && daysBetween(today, d.date) <= within)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return all[0] ?? null;
}
