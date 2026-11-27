import type { UserContext } from "@/lib/auth/session";

/**
 * '전체' 탭(2026-11-10) — 홈의 바로가기 칸을 없애고 갈 곳을 모두 여기 모은다(토스 '전체' 화면처럼).
 * 묶음 제목 아래 한 줄에 하나 — 왼쪽 아이콘(토스페이스 원본, public/icons/tossface) · 이름 · 오른쪽 회색 글씨(키워드를 ' · ' 로).
 * 갈 곳은 전부 이미 있는 화면이고, 각 화면이 자기 권한을 다시 본다(require*()). 여기서 빼는 것은 "들어가도 404 인 곳" 을 보여주지 않기 위해서다.
 *
 *   명단상 리더   목장(우리 목장 명단 · 돌봄 사각지대 · 지난 보고서 · 내보내기 · 전체 명단 · 목장 프로필) · 로뎀 월드(상점 · 내 모습 꾸미기) · (운영자 겸임이면 운영: 승인 · 운영) · 나(내 정보 · 알림)
 *   목사님        보고서(보고서 · 내보내기 기록) · 명단(전체 명단 · 명단 고치기 · 목장 프로필) · 로뎀 월드 · 나(내 정보 · 알림)
 *   운영자        운영(운영 홈 · 승인 · 휴주 · 알림 현황 · 내보내기 기록) · 명단(명단 · 전체 명단 · 명단 고치기 · 목장 프로필) · 로뎀 월드 · 나(내 정보 · 알림)
 *   출석부 · 캠퍼스 모임(2026-11-16) — 운영자 · 목사님 · 임원진의 명단(· 임원진) 묶음
 *   임원진        명단(전체 명단 · 목장 프로필) · 로뎀 월드 · 나(내 정보 — 받는 알림이 없다)
 * 승인 대기가 있으면 '승인' 아이콘에 빨간 숫자(운영자 · 운영자 겸 리더).
 */
export type MenuIcon = "people" | "profile" | "history" | "export" | "report" | "write" | "admin" | "approve" | "calendar" | "bell" | "me" | "shop" | "dress" | "eyes" | "door" | "sprout" | "hourglass" | "gugu" | "trend" | "tree" | "key" | "clipboard" | "pray" | "sleep" | "hand";
export type MenuItem = { href: string; label: string; icon: MenuIcon; hint: string; /** 넓은 화면 왼쪽 레일(768~1023px)의 아이콘 아래 짧은 이름(2026-11-27). 없으면 label */ short?: string; badge?: number; /** 회색 글씨 대신 붉은 글씨 */ warn?: boolean; testid?: string; /** 누르면 가지 않고 하는 일 — logout: 확인 창 뒤 로그아웃(2026-11-11) */ action?: "logout" };
export type MenuSection = { title: string; items: MenuItem[] };

/** 아이콘 → 토스페이스 원본 파일(이름도 원본 그대로 — 고치지 않는다) */
export const MENU_ICON: Record<MenuIcon, string> = {
  people: "/icons/tossface/u1F465.svg",
  profile: "/icons/tossface/u1F3E1.svg",
  history: "/icons/tossface/u1F5C3.svg",
  export: "/icons/tossface/u1F4E4.svg",
  report: "/icons/tossface/u1F4DD.svg",
  write: "/icons/tossface/u270F.svg",
  admin: "/icons/tossface/u2699.svg",
  approve: "/icons/tossface/u2705.svg",
  calendar: "/icons/tossface/u1F5D3.svg",
  bell: "/icons/tossface/u1F514.svg",
  me: "/icons/tossface/u1F464.svg",
  shop: "/icons/tossface/u1F6CD.svg",
  dress: "/icons/tossface/u1F455.svg",
  eyes: "/icons/tossface/u1F440.svg",
  door: "/icons/tossface/u1F6AA.svg",
  sprout: "/icons/tossface/u1F331.svg",
  hourglass: "/icons/tossface/u23F3.svg",
  gugu: "/icons/tossface/u2728.svg",
  trend: "/icons/tossface/u1F4C8.svg",
  tree: "/icons/tossface/u1F333.svg",
  key: "/icons/tossface/u1F511.svg",
  clipboard: "/icons/tossface/u1F4CB.svg",
  pray: "/icons/tossface/u1F64F.svg",
  sleep: "/icons/tossface/u1F4A4.svg",
  hand: "/icons/tossface/u1F64B.svg",
};

