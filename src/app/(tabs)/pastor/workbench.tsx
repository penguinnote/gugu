import Link from "next/link";
import type { ReactNode } from "react";

import { CARD_LIST, CARD_ROW, IconCard } from "@/components/toss";
import { BTN, Chevron, GuguSays, ICON, Icon, Pill, type Tint } from "@/components/ui";
import { attendanceLabel, fromFlags, type Attendance } from "@/lib/attendance";
import { blindSpotTag, lastSeenLine, type BlindSpotPerson } from "@/lib/blind-spots";
import { GROUP_ROLE_LABELS, groupLabel } from "@/lib/labels";
import { benchHref, nextUnchecked, stepSubmitted, type BenchGroup, type BenchState } from "@/lib/pastor-review";
import { formatKstWhen, formatWeekLabel } from "@/lib/week";

import type { ReportBody } from "./report-data";
import { attendanceTotals } from "./report-data";
import { BenchKeys, ReviewPanel, type ReviewActions } from "./review-panel";

/** 왼쪽 칸 한 줄 — 목장 하나 */
export type BenchRow = { name: string; state: BenchState; submittedAt: string | null; isLate: boolean; submitter: string | null; streak: string | null };
/** 가운데 칸 — 고른 목장 */
export type BenchSelected =
  | { kind: "none" }
  | { kind: "missing"; name: string }
  | ({ kind: "report"; name: string; reportId: string; submittedAt: string; isLate: boolean; submitter: string | null; note: string | null } & ReportBody);
export type BenchTiles = { submitted: number; total: number; remaining: string; late: number; checked: number; unchecked: number; care: number | null; careRange: string | null };

// 출석 알약 빛 — 휴대폰 상세(reports/[group])와 같다
function attTint(a: Attendance): Tint {
  if (a.worship === "absent") return "stone";
  return a.worship === "in_person" && !a.meetingOff ? "sky" : "sun";
}

const STATE_PILL: Record<"submitted" | "late" | "checked" | "missing", { tint: Tint; label: string }> = {
  submitted: { tint: "sky", label: "제출" },
  late: { tint: "stone", label: "지각" },
  checked: { tint: "leaf", label: "확인" },
  missing: { tint: "sun", label: "미제출" },
};
const pillOf = (r: BenchRow) => STATE_PILL[r.state === "missing" ? "missing" : r.state === "checked" ? "checked" : r.isLate ? "late" : "submitted"];

/**
 * 넓은 화면 제출 현황(2026-11-27, 1024px 이상 — 목사님 주간 검토 작업대). 휴대폰 배치와 같은 데이터로 그리고 CSS 로 바꿔 보인다(1024px 아래는 display:none).
 *   머리   제목 '제출 현황' · 고른 주 · 오른쪽에 주 이동(지난 주도 언제든) · 구구에게 물어보기(챗봇 입구가 있을 때만)
 *   타일   제출 · 한마디 남김(미확인) · 챙김이 필요한 양 — 지금 화면이 쓰는 숫자만(새가족 수는 지금 화면에 없어 뺐다)
 *   세 칸  왼쪽 목장 목록(미확인 · 확인됨 · 미제출) · 가운데 고른 목장 보고서 · 오른쪽 도장과 한마디 · 이 목장의 챙김 · 지난 기도제목 · 사람별 기록
 *          1024~1279px 은 오른쪽 칸을 가운데 칸 아래로(두 칸)
 * 고른 목장은 주소 ?g= 에 남는다(새로 고침 · 뒤로 가기). 목장을 고르면 그때 읽음이 남는다(휴대폰 상세를 여는 것과 같다) — 그래서 목록 링크는 미리 불러오지 않는다.
 * 순서(order)는 제출 현황 본문(main, 1024px 이상 grid) 안의 자리: 머리 · 타일 1 → AI 정리 2(바깥) → 세 칸 3 → 나머지 4~
 */
