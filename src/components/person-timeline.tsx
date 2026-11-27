import { GuguSays } from "@/components/ui";
import { attendanceText, contactText, type TimelineRecord } from "@/lib/person-timeline";
import { formatWeekLabel } from "@/lib/week";

/**
 * 사람 상세의 기록 타임라인 — 최근 주가 위. 비어 있으면 조는 구구가 그렇다고 한마디.
 * 구구 테마 — 카드 안에 들어가므로 테두리 없이 점선으로 주를 가르고, 왼쪽 점 하나로 그 주에 왔는지(잎) 아닌지(돌)를 보인다.
 */
/** 기록이 없는 주(2026-11-06) — 휴주이거나 그 주 보고서에 이 사람 기록이 없다(미제출 · 다른 목장이던 때 등) */
export type TimelineGap = { week_key: string; skipped: boolean };

export function PersonTimeline({ records, gaps = [] }: { records: TimelineRecord[]; gaps?: TimelineGap[] }) {
  if (records.length === 0) {
    return (
      <GuguSays mood="sleepy" size={72} lines={["이 기간 기록이 없어요."]} />
    );
  }
  const rows = [...records.map((r) => ({ week: r.week_key, r })), ...gaps.map((g) => ({ week: g.week_key, g }))].sort((a, b) =>
    a.week < b.week ? 1 : a.week > b.week ? -1 : 0,
  );
  return (
    <ul className="divide-y divide-dashed divide-[var(--gg-line)]">
      {rows.map((row) => {
        if ("g" in row) {
          return (
            <li key={`gap-${row.week}`} className="flex gap-3 py-3 first:pt-1 last:pb-0" data-testid="timeline-gap">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-[var(--gg-line)]" />
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--gg-section)]">{formatWeekLabel(row.week)}</span>
                <span className="text-right text-xs text-muted">{row.g.skipped ? "휴주" : "기록 없음"}</span>
              </div>
            </li>
          );
        }
        const r = row.r;
        const contact = contactText(r);
        const came = r.worship_attended || r.group_meeting_attended;
        return (
          <li key={r.id} className="flex gap-3 py-3 first:pt-1 last:pb-0" data-testid="timeline-row">
            <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${came ? "bg-[var(--gg-leaf)]" : "bg-[var(--gg-stone)]"}`} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">
                  {formatWeekLabel(r.week_key)}
                  {r.otherGroupName ? <span className="ml-1.5 text-xs font-normal text-muted">{r.otherGroupName} 목장</span> : null}
                </span>
                <span className={`text-right text-xs font-semibold ${came ? "text-[var(--gg-leaf-ink)]" : "text-muted"}`}>
                  {attendanceText(r)}
                  {contact ? ` · ${contact}` : ""}
                </span>
              </div>
              {r.reason ? <p className="text-xs leading-relaxed text-muted">사유 · {r.reason}</p> : null}
              {r.prayer_request ? (
                <p className="gg-text rounded-xl bg-[var(--gg-stone-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--gg-stone-ink)]">{r.prayer_request}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