const ROSTER: MenuItem = { href: "/groups/roster", label: "전체 명단", short: "전체 명단", icon: "people", hint: "모든 목장 · 엑셀" };
const PROFILES: MenuItem = { href: "/groups/profiles", label: "목장 프로필", short: "프로필", icon: "profile", hint: "목장 소개 · 디데이 · 주제가" };
const MEMBERS: MenuItem = { href: "/groups/members", label: "명단 고치기", short: "명단 고치기", icon: "write", hint: "리더 · 양 더하기 · 고치기" };
// 내 모습 꾸미기 · 알림은 정보 탭에서 옮겨 왔다(2026-11-10 정보 탭을 빼며)
const SHOP: MenuSection = {
  title: "로뎀 월드",
  items: [
    // 월드 입구는 홈 그림에만 있었다(2026-11-12 전체에도)
    { href: "/world", label: "로뎀 월드", short: "월드", icon: "tree", hint: "마을 · 우리 집 · 함께 걷기" },
    { href: "/shop", label: "상점", icon: "shop", hint: "집 · 울타리 · 가구 · 꾸미기" },
    { href: "/world?open=dress", label: "내 모습 꾸미기", short: "꾸미기", icon: "dress", hint: "생김새 · 모자 · 소품" },
  ],
};
const PUSH_HINT: Partial<Record<UserContext["role"], string>> = { leader: "월요일 미제출 · 목장 이동 · 새가족", pastor: "수요일 정리 · 목장보고서 제출 · 목장 이동 · 새가족", admin: "새 신청" };
function meSection(role: UserContext["role"], leadsGroup: boolean): MenuSection {
  // 알림은 받는 역할에만 — 리더 아닌 임원진은 받는 알림이 없다(2026-11-05)
  const hint = leadsGroup && role !== "admin" ? PUSH_HINT.leader : PUSH_HINT[role];
  return {
    title: "나",
    items: [
      { href: "/me", label: "내 정보", icon: "me", hint: "프로필 · 계정" },
      ...(hint ? [{ href: "/me/push", label: "알림", icon: "bell" as const, hint }] : []),
      // 개인정보 · 동의(2026-11-13) — 동의 내역 · 내 AI 동의 · 처리방침. 내 정보에는 두지 않는다(사용자 결정)
      { href: "/me/consent", label: "개인정보 · 동의", short: "동의", icon: "key", hint: "동의 내역 · AI · 처리방침" },
      // 로그아웃(2026-11-11 내 정보에서 옮김) — 따로 화면 없이 누르면 확인 창
      { href: "/auth/signout", label: "로그아웃", icon: "door", hint: "이 기기에서", action: "logout" },
    ],
  };
}
/** 휴주 — 운영자 화면에만(2026-11-18 사용자 — 예전엔 목사님 · 임원진 메뉴에도 있었다) */
const WEEKS: MenuItem = { href: "/admin/weeks", label: "휴주", icon: "calendar", hint: "쉬는 주 정하기" };

/** 출석부 — 앱을 쓰는 사람 모두 · 캠퍼스 모임 — 앱을 쓰는 사람 모두(2026-11-26, 예전엔 운영자 · 목사님 · 임원진) */
const ATTENDANCE: MenuItem = { href: "/attendance", label: "출석부", icon: "clipboard", hint: "예배 출석 · 회원 · 엑셀" };
const CAMPUS: MenuItem = { href: "/campus", label: "캠퍼스 모임", short: "캠퍼스", icon: "sprout", hint: "캠퍼스별 명단" };

const approve = (pending: number): MenuItem => ({ href: "/approvals", label: "승인", icon: "approve", hint: "가입 · 챗봇 추가 신청", ...(pending > 0 ? { badge: pending } : {}) });