export function Workbench({
  basePath,
  weekKey,
  thisWeek,
  now,
  weekNav,
  gugu,
  skipped,
  rows,
  tiles,
  selected,
  care,
  reviewActions,
}: {
  basePath: string;
  weekKey: string;
  thisWeek: string;
  now: Date;
  weekNav: ReactNode;
  gugu: boolean;
  skipped: { reason: string | null } | null;
  rows: BenchRow[];
  tiles: BenchTiles;
  selected: BenchSelected;
  /** 고른 목장의 챙김이 필요한 양 — 판정 전이면 null(칸을 그리지 않는다) */
  care: BlindSpotPerson[] | null;
  reviewActions?: ReviewActions;
}) {
  const groups: BenchGroup[] = rows.map((r) => ({ name: r.name, state: r.state }));
  const cur = selected.kind === "none" ? null : selected.name;
  const href = (g: string | null) => (g ? benchHref(basePath, weekKey, thisWeek, g) : null);
  const next = href(stepSubmitted(groups, cur, 1));
  const prev = href(stepSubmitted(groups, cur, -1));
  const unchecked = href(nextUnchecked(groups, cur));

  return (
    <>
      <header className="hidden items-end justify-between gap-4 lg:order-1 lg:col-span-2 lg:flex" data-testid="bench-head">
        <div className="min-w-0 space-y-1">
          <h1 className="gg-display text-[28px] leading-tight">제출 현황</h1>
          <p className="text-[14px] text-muted">{formatWeekLabel(weekKey)} 목장보고서</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {weekNav}
          {gugu ? (
            <Link href="/gugu" className={`${BTN("white", "sm")} !h-9 !px-3 !text-[14px]`} data-testid="bench-gugu">
              구구에게 물어보기
            </Link>
          ) : null}
        </div>
      </header>

      {skipped ? (
        // GuguSays 는 바탕이 flex 라 hidden 을 함께 주지 않는다(둘 다 바탕 클래스면 어느 쪽이 이길지 CSS 차례에 달렸다) — 감싼 칸이 숨는다
        <div className="hidden lg:order-1 lg:col-span-2 lg:block" data-testid="bench-skipped">
          <GuguSays mood="sleepy" size={72} lines={["이번 주는 휴주예요.", ...(skipped.reason ? [skipped.reason] : [])]} />
        </div>
      ) : (
        <div className="hidden gap-3 lg:order-1 lg:col-span-2 lg:grid lg:grid-cols-3" data-testid="bench-tiles">
          <Tile label="제출" value={`${tiles.submitted} / ${tiles.total}곳`} sub={`${tiles.remaining}${tiles.late > 0 ? ` · 지각 ${tiles.late}` : ""}`} />
          <Tile label="한마디 남김" value={`${tiles.checked}곳`} sub={`미확인 ${tiles.unchecked}곳`} />
          {tiles.care !== null ? <Tile label="챙김이 필요한 양" value={`${tiles.care}명`} sub={tiles.careRange ?? ""} /> : null}
        </div>
      )}

      {skipped ? null : (
        <div
          id="bench"
          className="hidden scroll-mt-[calc(var(--nn-safe-top)+64px)] gap-5 lg:order-3 lg:col-span-2 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start xl:grid-cols-[280px_minmax(0,1fr)_320px]"
          data-testid="bench"
        >
          <GroupList rows={rows} current={cur} hrefOf={(g) => benchHref(basePath, weekKey, thisWeek, g)} now={now} />

          <div className="min-w-0 lg:col-start-2">
            {selected.kind === "report" ? (
              <ReportColumn s={selected} now={now} prev={prev} next={next} />
            ) : selected.kind === "missing" ? (
              <section className="space-y-4 rounded-[22px] bg-[var(--gg-card)] p-5 shadow-[var(--gg-card-shadow)]" data-testid="bench-missing">
                <h2 className="gg-display text-[24px] leading-tight">{groupLabel(selected.name)}</h2>
                <GuguSays mood="sleepy" size={64} lines={[formatWeekLabel(weekKey), "아직 제출 전이에요."]} />
              </section>
            ) : (
              <section className="space-y-4 rounded-[22px] bg-[var(--gg-card)] p-6 shadow-[var(--gg-card-shadow)]" data-testid="bench-empty">
                <GuguSays size={64} lines={["왼쪽에서 목장을 골라요."]} />
                {unchecked ? (
                  <Link href={unchecked} replace scroll={false} prefetch={false} className={`${BTN("sky", "sm")} w-full`}>
                    미확인 목장부터 보기
                  </Link>
                ) : null}
              </section>
            )}
          </div>

          <div className="min-w-0 space-y-4 lg:col-start-2 xl:sticky xl:top-[calc(var(--nn-safe-top)+68px)] xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100dvh-var(--nn-safe-top)-84px)] xl:overflow-y-auto xl:overscroll-contain">
            {selected.kind === "report" ? (
              <>
                <ReviewPanel
                  key={selected.reportId}
                  reportId={selected.reportId}
                  initialStamp={selected.review?.stamp ?? null}
                  initialNote={selected.review?.note ?? null}
                  next={next}
                  prev={prev}
                  unchecked={unchecked}
                  actions={reviewActions}
                />
                <SideCards s={selected} care={care} />
              </>
            ) : (
              <BenchKeys selected={cur} next={next} prev={prev} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-1 rounded-[20px] bg-[var(--gg-card)] px-5 py-4 shadow-[var(--gg-card-shadow)]">
      <p className="text-[13px] font-semibold text-[var(--gg-section)]">{label}</p>
      <p className="gg-display text-[26px] leading-none tabular-nums">{value}</p>
      <p className="truncate text-[12.5px] text-muted tabular-nums">{sub}</p>
    </div>
  );
}

const SECTIONS: { state: BenchState; title: string }[] = [
  { state: "unchecked", title: "미확인" },
  { state: "checked", title: "확인됨" },
  { state: "missing", title: "미제출" },
];

function GroupList({ rows, current, hrefOf, now }: { rows: BenchRow[]; current: string | null; hrefOf: (g: string) => string; now: Date }) {
  return (
    <nav
      aria-label="목장"
      className="overflow-hidden rounded-[22px] bg-[var(--gg-card)] py-2 shadow-[var(--gg-card-shadow)] lg:sticky lg:top-[calc(var(--nn-safe-top)+68px)] lg:row-span-2 lg:max-h-[calc(100dvh-var(--nn-safe-top)-84px)] lg:overflow-y-auto lg:overscroll-contain xl:row-span-1"
      data-testid="bench-groups"
    >
      {SECTIONS.map(({ state, title }) => {
        const list = rows.filter((r) => r.state === state);
        if (list.length === 0) return null;
        return (
          <section key={state} aria-label={title} data-testid={`bench-${state}`}>
            <h2 className="flex items-baseline justify-between px-5 pt-2.5 pb-1 text-[12.5px] font-semibold text-[var(--gg-hint)]">
              {title}
              <span className="tabular-nums">{list.length}곳</span>
            </h2>
            <ul className="space-y-0.5 px-2">
              {list.map((r) => {
                const on = r.name === current;
                const pill = pillOf(r);
                return (
                  <li key={r.name}>
                    <Link
                      href={hrefOf(r.name)}
                      replace
                      scroll={false}
                      prefetch={false}
                      aria-current={on ? "true" : undefined}
                      className={`flex items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 transition-colors ${on ? "bg-[var(--gg-sky-soft)]" : "hover:bg-[var(--gg-tile)]"}`}
                      data-testid="bench-row"
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-[15px] ${r.state === "unchecked" ? "font-bold" : "font-semibold"} ${on ? "text-[var(--gg-nav-ink)]" : ""}`}>{groupLabel(r.name)}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {r.submittedAt ? `${formatKstWhen(r.submittedAt, now)}${r.submitter ? ` · ${r.submitter}` : ""}` : (r.streak ?? "")}
                        </span>
                      </span>
                      <Pill tint={pill.tint} className="!h-6 shrink-0 !px-2 !text-[11.5px]">
                        {pill.label}
                      </Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function ReportColumn({ s, now, prev, next }: { s: Extract<BenchSelected, { kind: "report" }>; now: Date; prev: string | null; next: string | null }) {
  const t = attendanceTotals(s.persons, s.rowByPerson);
  const step = `${BTN("white", "sm")} !h-9 !px-3 !text-[13.5px]`;
  return (
    <article className="space-y-4 rounded-[22px] bg-[var(--gg-card)] p-5 shadow-[var(--gg-card-shadow)]" data-testid="bench-report">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="gg-display text-[24px] leading-tight">{groupLabel(s.name)}보고서</h2>
          <p className="text-[13.5px] text-muted">
            {formatKstWhen(s.submittedAt, now)} 제출{s.submitter ? ` · ${s.submitter}` : ""}
            {s.isLate ? " · 지각 제출" : ""}
          </p>
        </div>
        <nav className="flex shrink-0 items-center gap-1.5" aria-label="이전 · 다음 목장">
          {prev ? (
            <Link href={prev} replace scroll={false} prefetch={false} className={step} data-testid="bench-prev">
              <Icon d={ICON.back} className="h-4 w-4" strokeWidth={2.4} />
              이전 목장
            </Link>
          ) : (
            <span aria-hidden className={`${step} opacity-40`}>
              <Icon d={ICON.back} className="h-4 w-4" strokeWidth={2.4} />
              이전 목장
            </span>
          )}
          {next ? (
            <Link href={next} replace scroll={false} prefetch={false} className={step} data-testid="bench-next">
              다음 목장
              <Chevron className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden className={`${step} opacity-40`}>
              다음 목장
              <Chevron className="h-4 w-4" />
            </span>
          )}
        </nav>
      </header>

      <div className="flex flex-wrap gap-1.5" data-testid="bench-totals">
        <Pill tint="sky" className="tabular-nums">{`예배 ${t.worship}명${t.online > 0 ? ` (온라인 ${t.online})` : ""}`}</Pill>
        <Pill tint="leaf" className="tabular-nums">{`목장 모임 ${t.meeting}명`}</Pill>
        <Pill tint="lilac" className="tabular-nums">{`개별 연락 ${t.contacted}명`}</Pill>
        <Pill tint="stone" className="tabular-nums">{`명단 ${t.total}명`}</Pill>
      </div>

      <ol className="divide-y divide-[var(--gg-line)] border-t border-[var(--gg-line)]">
        {s.persons.map((p) => {
          const r = s.rowByPerson.get(p.id);
          const att = r ? fromFlags(r.worship_attended ?? false, r.group_meeting_attended ?? false, r.worship_online ?? false) : null;
          const reason = r ? (r.online_reason ?? r.meeting_absent_reason ?? r.absent_reason) : null;
          return (
            <li key={p.id} className="grid grid-cols-[10.5rem_minmax(0,1fr)] items-start gap-4 py-3" data-testid="bench-person">
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="w-full truncate text-[15.5px] font-bold">
                  {p.name}
                  <span className="ml-1.5 text-[12px] font-normal text-muted">{GROUP_ROLE_LABELS[p.group_role]}</span>
                </span>
                <Pill tint={att ? attTint(att) : "stone"} className="!h-6 !px-2 !text-[11.5px]">
                  {att ? attendanceLabel(att) : "미입력"}
                </Pill>
                {r?.one_on_one_contacted ? (
                  <Pill tint="lilac" className="!h-6 !px-2 !text-[11.5px]">
                    개별 연락
                  </Pill>
                ) : null}
              </span>
              <span className="min-w-0 space-y-1">
                {reason ? <span className="block text-[13.5px] leading-relaxed text-muted">사유 · {reason}</span> : null}
                {r?.prayer_request ? <span className="gg-text block text-[15px] leading-relaxed">{r.prayer_request}</span> : null}
                {!reason && !r?.prayer_request ? <span className="block text-[13px] text-[var(--gg-hint)]">—</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {s.note ? (
        <section className="space-y-1.5 rounded-[18px] bg-[var(--gg-tile)] p-4">
          <h3 className="gg-display text-[16px]">특이사항</h3>
          <p className="gg-text text-[15px] leading-relaxed">{s.note}</p>
        </section>
      ) : null}
      {s.markFailed ? <p className="text-xs text-muted">읽음을 남기지 못했습니다.</p> : null}
    </article>
  );
}

function SideCards({ s, care }: { s: Extract<BenchSelected, { kind: "report" }>; care: BlindSpotPerson[] | null }) {
  const prevPrayers = s.persons.flatMap((p) => {
    const pv = s.prev.get(p.id);
    return pv ? [{ id: p.id, name: p.name, ...pv }] : [];
  });
  return (
    <>
      {care ? (
        <IconCard icon="/icons/tossface/u1F440.svg" title="챙김이 필요한 양" aside={`${care.length}명`} testId="bench-care">
          {care.length === 0 ? (
            <p className="text-[14px] text-[var(--gg-hint)]">이 목장은 없어요.</p>
          ) : (
            <ul className={CARD_LIST}>
              {care.map((p) => (
                <li key={p.person_id} className={CARD_ROW}>
                  <span className="text-[15px] font-bold">{p.name}</span>
                  <span className="min-w-0 text-right text-[12px] text-muted">
                    <span className="block font-semibold text-[var(--gg-sun-ink)]">{blindSpotTag(p)}</span>
                    <span className="block truncate">{lastSeenLine(p)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </IconCard>
      ) : null}
      {prevPrayers.length > 0 ? (
        <IconCard icon="/icons/tossface/u1F64F.svg" title="지난 기도제목" testId="bench-prev-prayers">
          <ul className="space-y-2.5">
            {prevPrayers.map((p) => (
              <li key={p.id} className="text-[13.5px] leading-relaxed">
                <span className="font-bold">{p.name}</span>
                <span className="gg-pill mx-1.5 !h-5 bg-[var(--gg-lilac-soft)] !px-1.5 !text-[10.5px] text-[var(--gg-lilac-ink)]">{p.weeksAgo === 1 ? "지난주" : `${p.weeksAgo}주 전`}</span>
                <span className="gg-text text-[var(--gg-section)]">{p.text}</span>
              </li>
            ))}
          </ul>
        </IconCard>
      ) : null}
      <IconCard icon="/icons/tossface/u1F4C8.svg" title="사람별 기록 보기" testId="bench-people">
        <ul className="flex flex-wrap gap-1.5">
          {s.persons.map((p) => (
            <li key={p.id}>
              <Link href={`/groups/people/${p.id}`} prefetch={false} className="gg-pill !h-8 bg-[var(--gg-tile)] !px-3 text-[13px] font-semibold text-[var(--gg-section)] hover:bg-[var(--gg-tile-press)]">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </IconCard>
    </>
  );
}
