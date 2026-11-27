import Link from "next/link";

import { CARD_LIST, CARD_ROW, IconCard } from "@/components/toss";
import { Chevron } from "@/components/ui";
import { groupLabel } from "@/lib/labels";
import { formatWeekLabel } from "@/lib/week";

/** 한 줄 — 그 보고서 화면으로 간다. note 는 확인됨의 한마디(도장 이름) */
export type FeedbackRow = { report_id: string; week_key: string; group_name: string; is_late?: boolean; note?: string | null };
export type FeedbackBox = { rows: FeedbackRow[]; total: number; moreHref: string | null };

/** 처음에 보이는 수 · '더 보기' 한 번에 더하는 수 */
export const FEEDBACK_PAGE = 5;

const detailHref = (r: FeedbackRow) => `/pastor/reports/${encodeURIComponent(r.group_name)}?week=${r.week_key}`;

function Box({ title, icon, box, testId, hrefFor }: { title: string; icon: string; box: FeedbackBox; testId: string; hrefFor: (r: FeedbackRow) => string }) {
  return (
    <IconCard icon={icon} title={title} aside={`${box.total}개`} testId={testId}>
      {box.rows.length === 0 ? (
        <p className="px-4 pb-1 text-[14px] text-[var(--gg-hint)]">없어요.</p>
      ) : (
        <ul className={CARD_LIST}>
          {box.rows.map((r) => (
            <li key={r.report_id}>
              <Link href={hrefFor(r)} prefetch={false} className={CARD_ROW} data-testid="feedback-row">
                <span className="text-[15px] font-bold">{groupLabel(r.group_name)}</span>
                <span className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted">
                  <span className="truncate">
                    {formatWeekLabel(r.week_key)}
                    {r.is_late ? " · 지각" : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                  <Chevron className="h-4 w-4 shrink-0" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {box.moreHref ? (
        <Link href={box.moreHref} replace scroll={false} className="block px-4 pt-2 pb-1 text-center text-[14px] font-semibold text-[var(--gg-sky-ink)]" data-testid={`${testId}-more`}>
          더 보기
        </Link>
      ) : null}
    </IconCard>
  );
}

/**
 * 목장 보고서 피드백 현황(2026-11-26 사용자 — 예전 '아직 한마디를 안 남긴 목장보고서') — 제출된 보고서를 목사님 한마디(도장)로 나눈다.
 *   미확인  제출됐고 한마디가 아직 없는 보고서, 최근 주부터(unstamped_reports — 기간 제한 없이 나눠 부른다)
 *   확인됨  한마디를 남긴 보고서, 최근에 남긴 것부터
 * 누르면 그 보고서 화면. 한마디를 남기면 미확인에서 확인됨으로 옮겨 간다.
 */
export function FeedbackSection({
  pending,
  done,
  className = "",
  hrefFor = detailHref,
}: {
  pending: FeedbackBox;
  done: FeedbackBox;
  className?: string;
  /** 줄을 누르면 갈 곳 — 기본은 보고서 상세. 넓은 화면 제출 현황은 작업대(?week · ?g, 2026-11-27) */
  hrefFor?: (r: FeedbackRow) => string;
}) {
  if (pending.total === 0 && done.total === 0) return null;
  return (
    <section className={`space-y-3 ${className}`} data-testid="feedback">
      <h2 className="gg-display text-[20px] leading-tight">목장 보고서 피드백 현황</h2>
      <Box title="미확인" icon="/icons/tossface/u23F3.svg" box={pending} testId="feedback-pending" hrefFor={hrefFor} />
      <Box title="확인됨" icon="/icons/tossface/u2705.svg" box={done} testId="feedback-done" hrefFor={hrefFor} />
    </section>
  );
}
