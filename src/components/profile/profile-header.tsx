import type { ReactNode } from "react";

import { ProfileAvatar } from "./profile-avatar";

export type ProfileFacts = {
  /** 동그라미 색을 고르는 값 — 사람(person) id, 없으면 계정 id */
  seed: string;
  name: string;
  photoUrl: string | null;
  /** 이름 오른쪽 숫자 칸들(인스타의 게시물 · 팔로워 자리) — 목장 · 구분 · 훈련 단계 */
  stats: { label: string; value: string }[];
  bio: string | null;
  verse: string | null;
  interests: string[];
};

/**
 * 프로필 머리(2026-11-11 사용자 요청 — 인스타 그대로). 왼쪽 큰 동그라미(누르면 크게), 오른쪽 숫자 칸들,
 * 그 아래 이름 · 소개 · 좋아하는 말씀 · 관심사 알약, 맨 아래 단추 줄(내 것이면 '프로필 편집').
 */
export function ProfileHeader({ p, actions }: { p: ProfileFacts; actions?: ReactNode }) {
  return (
    <section className="space-y-3" data-testid="profile-header">
      <div className="flex items-center gap-5">
        <ProfileAvatar photoUrl={p.photoUrl} name={p.name} seed={p.seed} />
        <dl className="grid flex-1 grid-cols-3 text-center">
          {p.stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dd className="truncate text-[17px] font-bold">{s.value}</dd>
              <dt className="text-[12.5px] text-[var(--gg-hint)]">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-1.5">
        <h1 className="text-[17px] font-bold" data-testid="profile-name">
          {p.name}
        </h1>
        {p.bio ? (
          <p className="gg-text text-[15px] leading-relaxed whitespace-pre-wrap" data-testid="profile-bio">
            {p.bio}
          </p>
        ) : null}
        {p.verse ? (
          <p className="gg-text text-[14px] leading-relaxed text-[var(--gg-section)]" data-testid="profile-verse">
            📖 {p.verse}
          </p>
        ) : null}
        {p.interests.length ? (
          <p className="flex flex-wrap gap-1.5 pt-0.5" data-testid="profile-interests">
            {p.interests.map((t) => (
              <span key={t} className="rounded-full bg-[var(--gg-card)] px-2.5 py-1 text-[13px] font-semibold text-[var(--gg-section)] shadow-[var(--gg-card-shadow)]">
                #{t}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </section>
  );
}

/** 인스타의 단추(프로필 편집 · 목장 보기) — 바탕이 회색이라 흰 단추로 */
export const PROFILE_BTN = "flex h-9 flex-1 items-center justify-center rounded-[10px] bg-[var(--gg-card)] text-[14px] font-semibold shadow-[var(--gg-card-shadow)]";
