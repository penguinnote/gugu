"use client";

import { useMemo, useState } from "react";

import { bookWeeks, shareText, weekShort, type Book, type BookRow, type Mark } from "@/lib/attendance-book";

/**
 * 넓은 화면 출석부(2026-11-27, 1024px 이상) — 사람이 줄, 주가 열인 한 장짜리 표. 휴대폰 출석부(목장별로 접힌 표)와 같은 계산(lib/attendance-book)을 그대로 쓴다.
 *   휴대폰 출석부와 같은 정보만 보인다 — 회원 자격 · 온라인 비율 강조(노랑)는 화면에 두지 않고 엑셀에만(2026-11-16 결정, 2026-11-27 다시 확인).
 *   온라인 비율 값 자체는 휴대폰 '온라인' 칸처럼 보인다(2026-11-27 사용자)
 *   위     요약 타일 — 최근 주 예배 출석(현장 · 온라인) · 목장 수 · 명단 수
 *   표 위  출석부 두 가지(현장 예배 · 현장 + 온라인) · 목장 고르기 · 이름 찾기 · 범례
 *   표     목장 · 이름 열은 옆으로 밀어도 왼쪽에 붙어 있고, 오른쪽 끝 출석률 · 온라인 비율(휴대폰 '출석' · '온라인' 칸과 같은 값)도 붙어 있다. 주는 최근 주부터.
 *          칸은 현(연두) · 온(하늘) · 결(분홍) · 보고서 없는 주는 점선 빈칸 · 출석을 세지 않는 사람은 회색 · 휴주는 노란 열(빈칸)
 *          현장 예배 출석부에서는 온라인도 결석으로 센다(휴대폰과 같다)
 */
type Col = { week: string; index: number | null };

/** 최근 주 — 기록이 하나라도 있는 가장 최근 주(이번 주 보고서가 아직 없으면 그 앞 주) */
export function latestWeek(book: Book): { week: string; onsite: number; online: number } | null {
  const rows = book.groups.flatMap((g) => g.rows);
  for (let i = book.weeks.length - 1; i >= 0; i--) {
    const marks = rows.map((r) => r.marks[i]);
    if (marks.some((m) => m === "onsite" || m === "online" || m === "absent")) {
      return { week: book.weeks[i], onsite: marks.filter((m) => m === "onsite").length, online: marks.filter((m) => m === "online").length };
    }
  }
  return null;
}

/** 온라인 비율 — 휴대폰 출석부의 '온라인' 칸과 같은 값(온라인 ÷ 현장 + 온라인, 출석이 없으면 0%, 세지 않는 사람은 '-'). 어느 출석부든 같다 */
export function onlineRate(r: BookRow): string {
  return shareText(r.onlineShare ?? (r.off ? null : 0));
}

/** 출석률 — 휴대폰 출석부의 '출석' 칸과 같은 값(출석 ÷ 기록 있는 주, 세지 않는 사람은 '-') */
export function attendRate(r: BookRow, both: boolean): string {
  const here = both ? r.onsite + r.online : r.onsite;
  const known = r.onsite + r.online + r.absent;
  return shareText(known ? here / known : r.off ? null : 0);
}

/** 표의 주 열 — 시작 주부터 이번 주까지 휴주도 끼워(빈 열), 최근 주부터 */
export function weekColumns(book: Book, skipped: string[]): Col[] {
  if (!book.start) return [];
  const at = new Map(book.weeks.map((w, i) => [w, i]));
  const skip = new Set(skipped);
  return bookWeeks(book.start, book.end)
    .filter((w) => at.has(w) || skip.has(w))
    .map((w) => ({ week: w, index: at.get(w) ?? null }))
    .reverse();
}

