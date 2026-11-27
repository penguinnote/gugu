import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * 인증 데이터 접근 계층 (DAL).
 *
 * Next.js 문서는 권한 검사를 프록시가 아니라 **데이터에 가까운 곳**에서
 * 하라고 말한다. 프록시는 모든 경로에서 돌기 때문에 DB 조회를 넣으면 안 되고,
 * 낙관적 확인 이상을 맡겨서도 안 된다.
 *
 * 그래서 실제 판정은 여기서 한다. 그리고 여기서도 마지막 방어선은 아니다 —
 * 진짜 강제는 DB 의 RLS 다. 이 계층은 "화면을 보여줄지" 를 정하고,
 * "데이터를 내줄지" 는 데이터베이스가 정한다.
 *
 * 역할 4단계 — 앱 사용자는 리더·목사님·운영자뿐이다. 청년은 앱을 쓰지 않는다(2026-09-27).
 *   pending  미승인 — 신청 화면만(청년부 프로필은 2026-11-26 지웠다) (신청 전·승인 대기 중인 리더)
 *   leader   리더   — 자기 목장 주간기록
 *   pastor   목사님 — 전체
 *   admin    운영자 — 관리 · 신청 승인
 */

type Enums = Database["public"]["Enums"];
export type Role = Enums["user_role"];

export type UserContext = {
  userId: string;
  /** 계정 프로필 이름. 명단 이름이 있으면 그것이 우선이다(displayName) */
  name: string;
  /** 명단(persons) 이름. 연결 전에는 null */
  personName: string | null;
  /** 화면에 보일 이름 — 명단 이름 우선. 이 앱에서 사람을 식별하는 기준은 명단이다 */
  displayName: string;
  role: Role;
  /** 계정에 기록된 제공자 (참고용) */
  provider: Enums["auth_provider"] | null;
  /** 이번 세션이 실제로 어느 제공자로 로그인됐는가. 알 수 없으면 null */
  sessionProvider: Enums["auth_provider"] | null;
  /** 명단과 연결되지 않았으면(pending·목사님·운영자) null */
  personId: string | null;
  groupId: string | null;
  groupNumber: number | null;
  groupName: string | null;
  groupRole: Enums["group_role"] | null;
  isGroupHead: boolean;
  /**
   * 리더로서 자기 목장에 접근하는가 — 명단이 기준이다. role 이 leader 또는 admin 이고
   * 연결된 사람이 그 목장의 리더일 때. 운영자도 명단상 리더면 자기 목장 보고서를 쓴다.
   * DB 의 is_leader_of() 와 같은 규칙이다.
   */
  leadsGroup: boolean;
  /** 가장 최근 신청의 상태. 신청한 적 없으면 null */
  applicationStatus: Enums["application_status"] | null;
  pendingPersonName: string | null;
  pendingGroupNumber: number | null;
  pendingGroupName: string | null;
  /** 대기 중(또는 가장 최근) 신청의 역할 — 리더 · 목사님 · 임원진(2026-10-30). 신청한 적 없으면 null */
  pendingRole: Role | null;
  /**
   * 임원진(2026-10-30) — 전체 명단을 보고 내보낸다. 목장 리더도 맡았으면 role 은 leader 그대로 이것만 참,
   * 리더가 아니면 role = officer. DB 의 is_officer() 와 같다.
   */
  isOfficer: boolean;
  /** 첫 접속 동의(2026-11-13)의 문구 버전. 아직 안 했으면 null — requireUser 가 /terms 로 보낸다 */
  termsVersion: string | null;
};

const APP_ROLES: Role[] = ["leader", "pastor", "admin", "officer"];

/**
 * 로그인한 본인의 역할·소속.
 *
 * auth 세션은 있는데 앱 계정이 아직 없는 경우(첫 로그인 직후 콜백을 거치지
 * 않은 요청)에는 ensure_user() 로 만들고 다시 읽는다. 가입 자체는 막지
 * 않으므로 여기서 만들어도 문제없다 — pending 은 아무것도 못 본다.
 */
/** 한 요청 안에서 한 번만 묻는다(2026-11-06) — 탭 레이아웃(탭바에 목장 탭을 둘지)과 화면이 같이 부른다 */
export const getUserContext = cache(loadUserContext);

