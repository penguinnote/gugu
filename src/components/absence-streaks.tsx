import Link from "next/link";

import { CARD_LIST, CARD_ROW, IconCard, ROW_TAG } from "@/components/toss";
import type { AbsenceStreak } from "@/lib/absence-streaks";
import { groupLabel } from "@/lib/labels";
import { formatWeekLabel } from "@/lib/week";

/**
 * 연속 결석(2026-11-17 — 목사님 화면에만). 돌봄 사각지대 아래. 예배를 2주 이상 연속 빠진 분을 컨택과 상관없이 —
 * 오른쪽에 몇 주째인지 · 그동안 리더 컨택이 있었는지. 누르면 그 사람 기록.
 */
export function AbsenceStreakSection({ people }: { people: AbsenceStreak[] }) {
  return (
    <IconCard id="absence-streaks-title" icon="/icons/tossface/u1F4C5.svg" title="연속 결석" aside={people.length ? <span className="text-[14px] font-semibold text-muted tabular-nums">{people.length}명</span> : null} testId="absence-streaks">
      {people.length === 0 ? (
        <p className="pb-1 text-[14px] text-muted">2주 이상 연속으로 빠진 분이 없어요.</p>
      ) : (
        <ul className={CARD_LIST}>
          {people.map((p) => (
            <li key={p.id} data-testid="absence-streak">
              <Link href={`/groups/people/${p.id}`} className={CARD_ROW}>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{p.name}</p>
                  <p className="text-[12.5px] text-[var(--gg-hint)]">
                    {groupLabel(p.group)} · {formatWeekLabel(p.since)}부터
                  </p>
                </div>
                {/* 두 줄로(2026-11-18) — 말이 길어져 한 줄이면 왼쪽 목장 · 날짜가 접혔다. 글자로 읽을 때는 사이에 ' · ' */}
                <span className={`${ROW_TAG} flex flex-col items-end leading-snug`}>
                  <span>{p.weeks}주 연속</span>
                  <span className="sr-only"> · </span>
                  <span className={p.contacted ? "text-[var(--gg-sky-ink)]" : "text-[var(--gg-berry-ink)]"}>{p.contacted ? "개별 연락으로 교제함" : "개별 연락으로 교제 없음"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </IconCard>
  );
}
