/**
 * 주차와 마감 — 전부 한국 시간(Asia/Seoul) 기준.
 *
 * 주차 키(week_key)는 그 주 **일요일**의 날짜다(DB 제약과 같다).
 * 마감은 그 주 화요일 23:59, 즉 수요일 00:00 KST 다.
 *
 * 서버가 UTC 로 돌아도 리더가 보는 "오늘"은 한국의 오늘이어야 하므로
 * Date 객체를 그대로 쓰지 않고 항상 KST 달력 날짜 문자열(YYYY-MM-DD)로 다룬다.
 */

const KST = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;

const kstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 지금 이 순간의 한국 달력 날짜. */
export function kstToday(now: Date = new Date()): string {
  return kstDate.format(now); // en-CA 는 YYYY-MM-DD 로 나온다
}

/** 달력 날짜의 요일 (0 = 일요일). 시간대와 무관하게 날짜 자체의 요일이다. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 가장 최근 일요일. 오늘이 일요일이면 오늘. */
export function currentWeekKey(now: Date = new Date()): string {
  const today = kstToday(now);
  return addDays(today, -weekdayOf(today));
}

export function isWeekKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    weekdayOf(value) === 0
  );
}

/** 마감 시각 — 수요일 00:00 KST. */
export function deadlineFor(weekKey: string): Date {
  return new Date(`${addDays(weekKey, 3)}T00:00:00+09:00`);
}

export function isPastDeadline(weekKey: string, now: Date = new Date()): boolean {
  return now.getTime() >= deadlineFor(weekKey).getTime();
}

/** "9월 21일" — 2026-11-15 사용자 요청으로 "(주일)" 을 뺐다(앱 어디서든) */
/** "11월 8일" — 요일 없이(2026-11-14 보고서 제목, 사용자 요청) */
export function formatWeekDate(weekKey: string): string {
  const [, m, d] = weekKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

export function formatWeekLabel(weekKey: string): string {
  const [, m, d] = weekKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 마감까지 남은 시간을 한 줄로. 지났으면 "마감 지남". */
export function formatRemaining(weekKey: string, now: Date = new Date()): string {
  const ms = deadlineFor(weekKey).getTime() - now.getTime();
  if (ms <= 0) return "마감 지남";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "마감까지 1시간 미만";
  if (hours < 24) return `마감까지 ${hours}시간`;
  const days = Math.floor(ms / DAY_MS);
  const rest = hours - days * 24;
  return rest > 0 ? `마감까지 ${days}일 ${rest}시간` : `마감까지 ${days}일`;
}

/** 이번 주부터 앞으로 n 주의 주차 키. 휴주 지정 화면(A-1b)이 쓴다 — 지난 주는 보여주지 않는다. */
export function upcomingWeeks(from: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, 7 * i));
}

/** 두 주차 키 사이의 주 수. */
export function weeksBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / (7 * DAY_MS));
}

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/**
 * KST 로 "화요일 오후 3:12". 오늘이면 요일 대신 "오늘". Intl 을 쓰지 않는다 — 서버(Node ICU)와
 * 브라우저가 다르게 그려 하이드레이션이 깨진다(06 §4.5).
 */
export function formatKstWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h24 = kst.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = `${h24 < 12 ? "오전" : "오후"} ${h12}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  const day = kstToday(d) === kstToday(now) ? "오늘" : WEEKDAY_KO[kst.getUTCDay()];
  return `${day} ${time}`;
}

/** KST 요일과 24시 시각 — "수요일 08:12". AI 정리를 만든 때(2026-11-08). */
export function formatKstWeekdayTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${WEEKDAY_KO[kst.getUTCDay()]} ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

/** KST 요일만 — "화요일". 리더에게 보이는 "확인하셨습니다 · 화요일" 에 쓴다. */
export function kstWeekday(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return WEEKDAY_KO[kst.getUTCDay()];
}

/** 홈 카운트다운 — "제출까지 2일 3시간" / 마감 후 "이번 주 마감됨". 06 §4.5: '지금' 은 호출자가 넘긴다. */
export function formatUntilDeadline(weekKey: string, now: Date): string {
  const ms = deadlineFor(weekKey).getTime() - now.getTime();
  if (ms <= 0) return "이번 주 마감됨";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "제출까지 1시간 미만";
  if (hours < 24) return `제출까지 ${hours}시간`;
  const days = Math.floor(ms / DAY_MS);
  const rest = hours - days * 24;
  return rest > 0 ? `제출까지 ${days}일 ${rest}시간` : `제출까지 ${days}일`;
}