async function loadUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();

  // getUser() 는 토큰을 서버에서 검증한다. getSession() 은 쿠키를 그대로
  // 믿으므로 권한 판정에 쓰면 안 된다.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let { data } = await supabase.rpc("current_user_context");
  if (!data || data.length === 0) {
    const { error } = await supabase.rpc("ensure_user");
    if (error) return null;
    ({ data } = await supabase.rpc("current_user_context"));
  }
  if (!data || data.length === 0) return null;

  const r = data[0];
  const sp = user.app_metadata?.provider;
  const sessionProvider = sp === "kakao" || sp === "google" ? sp : null;
  return {
    userId: r.user_id,
    name: r.name,
    personName: r.person_name ?? null,
    displayName: r.person_name ?? r.name,
    role: r.role,
    provider: r.provider ?? null,
    sessionProvider,
    personId: r.person_id ?? null,
    groupId: r.group_id ?? null,
    groupNumber: r.group_number ?? null,
    groupName: r.group_name ?? null,
    groupRole: r.group_role ?? null,
    isGroupHead: r.is_group_head ?? false,
    leadsGroup:
      (r.role === "leader" || r.role === "admin") && r.group_role === "leader" && r.group_id != null,
    applicationStatus: r.application_status ?? null,
    pendingPersonName: r.pending_person_name ?? null,
    pendingGroupNumber: r.pending_group_number ?? null,
    pendingGroupName: r.pending_group_name ?? null,
    pendingRole: r.pending_role ?? null,
    isOfficer: r.role !== "pending" && (r.is_officer ?? false),
    termsVersion: r.terms_version ?? null,
  };
}

/** 로그인만 돼 있으면 된다. pending 도 통과한다. */
export async function requireUser(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect("/login");
  // 첫 접속 동의(2026-11-13) — 지금 문구에 동의하기 전에는 어느 화면도 열지 않는다(신청 화면 포함)
  if (ctx.termsVersion !== TERMS_VERSION) redirect("/terms");
  return ctx;
}

/** 승인된 사용자. pending 은 신청 화면으로 보낸다. */
export async function requireAppUser(): Promise<UserContext> {
  const ctx = await requireUser();
  if (!APP_ROLES.includes(ctx.role)) redirect("/apply");
  return ctx;
}

/**
 * 특정 역할만 들어올 수 있는 화면.
 *
 * 권한이 없으면 403 이 아니라 **404** 다. 원래 근거는 "청년에게 출석·보고서의 존재를
 * 숨긴다" 였고, 청년이 앱을 쓰지 않게 된 뒤(2026-09-27)에도 미승인 계정에게 같은 이유로
 * 유지한다 — 403 은 "거기 뭔가 있다" 를 알려주는 셈이고, 한 가지 방식으로만 답하는 편이
 * 단순하다. 로그인 자체가 안 돼 있으면 로그인으로 보낸다.
 */
/** 휴주를 정할 수 있는가 — 운영자 · 목사님 · 임원진(리더 겸 포함, 2026-11-14). DB 의 can_manage_weeks() 와 같다 */
export function canManageWeeks(me: Pick<UserContext, "role" | "isOfficer">): boolean {
  return me.role === "admin" || me.role === "pastor" || me.isOfficer;
}

/** 휴주 화면 · 저장 — 정할 수 없으면 404 */
export async function requireWeeksManager(): Promise<UserContext> {
  const me = await requireAppUser();
  if (!canManageWeeks(me)) notFound();
  return me;
}

export async function requireRole(...roles: Role[]): Promise<UserContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.role)) notFound();
  return ctx;
}

/**
 * 주간기록·보고서 화면. 명단상 리더(role leader·admin)와 목사님만.
 * 명단에서 리더가 아닌 운영자는 404 다 — 운영자 권한으로는 본문을 못 본다.
 */
export async function requireReportAccess(): Promise<UserContext> {
  const ctx = await requireUser();
  if (!(ctx.leadsGroup || ctx.role === "pastor")) notFound();
  return ctx;
}

/** 목사님 화면. 목사님만 — 운영자도 404 (본문을 못 보는 원칙). */
export async function requirePastor(): Promise<UserContext> {
  return requireRole("pastor");
}

/**
 * 내보내기(2026-10-14) — 목사님은 전체 목장, 명단상 리더는 자기 목장만. 그 외 404.
 * ownGroup 이 있으면 그 목장 하나로 범위를 묶는다(log_export 도 같은 규칙으로 막는다).
 */
export async function requireExport(): Promise<{ me: UserContext; ownGroup: string | null }> {
  const me = await requireUser();
  if (me.role === "pastor") return { me, ownGroup: null };
  if (me.leadsGroup && me.groupId) return { me, ownGroup: me.groupId };
  notFound();
}

/**
 * 로그인한 사람의 첫 화면. `/`·`/login`·OAuth 콜백이 전부 이 규칙 하나를 쓴다.
 *   pending → /apply (탭바 없음)   그 외 → / (홈 탭 — 리더는 보고서, 목사님은 제출 현황, 운영자는 자리표시)
 */
/** 목장 탭이 있는가 — 목장을 맡은 리더만. 목사님 · 운영자 · 임원진(리더 아님)은 목장이 없다(2026-11-06 사용자 결정) */
export function hasGroupTab(ctx: Pick<UserContext, "role" | "leadsGroup"> | null): boolean {
  return !!ctx && ctx.leadsGroup; // 운영자 겸 리더도(2026-11-10 사용자 요청 — 역할이 admin 이라 목장 탭이 빠졌다)
}

export function homeFor(ctx: UserContext): string {
  if (ctx.role === "pending") return "/apply";
  // 1단계(2026-09-29)부터 도착지는 홈 탭 `/` 하나다. 역할별 내용은 홈이 가른다(app/(tabs)/page.tsx).
  return "/";
}
