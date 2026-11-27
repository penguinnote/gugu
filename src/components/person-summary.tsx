import type { ReactNode } from "react";

import { CARD, ICON, SectionHead } from "@/components/ui";
import { rateText, RECENT_WEEKS, type BandMark, type PersonSummary } from "@/lib/person-summary";
import { formatWeekDate } from "@/lib/week";

/**
 * 사람별 기록 정리 카드(2026-11-16) — AI 없이 코드로(lib/person-summary). 사람 화면의 맨 위, 주별 기록 위.
 *   출석 띠(최근 26주) · 숫자 넷(예배 최근 4주 · 6개월, 목장 모임, 연락) · 연속 결석 · 사유 모음 · 기도제목 모음
 * 해석 문장은 없다 — 모은 것만 보인다. 사유 · 기도제목은 셋까지 보이고 나머지는 '더 보기'(details — 화면 쪽 코드 없이).
 */

const SHOW = 3;

const BAND: Record<BandMark, { cls: string; label: string }> = {
  onsite: { cls: "bg-[var(--gg-leaf)]", label: "현장" },
  online: { cls: "border-2 border-[var(--gg-leaf)] bg-[var(--gg-card)]", label: "온라인" },
  absent: { cls: "bg-[#f2b8bd]", label: "결석" },
  none: { cls: "bg-[var(--gg-stone-soft)]", label: "기록 없음" },
  skipped: { cls: "border border-dashed border-[var(--gg-stone)] bg-transparent", label: "휴주" },
  before: { cls: "bg-transparent", label: "들어오기 전" },
};

export function PersonSummaryCard({ summary }: { summary: PersonSummary }) {
  const s = summary;
  const stats: [string, string][] = [
    [`예배 · ${RECENT_WEEKS}주`, rateText(s.worshipRecent)],
    ["예배 · 6개월", rateText(s.worship)],
    ["목장 모임", rateText(s.meeting)],
    ["리더 연락", rateText(s.contact)],
  ];
  return (
    <section className={`${CARD} space-y-4 p-4`} aria-labelledby="summary-title" data-testid="person-summary">
      <SectionHead id="summary-title" icon={ICON.history} tint="sky" title="한눈에 보기" />

      <div className="space-y-2">
        <ol className="flex gap-[3px]" aria-label="최근 26주 예배 출석" data-testid="summary-band">
          {s.band.map((b) => (
            <li key={b.week} title={`${formatWeekDate(b.week)} · ${BAND[b.mark].label}`} aria-label={`${formatWeekDate(b.week)} ${BAND[b.mark].label}`} className={`h-5 min-w-0 flex-1 rounded-[3px] ${BAND[b.mark].cls}`} data-mark={b.mark} />
          ))}
        </ol>
        <div className="flex items-center justify-between text-[11.5px] text-muted">
          <span>{s.band[0] ? formatWeekDate(s.band[0].week) : ""}</span>
          <span className="flex items-center gap-2.5">
            {(["onsite", "online", "absent"] as const).map((m) => (
              <span key={m} className="flex items-center gap-1">
                <span aria-hidden className={`inline-block size-2.5 rounded-[2px] ${BAND[m].cls}`} />
                {BAND[m].label}
              </span>
            ))}
          </span>
          <span>{s.band.at(-1) ? formatWeekDate(s.band.at(-1)!.week) : ""}</span>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-1.5 text-center" data-testid="summary-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[var(--gg-field)] px-1 py-2.5">
            <dt className="text-[11.5px] leading-tight text-muted">{label}</dt>
            <dd className="mt-1 text-[17px] font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {s.absentRun >= 2 ? (
        <p className="rounded-xl bg-[var(--gg-sun-soft)] px-3 py-2 text-[13.5px] font-semibold text-[var(--gg-sun-ink)]" data-testid="summary-run">
          예배 {s.absentRun}주 연속 결석
        </p>
      ) : null}

      {s.reasons.length > 0 ? (
        <Block title="빠진 사유" testId="summary-reasons" items={s.reasons.map((r) => ({ key: `${r.week}-${r.kind}`, week: r.week, tag: r.kind, text: r.text }))} />
      ) : null}
      {s.prayers.length > 0 ? <Block title="기도제목" testId="summary-prayers" items={s.prayers.map((p) => ({ key: p.week, week: p.week, text: p.text }))} pray /> : null}
    </section>
  );
}

type Item = { key: string; week: string; tag?: string; text: string };

function Block({ title, items, testId, pray = false }: { title: string; items: Item[]; testId: string; pray?: boolean }) {
  const row = (it: Item): ReactNode => (
    <li key={it.key} className="flex gap-3 py-2" data-testid={`${testId}-item`}>
      <span className="w-[52px] shrink-0 pt-px text-[12.5px] font-semibold text-muted tabular-nums">{formatWeekDate(it.week).replace("월 ", "/").replace("일", "")}</span>
      <p className={`min-w-0 flex-1 text-[14px] leading-relaxed break-keep ${pray ? "gg-text" : ""}`}>
        {it.tag ? <span className="mr-1.5 text-[12.5px] font-bold text-[var(--gg-stone-ink)]">{it.tag}</span> : null}
        {it.text}
      </p>
    </li>
  );
  return (
    <div data-testid={testId}>
      <h3 className="text-[13px] font-bold text-[var(--gg-section)]">
        {title} <span className="font-semibold text-muted tabular-nums">{items.length}</span>
      </h3>
      <ul className="divide-y divide-dashed divide-[var(--gg-line)]">{items.slice(0, SHOW).map(row)}</ul>
      {items.length > SHOW ? (
        <details className="group">
          <summary className="cursor-pointer list-none py-1.5 text-[13px] font-bold text-[var(--gg-sky-ink)] group-open:hidden">더 보기 ({items.length - SHOW})</summary>
          <ul className="divide-y divide-dashed divide-[var(--gg-line)] border-t border-dashed border-[var(--gg-line)]">{items.slice(SHOW).map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}