export function AttendanceWide({ book, skipped, thisWeek }: { book: Book; skipped: string[]; thisWeek: string }) {
  const [both, setBoth] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const cols = useMemo(() => weekColumns(book, skipped), [book, skipped]);
  const latest = useMemo(() => latestWeek(book), [book]);
  const people = book.groups.reduce((n, g) => n + g.rows.length, 0);
  const k = q.replace(/\s+/g, "");
  const groups = book.groups
    .filter((g) => !group || g.id === group)
    .map((g) => ({ ...g, rows: k ? g.rows.filter((r) => r.name.includes(k)) : g.rows }))
    .filter((g) => g.rows.length > 0);
  const TAB = (on: boolean) => `h-9 rounded-full px-4 text-[14px] font-bold transition-colors ${on ? "bg-[var(--gg-leaf)] text-[var(--gg-on-sky)]" : "text-muted hover:text-foreground"}`;

  return (
    <div className="space-y-4" data-testid="att-wide">
      <div className="grid grid-cols-3 gap-3" data-testid="att-tiles">
        <Tile label="최근 주 예배 출석" value={latest ? `${latest.onsite + latest.online}명` : "-"} sub={latest ? `${weekShort(latest.week)} · 현장 ${latest.onsite} · 온라인 ${latest.online}` : ""} />
        <Tile label="목장" value={`${book.groups.length}곳`} sub="" />
        <Tile label="명단" value={`${people}명`} sub="" />
      </div>

      <div className="overflow-hidden rounded-[22px] bg-[var(--gg-card)] shadow-[var(--gg-card-shadow)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--gg-line)] px-4 py-3">
          <div role="tablist" className="flex gap-1 rounded-full bg-[var(--gg-field)] p-1">
            <button type="button" role="tab" aria-selected={!both} onClick={() => setBoth(false)} className={TAB(!both)} data-testid="attw-onsite">
              현장 예배
            </button>
            <button type="button" role="tab" aria-selected={both} onClick={() => setBoth(true)} className={TAB(both)} data-testid="attw-both">
              현장 + 온라인
            </button>
          </div>
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="목장 고르기" className="h-10 rounded-full bg-[var(--gg-field)] px-4 text-[14px] font-semibold outline-none" data-testid="attw-group">
            <option value="">모든 목장</option>
            {book.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} 목장
              </option>
            ))}
          </select>
          <label className="flex h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-full bg-[var(--gg-field)] px-4">
            <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 찾기" aria-label="이름 찾기" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted" data-testid="attw-search" />
          </label>
          <Legend both={both} />
        </div>

        {groups.length === 0 ? (
          <p className="py-10 text-center text-[15px] text-muted">찾는 이름이 없어요</p>
        ) : (
          // isolate — 붙어 있는 열이 화면 위 머리 위로 올라타지 않게 이 안에서만 쌓는다
          <div className="isolate overflow-x-auto overscroll-x-contain" data-testid="attw-table">
            <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] tabular-nums">
              <thead>
                <tr className="text-[12px] text-[var(--gg-section)]">
                  <th className={`${STICK} left-0 w-[88px] min-w-[88px] px-4 text-left`}>목장</th>
                  <th className={`${STICK} left-[88px] w-[112px] min-w-[112px] border-r border-[var(--gg-line)] px-3 text-left`}>이름</th>
                  {cols.map((c) => (
                    <th key={c.week} className={`h-10 min-w-10 px-1 text-center font-semibold whitespace-nowrap ${c.index === null ? "bg-[var(--gg-row-todo)] text-[var(--gg-sun-ink)]" : "bg-[var(--gg-card)]"}`} data-testid={c.index === null ? "attw-skip-head" : undefined}>
                      <span className="block leading-tight">{c.week === thisWeek ? "이번 주" : weekShort(c.week)}</span>
                      {c.index === null ? <span className="block text-[10.5px] leading-tight">휴주</span> : null}
                    </th>
                  ))}
                  <th className={`${STICK_R} right-[76px] w-[76px] min-w-[76px] border-l border-[var(--gg-line)] px-2`}>출석</th>
                  <th className={`${STICK_R} right-0 w-[76px] min-w-[76px] px-2`}>온라인</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) =>
                  g.rows.map((r, ri) => <Row key={r.id} r={r} groupName={ri === 0 ? g.name : ""} first={ri === 0} cols={cols} both={both} />),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

const STICK = "sticky z-[2] h-10 bg-[var(--gg-card)] font-semibold";
const STICK_R = "sticky z-[2] h-10 bg-[var(--gg-card)] text-center font-semibold";

