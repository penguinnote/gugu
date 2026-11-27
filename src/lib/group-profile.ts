/**
 * 목장 프로필 — 블록의 꼴과 순수 계산 (Step 8, 02 §4 L-5).
 *
 * DB 의 jsonb(ddays · theme_songs)를 믿지 않고 여기서 한 번 거른다. 제약(profile_ddays_valid 등)이
 * 막아주지만, 시드·옛 행·손으로 넣은 값이 섞여도 화면이 깨지지 않아야 한다. 한도는 DB 제약과
 * 같은 숫자다 — 둘이 어긋나면 "화면은 통과했는데 저장이 안 되는" 일이 생긴다.
 *
 * 날짜는 전부 KST 달력 날짜 문자열(YYYY-MM-DD)이다. '오늘' 은 서버가 넘긴다(06 §4.5).
 */

export type DDay = { title: string; date: string };
export type ThemeSong = { title: string; url: string };

export type ProfileBlocks = {
  /** 목장 요절 말씀(2026-11-14) — 목장 프로필만. 청년부 프로필은 없다 */
  verse?: string | null;
  intro: string | null;
  freeText: string | null;
  ddays: DDay[];
  themeSongs: ThemeSong[];
};

/** DB 제약과 같은 숫자 (migrations/..._group_profile_guards.sql) */
export const PROFILE_LIMITS = {
  verse: 200,
  intro: 100,
  freeText: 1000,
  ddays: 10,
  ddayTitle: 40,
  themeSongs: 5,
  songTitle: 60,
  url: 500,
} as const;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const URL_RE = /^https?:\/\/\S+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** jsonb → 디데이 목록. 꼴이 아닌 원소는 조용히 버린다. 순서는 저장된 그대로. */
export function parseDDays(json: unknown): DDay[] {
  if (!Array.isArray(json)) return [];
  const out: DDay[] = [];
  for (const e of json) {
    if (!isRecord(e)) continue;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const date = typeof e.date === "string" ? e.date : "";
    if (!title || !DATE_RE.test(date)) continue;
    out.push({ title, date });
  }
  return out;
}

/** jsonb → 테마 찬양 목록. http(s) 가 아닌 링크는 버린다 — 다른 리더 41명의 화면에서 열리는 링크다. */
export function parseThemeSongs(json: unknown): ThemeSong[] {
  if (!Array.isArray(json)) return [];
  const out: ThemeSong[] = [];
  for (const e of json) {
    if (!isRecord(e)) continue;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const url = typeof e.url === "string" ? e.url.trim() : "";
    if (!title || !URL_RE.test(url)) continue;
    out.push({ title, url });
  }
  return out;
}

/** 달력 날짜 둘 사이의 일수 (to − from). 시간대와 무관하게 날짜 자체로 센다. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type DDayState = { kind: "today" | "future" | "past"; label: string; days: number };

/** "D-DAY" · "D-12" · 지난 것은 "지남" (편집 화면에서만 보인다 — 지울 수 있게). */
export function ddayState(date: string, today: string): DDayState {
  const days = daysBetween(today, date);
  if (days === 0) return { kind: "today", label: "D-DAY", days };
  if (days > 0) return { kind: "future", label: `D-${days}`, days };
  return { kind: "past", label: "지남", days };
}

/** 오늘 이후(오늘 포함)만, 가까운 순. 같은 날이면 저장 순서. */
export function upcomingDDays(ddays: DDay[], today: string): DDay[] {
  return ddays
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.date >= today)
    .sort((a, b) => (a.d.date < b.d.date ? -1 : a.d.date > b.d.date ? 1 : a.i - b.i))
    .map(({ d }) => d);
}

export function nearestDDay(ddays: DDay[], today: string): DDay | null {
  return upcomingDDays(ddays, today)[0] ?? null;
}

