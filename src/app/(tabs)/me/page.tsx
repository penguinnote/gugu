import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { ProfileHeader, PROFILE_BTN } from "@/components/profile/profile-header";
import { TossCard, TossSection } from "@/components/toss";
import { PROVIDER_LABELS } from "@/lib/auth/providers";
import { requireAppUser } from "@/lib/auth/session";
import { memberRoleLabel, USER_ROLE_LABELS, groupLabel } from "@/lib/labels";
import { loadMyProfile } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

import { ProfileEditSheet } from "./profile-edit-sheet";

export const metadata: Metadata = {
  title: "내 정보 · 구구",
};

/**
 * 로그인 확인용 화면. pending 은 requireAppUser() 가 신청 화면으로 보낸다.
 *
 * 앱 사용자는 리더·목사님·운영자뿐이다(2026-09-27). 승인 관리 링크는 운영자에게만.
 * 2026-11-11 인스타처럼: 맨 위 프로필(사진 · 숫자 칸 · 소개 · 말씀 · 관심사 · 프로필 편집) → 계정 카드 → 운영(운영자). 알림 · 로그아웃은 '전체' 로 옮겼다.
 */
export default async function MePage() {
  const me = await requireAppUser();

  // 이름은 명단 이름이 우선이다. 계정 프로필 이름은 명단과 다를 때만 보조로 보인다.
  // 로그인 방법은 이번 세션의 제공자만 믿는다 — 알 수 없으면 줄을 빼는 편이 틀린 표시보다 낫다.
  const rows: Array<[string, string]> = [
    ["이름", me.personName && me.personName !== me.name ? `${me.personName} (계정: ${me.name})` : me.displayName],
    // 임원진을 겸한 리더는 역할이 leader 그대로라 '리더' 만 보였다(2026-11-12)
    ["권한", me.isOfficer && me.role === "leader" ? `${USER_ROLE_LABELS.leader} · 임원진` : USER_ROLE_LABELS[me.role]],
  ];
  if (me.sessionProvider) rows.push(["로그인 방법", PROVIDER_LABELS[me.sessionProvider]]);
  rows.push(["소속 목장", me.groupName ? groupLabel(me.groupName) : "해당 없음"]);
  if (me.groupRole) {
    rows.push(["목장에서", memberRoleLabel(me.groupRole, me.isGroupHead)]);
  }

  // 내 프로필(2026-11-11 인스타처럼) — 사진 · 숫자 칸 · 소개 · 말씀 · 관심사, '프로필 편집' 은 아래에서 목록
  const supabase = await createClient();
  const profile = await loadMyProfile(supabase, me);
  const canApprove = me.role === "admin";

  return (
    <>
    <AppHeader back="/all" />
    <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-6 px-5 pt-1 pb-8">
      <ProfileHeader
        p={profile}
        actions={
          <>
            <ProfileEditSheet hasPhoto={Boolean(profile.photoUrl)} />
            {me.groupName ? (
              <Link href={`/groups/${encodeURIComponent(me.groupName)}`} className={PROFILE_BTN}>
                {groupLabel(me.groupName)}
              </Link>
            ) : null}
          </>
        }
      />

      {/* 계정 — 이름 · 권한 · 로그인 방법 · 소속(알림은 2026-11-11 '전체 → 알림'(/me/push) 으로 옮겼다) */}
      <TossCard>
        <TossSection id="account-title" title="계정">
          <dl className="px-6 pb-1">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[15px] text-[var(--gg-hint)]">{label}</dt>
                <dd className="text-right text-[15px] font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </TossSection>
      </TossCard>

      {me.role === "leader" && !me.leadsGroup ? (
        <p className="rounded-2xl bg-[var(--gg-field)] px-5 py-4 text-sm leading-relaxed text-muted">
          소속 목장이 없습니다. 휴면 상태이거나 아직 배정되지 않았습니다. 운영자에게 문의해 주세요.
        </p>
      ) : null}

      {/* '주간기록' 은 홈의 '지난 보고서' 와 같은 곳이라 뺐다(2026-11-05) */}
      {canApprove ? (
        <Link href="/admin" className="gg-btn gg-btn-white">
          운영
        </Link>
      ) : null}

    </main>
    </>
  );
}