function Row({ r, groupName, first, cols, both }: { r: BookRow; groupName: string; first: boolean; cols: Col[]; both: boolean }) {
  const line = first ? "border-t border-[var(--gg-line)]" : "";
  return (
    <tr data-testid="attw-row">
      <td className={`sticky left-0 z-[1] h-10 w-[88px] min-w-[88px] bg-[var(--gg-card)] px-4 text-[12.5px] font-semibold text-[var(--gg-section)] ${line}`}>{groupName}</td>
      <th scope="row" className={`sticky left-[88px] z-[1] h-10 w-[112px] min-w-[112px] border-r border-[var(--gg-line)] bg-[var(--gg-card)] px-3 text-left font-semibold whitespace-nowrap ${line}`}>
        {r.name}
        {r.off ? <span className="ml-1.5 rounded-full bg-[var(--gg-stone-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--gg-stone-ink)]">{r.off}</span> : null}
      </th>
      {cols.map((c) => (
        <td key={c.week} className={`h-10 px-1 text-center ${line} ${c.index === null ? "bg-[var(--gg-row-todo)]" : ""}`}>
          {c.index === null ? null : <Cell m={r.marks[c.index]} both={both} off={r.off} />}
        </td>
      ))}
      <td className={`sticky right-[76px] z-[1] h-10 w-[76px] min-w-[76px] border-l border-[var(--gg-line)] bg-[var(--gg-card)] px-2 text-center font-semibold ${line}`} data-testid="attw-count">
        {attendRate(r, both)}
      </td>
      <td className={`sticky right-0 z-[1] h-10 w-[76px] min-w-[76px] bg-[var(--gg-card)] px-2 text-center font-semibold ${line}`} data-testid="attw-online">
        {onlineRate(r)}
      </td>
    </tr>
  );
}

const BOX = "mx-auto grid size-7 place-items-center rounded-[9px] text-[12px] font-bold";
/** 한 칸 — 현(연두) · 온(하늘) · 결(분홍) · 보고서 없음(점선) · 세지 않음(회색). 현장 예배 출석부에서는 온라인도 결석 */
function Cell({ m, both, off }: { m: Mark | null; both: boolean; off: string | null }) {
  if (m === null) return <span aria-label="기록 없음" className={`${BOX} border border-dashed border-[#d5d9df]`} />;
  if (m === "off") return <span aria-label={`출석 제외 ${off ?? ""}`} className={`${BOX} bg-[var(--gg-stone-soft)]`} />;
  if (m === "onsite") return <span aria-label="현장" className={`${BOX} bg-[var(--gg-sky)] text-[var(--gg-on-sky)]`}>현</span>;
  if (m === "online" && both) return <span aria-label="온라인" className={`${BOX} bg-[var(--gg-online-cell)] text-[#2b5a85]`}>온</span>;
  return <span aria-label={m === "online" ? "온라인(현장 결석)" : "결석"} className={`${BOX} bg-[var(--gg-berry-soft)] text-[var(--gg-berry-ink)]`}>결</span>;
}

function Legend({ both }: { both: boolean }) {
  const item = (cls: string, text: string, label: string) => (
    <span className="flex items-center gap-1">
      <span className={`grid size-5 place-items-center rounded-[6px] text-[10.5px] font-bold ${cls}`}>{text}</span>
      {label}
    </span>
  );
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--gg-section)]" data-testid="attw-legend">
      {item("bg-[var(--gg-sky)] text-[var(--gg-on-sky)]", "현", "현장")}
      {both ? item("bg-[var(--gg-online-cell)] text-[#2b5a85]", "온", "온라인") : null}
      {item("bg-[var(--gg-berry-soft)] text-[var(--gg-berry-ink)]", "결", both ? "결석" : "결석 · 온라인")}
      {item("border border-dashed border-[#d5d9df]", "", "보고서 없음")}
      {item("bg-[var(--gg-stone-soft)]", "", "세지 않음")}
      {item("bg-[var(--gg-row-todo)]", "", "휴주")}
    </div>
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
