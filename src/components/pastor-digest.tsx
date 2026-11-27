import Link from "next/link";

import { CARD_LIST, CARD_ROW, IconCard, ROW_TAG } from "@/components/toss";
import { groupLabel } from "@/lib/labels";
import { PRAYER_LONG_WEEKS, type GroupNote, type PrayerFlow } from "@/lib/pastor-digest-data";

/**
 * 목사님 주간 정리 v1(2026-11-05) — 제출 현황(/pastor) 아래의 두 칸. 사각지대 변화는 사각지대 칸 안에 있다.
 *
 *   기도제목   "기도제목 N개" · 처음 낸 분 수 · 연속 4주 이상 낸 분(이름 · 목장 · 연속 n주 · 이번 주 제목 두 줄)
 *              '연속' 은 기도제목을 낸 주가 이어진 것이다 — 같은 내용인지는 보지 않는다(prayer_streaks)
 *   특이사항   목장 보고서의 특이사항, 목장 번호 순. 누르면 그 목장 보고서
 *
 * 사각지대 칸과 같은 모양 — 토스페이스 머리 카드 안에 줄 목록(2026-11-11 UI 통일). 붉은색 · 경고 없이 사실만.
 */
export function PrayerFlowSection({ flow }: { flow: PrayerFlow }) {
  return (
    <IconCard
      id="prayer-flow-title"
      icon="/icons/tossface/u1F64F.svg"
      title={`기도제목 ${flow.total}개`}
      sub={flow.firstEver > 0 ? `처음 낸 분 ${flow.firstEver}명` : undefined}
      testId="prayer-flow"
    >
      {flow.long.length > 0 ? (
        <ul className={CARD_LIST}>
          {flow.long.map((p) => (
            <li key={p.personId} data-testid="prayer-long">
              <Link href={`/groups/people/${p.personId}`} className={`${CARD_ROW} !items-start`}>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[15px] font-semibold">
                    {p.name}
                    <span className="ml-1.5 text-[12.5px] font-normal text-[var(--gg-hint)]">{groupLabel(p.groupName)}</span>
                  </p>
                  <p className="line-clamp-2 text-[13px] leading-snug text-[var(--gg-hint)]">{p.text}</p>
                </div>
                <span className={`${ROW_TAG} pt-0.5`}>연속 {p.weeks}주</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : flow.total > 0 ? (
        <p className="text-[14px] text-[var(--gg-hint)]">연속 {PRAYER_LONG_WEEKS}주 넘게 낸 기도제목은 없습니다.</p>
      ) : null}
    </IconCard>
  );
}

export function GroupNotesSection({ notes, weekKey }: { notes: GroupNote[]; weekKey: string }) {
  if (notes.length === 0) return null;
  return (
    <IconCard id="group-notes-title" icon="/icons/tossface/u1F4DD.svg" title={`특이사항 ${notes.length}곳`} testId="group-notes">
      <ul className={CARD_LIST}>
        {notes.map((n) => (
          <li key={n.groupName}>
            <Link
              href={`/pastor/reports/${encodeURIComponent(n.groupName)}?week=${weekKey}`}
              prefetch={false}
              className={`${CARD_ROW} !items-start`}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] font-semibold">{groupLabel(n.groupName)}</p>
                <p className="line-clamp-3 text-[13px] leading-snug whitespace-pre-line text-[var(--gg-hint)]">{n.note}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </IconCard>
  );
}