/** 내보내기 기록 — 운영자 · 목사님(2026-11-26 목사님도) */
const EXPORT_LOGS: MenuItem = { href: "/admin/exports", label: "내보내기 기록", short: "내보낸 기록", icon: "export", hint: "누가 · 언제" };
/** 운영 묶음 — 운영자 · 운영자 겸 리더가 같이 쓴다. 계정 권한은 운영 홈 안에만 있었다(2026-11-12 전체에도). 청년부 프로필은 2026-11-26 지웠다 */
const adminItems = (pending: number): MenuItem[] => [
  { href: "/admin", label: "운영 홈", short: "운영", icon: "admin", hint: "오늘 할 일 · 상태" },
  approve(pending),
  WEEKS,
  { href: "/admin/push", label: "알림 현황", short: "알림 현황", icon: "bell", hint: "보낸 알림 · 받는 사람" },
  EXPORT_LOGS,
  { href: "/admin/accounts", label: "계정 권한", short: "계정", icon: "key", hint: "목사님 · 임원진 · 잠그기" },
];
const ADMIN_PEOPLE: MenuItem = { href: "/admin/people", label: "명단", icon: "people", hint: "사람 · 역할 · 계정 · AI 제외" };
const ADMIN_NEW: MenuItem = { href: "/admin/people/new", label: "새 사람 추가", short: "새 사람", icon: "hand", hint: "명단에 사람 더하기" };
/** AI 동의 한꺼번에(2026-11-13) — 청년 동의서의 'AI 정리를 위한 해외 서버 사용' 항목을 걷은 뒤 여러 사람을 체크 */
const ADMIN_AI: MenuItem = { href: "/admin/people/ai-consent", label: "AI 동의", icon: "approve", hint: "동의한 사람 체크" };
/** 사람별 기록 — 사람을 누르면 바로 6개월 기록 · AI 요약(2026-11-12, 예전엔 명단 → 고치기 → 기록 보기) */
const peopleItem = (ai: boolean): MenuItem => ({ href: "/groups/people", label: "출석/기도제목 기록 보기", short: "사람별 기록", icon: "trend", hint: ai ? "AI 요약" : "최근 6개월" });

/**
 * 메뉴를 그릴 때 화면이 넘기는 것
 *   pending  승인 대기 수(가입 + 챗봇 추가 신청) · ai 구구 AI 켜짐(챗봇 · 받아쓰기 · 흐름 요약) · digest 목사님 AI 정리 켜짐 · week 이번 주(리더 '이번 주 보고서')
 */
export type MenuOptions = { pending?: number; ai?: boolean; digest?: boolean; week?: string };

/** 구구 챗봇(2026-11-12) — 전체 메뉴 맨 위. 구구 AI 가 켜져 있고 리더 · 목사님일 때만 */
const GUGU: MenuSection = { title: "구구", items: [{ href: "/gugu", label: "구구에게 물어보기", short: "구구", icon: "gugu", hint: "AI 챗봇", testid: "all-gugu" }] };

type MenuUser = Pick<UserContext, "role" | "leadsGroup"> & { isOfficer?: boolean };

export function allMenuFor(me: MenuUser, opts: MenuOptions = {}): MenuSection[] {
  const { pending = 0, ai = false } = opts;
  const sections = menuFor(me, { ...opts, pending, ai });
  return ai && (me.leadsGroup || me.role === "pastor") ? [GUGU, ...sections] : sections;
}

/**
 * 임원진을 겸한 리더(2026-11-12) — 역할은 leader 그대로라 메뉴가 리더와 똑같아 맡긴 것이 보이지 않았다.
 * 리더도 전체 명단은 본다. 임원진이 더 받는 것은 전체 명단 엑셀이라 전체 명단 줄을 '임원진' 칸으로 옮긴다(같은 화면 두 번 없이).
 */
const OFFICER: MenuSection = {
  title: "임원진",
  items: [{ ...ROSTER, hint: "모든 목장 · 전체 명단 엑셀", testid: "all-officer" }],
};

