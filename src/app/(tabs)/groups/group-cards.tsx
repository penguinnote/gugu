import Link from "next/link";

import { TossCard } from "@/components/toss";
import { GuguSays } from "@/components/ui";
import { ddayState, nearestDDay, type DDay } from "@/lib/group-profile";
import { groupLabel } from "@/lib/labels";

export type GroupCard = {
  id: string;
  name: string;
  leaders: number;
  members: number;
  intro: string | null;
  ddays: DDay[];
};

/**
 * L-5 전체 목장 — 12장. 명단 순서 그대로(목사님이 훑는 순서), 우리 목장만 표시를 붙인다.
 * 한 줄: 이름 · 오른쪽 리더 n · 양 m, 아래 회색 줄에 가장 가까운 디데이 · 소개. 순위·점수는 없다.
 * 토스 결(2026-11-11 UI 통일 — 예전엔 두 줄 카드 격자) — 흰 카드 하나에 줄로, '기록' 탭과 같다. 우리 목장 줄은 옅은 라임.
 */
export function GroupCards({ groups, myGroupId, today }: { groups: GroupCard[]; myGroupId: string | null; today: string }) {
  if (groups.length === 0) {
    return (
      <GuguSays mood="sleepy" size={72} lines={["아직 목장이 없어요."]} />
    );
  }
  return (
    <TossCard>
      <ul className="-mb-3 pt-1.5" data-testid="group-cards">
        {groups.map((g) => {
          const near = nearestDDay(g.ddays, today);
          const mine = g.id === myGroupId;
          return (
            <li key={g.id}>
              <Link
                href={`/groups/${encodeURIComponent(g.name)}`}
                className={`block px-6 py-3 ${mine ? "bg-[var(--gg-sky-soft)]" : ""}`}
                aria-current={mine ? "true" : undefined}
              >
                <p className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[17px] font-semibold">{groupLabel(g.name)}</span>
                  {mine ? <span className="shrink-0 rounded-full bg-[var(--gg-card)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--gg-sky-ink)]">우리 목장</span> : null}
                  <span className="ml-auto shrink-0 text-[13.5px] text-[var(--gg-hint)] tabular-nums">
                    리더 {g.leaders} · 양 {g.members}
                  </span>
                </p>
                {near || g.intro ? (
                  <p className="mt-0.5 truncate text-[13.5px] text-[var(--gg-hint)]">
                    {near ? (
                      <span className="font-semibold text-[var(--gg-sun-ink)]">
                        {ddayState(near.date, today).label} {near.title}
                      </span>
                    ) : null}
                    {near && g.intro ? " · " : null}
                    {g.intro}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </TossCard>
  );
}