/** "11월 7일" — 연도는 올해가 아닐 때만. Intl 을 쓰지 않는다(06 §4.5). */
export function formatDDayDate(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = `${m}월 ${d}일`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${y}년 ${base}`;
}

export type MemberRow = { id: string; name: string; group_role: "leader" | "member"; is_group_head: boolean };

/**
 * 멤버 목록 순서 — 목장장 → 리더 → 청년, 각각 이름순. 이름 비교는 코드포인트(가나다 순과 같다) —
 * localeCompare 는 서버와 브라우저가 다를 수 있다.
 */
export function sortMembers<T extends MemberRow>(rows: T[]): T[] {
  const rank = (r: MemberRow) => (r.group_role === "leader" ? (r.is_group_head ? 0 : 1) : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * 편집 가능한 사람 — 자기 목장 리더(명단 기준, leadsGroup), 그리고 '내리기' 권한의 목사님(02 §4).
 * 운영자는 2026-11-26 뺐다(사용자 결정) — 운영자 겸 리더는 리더로서 자기 목장만 고친다.
 * DB 정책(group_profiles_update)과 같은 규칙이다 — 화면은 보여줄지를 정하고, 데이터베이스가 내줄지를 정한다.
 */
export function canEditProfile(me: { leadsGroup: boolean; groupId: string | null; role: string }, groupId: string): boolean {
  return (me.leadsGroup && me.groupId === groupId) || me.role === "pastor";
}

export function isEmptyProfile(b: ProfileBlocks): boolean {
  return !b.intro && !b.freeText && b.ddays.length === 0 && b.themeSongs.length === 0;
}

export type ProfileInput = {
  /** 목장 요절(2026-11-14) — 청년부 프로필은 보내지 않는다 */
  verse?: string;
  intro: string;
  freeText: string;
  ddays: { title: string; date: string }[];
  themeSongs: { title: string; url: string }[];
};

export type NormalizedProfile =
  | { ok: true; value: ProfileBlocks }
  | { ok: false; message: string };

/**
 * 편집 폼 → 저장할 값. 빈 줄은 버리고, 반쯤 채운 줄은 막는다(제목만 있고 날짜 없음 등 — 조용히
 * 버리면 쓴 사람이 모른다). 서버 액션과 폼이 같은 함수를 쓴다.
 */
export function normalizeProfileInput(input: ProfileInput): NormalizedProfile {
  const verse = (input.verse ?? "").trim();
  const intro = input.intro.trim();
  const freeText = input.freeText.trim();
  if (verse.length > PROFILE_LIMITS.verse) return { ok: false, message: `요절 말씀은 ${PROFILE_LIMITS.verse}자까지입니다.` };
  if (intro.length > PROFILE_LIMITS.intro) return { ok: false, message: `소개는 ${PROFILE_LIMITS.intro}자까지입니다.` };
  if (freeText.length > PROFILE_LIMITS.freeText) return { ok: false, message: `자유 글은 ${PROFILE_LIMITS.freeText}자까지입니다.` };

  const ddays: DDay[] = [];
  for (const row of input.ddays) {
    const title = row.title.trim();
    const date = row.date.trim();
    if (!title && !date) continue;
    if (!title) return { ok: false, message: `디데이 ${date} 의 제목이 없습니다.` };
    if (!DATE_RE.test(date)) return { ok: false, message: `디데이 '${title}' 의 날짜를 골라 주세요.` };
    if (title.length > PROFILE_LIMITS.ddayTitle) return { ok: false, message: `디데이 제목은 ${PROFILE_LIMITS.ddayTitle}자까지입니다.` };
    ddays.push({ title, date });
  }
  if (ddays.length > PROFILE_LIMITS.ddays) return { ok: false, message: `디데이는 ${PROFILE_LIMITS.ddays}개까지입니다.` };

  const themeSongs: ThemeSong[] = [];
  for (const row of input.themeSongs) {
    const title = row.title.trim();
    const url = row.url.trim();
    if (!title && !url) continue;
    if (!title) return { ok: false, message: "찬양 제목이 없습니다." };
    if (!url) return { ok: false, message: `'${title}' 의 링크가 없습니다.` };
    if (!URL_RE.test(url)) return { ok: false, message: `'${title}' 의 링크는 http:// 또는 https:// 로 시작해야 합니다.` };
    if (title.length > PROFILE_LIMITS.songTitle) return { ok: false, message: `찬양 제목은 ${PROFILE_LIMITS.songTitle}자까지입니다.` };
    if (url.length > PROFILE_LIMITS.url) return { ok: false, message: `'${title}' 의 링크가 너무 깁니다.` };
    themeSongs.push({ title, url });
  }
  if (themeSongs.length > PROFILE_LIMITS.themeSongs) return { ok: false, message: `테마 찬양은 ${PROFILE_LIMITS.themeSongs}개까지입니다.` };

  // 요절은 목장 프로필만 보낸다 — 안 보냈으면(청년부 프로필) 값에도 넣지 않는다
  return { ok: true, value: { ...(input.verse !== undefined ? { verse: verse || null } : {}), intro: intro || null, freeText: freeText || null, ddays, themeSongs } };
}