function menuFor(me: MenuUser, { pending = 0, ai = false, digest = false, week }: MenuOptions): MenuSection[] {
  if (me.leadsGroup) {
    // 묶음 순서(2026-11-15 사용자): 구구 → 목장 → 임원진(· 운영) → 로뎀 월드 → 나
    // 목장 안 순서: 우리 목장 명단을 맨 위로, 지난 보고서 ↔ 내보내기 자리 바꿈
    const sections: MenuSection[] = [
      {
        title: "목장",
        // 목장 탭의 메뉴를 모두 여기로(2026-11-11 — 목장 탭은 목장 프로필 화면이 됐다). 이번 주 보고서는 홈 카드에만 있었다(2026-11-12 전체에도)
        items: [
          { href: "/groups/members", label: "우리 목장 명단", short: "명단", icon: "clipboard", hint: "사람 더하기 · 고치기 · 상태" },
          ...(week ? [{ href: `/reports/${week}`, label: "이번 주 목장보고서", short: "보고서", icon: "report" as const, hint: "기도제목 붙여넣기" }] : []),
          { href: "/export", label: "내보내기", icon: "export", hint: "우리 목장 · 엑셀 · PDF" },
          peopleItem(ai),
          { href: "/groups/care", label: "챙김이 필요한 양", short: "챙김", icon: "eyes", hint: "결석 · 온라인" },
          // 출석부는 앱을 쓰는 사람 모두(2026-11-16)
          ATTENDANCE,
          // 캠퍼스 모임은 앱을 쓰는 사람 모두(2026-11-26) — 임원진 칸 · 운영 칸에서는 빼서 겹치지 않게
          CAMPUS,
          { href: "/reports", label: "지난 목장보고서", short: "지난 보고서", icon: "history", hint: "주차별 · 출석 · 기도제목" },
          ...(me.isOfficer && me.role !== "admin" ? [] : [ROSTER]),
          PROFILES,
        ],
      },
    ];
    if (me.isOfficer && me.role !== "admin") sections.push(OFFICER);
    if (me.role === "admin") sections.push({ title: "운영", items: [...adminItems(pending), ADMIN_PEOPLE, ADMIN_NEW, ADMIN_AI] });
    sections.push(SHOP);
    return [...sections, meSection(me.role, true)];
  }
  if (me.role === "pastor") {
    return [
      {
        // 제출 현황 화면의 칸들은 홈 카드로만 갈 수 있었다(2026-11-12 — 칸마다 바로 가는 줄)
        title: "목장보고서",
        items: [
          { href: "/pastor", label: "제출 현황", icon: "clipboard", hint: "미제출 · 제출됨 · 한마디" },
          ...(digest ? [{ href: "/pastor#ai", label: "AI 주간 정리", short: "AI 정리", icon: "gugu" as const, hint: "기도제목 · 특이사항 정리" }] : []),
          { href: "/pastor#prayers", label: "기도제목", icon: "pray", hint: "이번 주 모아 보기" },
          { href: "/pastor#care", label: "챙김이 필요한 양", short: "챙김", icon: "eyes", hint: "2주 결석 · 4주 불참" },
          // 연속 결석(2026-11-17) — 컨택과 상관없이 2주 이상
          { href: "/pastor#absences", label: "연속 결석", icon: "calendar", hint: "2주 이상 · 개별 연락 여부" },
          peopleItem(ai),
          { href: "/export", label: "목장보고서 내려받기", short: "내려받기", icon: "report", hint: "엑셀 · PDF · 인쇄" },
          EXPORT_LOGS,
        ],
      },
      { title: "명단", items: [ROSTER, ATTENDANCE, CAMPUS, MEMBERS, PROFILES] },
      SHOP,
      meSection(me.role, false),
    ];
  }
  if (me.role === "admin") {
    return [
      { title: "운영", items: adminItems(pending) },
      // 목장 탭이 없다(2026-11-06) — 명단 엑셀은 전체 명단 화면에 있다
      { title: "명단", items: [ADMIN_PEOPLE, ADMIN_NEW, ADMIN_AI, ROSTER, ATTENDANCE, CAMPUS, MEMBERS, PROFILES] },
      SHOP,
      meSection(me.role, false),
    ];
  }
  if (me.role === "officer") return [{ title: "명단", items: [ROSTER, PROFILES] }, { title: "임원진", items: [ATTENDANCE, CAMPUS] }, SHOP, meSection(me.role, false)];
  return [SHOP, meSection(me.role, false)];
}

/** 검색 — 이름 · 회색 글씨 · 묶음 제목에서 찾는다(띄어쓰기 무시). 빈 묶음은 뺀다 */
export function searchMenu(sections: MenuSection[], q: string): MenuSection[] {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const k = norm(q);
  if (!k) return sections;
  return sections
    .map((s) => ({ ...s, items: s.items.filter((it) => norm(`${it.label}${it.hint}${s.title}`).includes(k)) }))
    .filter((s) => s.items.length > 0);
}
