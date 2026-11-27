"use client";

import { useState } from "react";

import { shareText, weekShort, type Book, type BookRow } from "@/lib/attendance-book";

/**
 * 출석부 표(2026-11-16) — 위 단추로 현장 예배 출석부(기본) ↔ 현장 + 온라인 출석부를 바꾼다.
 * 목장은 접혀 있고 누르면 그 목장만 펼친다. 이름을 검색하면 맞는 사람만 목장과 함께 펼쳐 보인다.
 * 펼친 표는 이름 열이 붙어 있고, 그 옆에 출석률(출석 ÷ 기록 있는 주) · 온라인 비율, 그다음 주 열(최근 주부터)을 옆으로 민다.
 *   ● 현장 · ○ 온라인(현장 + 온라인에서만 출석) · 빨간 ● 결석(현장 예배 표에서는 온라인도) · 빈칸 보고서 없음 · 회색 칸 + 두세 글자는 출석을 세지 않는 사람(군복무 · 교환 …)
 * 회원 자격 중지 · 온라인 비율 초과 표시는 화면에 두지 않는다 — 엑셀에만(사용자 결정).
 */
export function AttendanceView({ book, thisWeek }: { book: Book; thisWeek?: string }) {
  const [both, setBoth] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const TAB = (on: boolean) => `h-10 flex-1 rounded-full text-[14.5px] font-bold transition-colors ${on ? "bg-[var(--gg-leaf)] text-[var(--gg-on-sky)]" : "text-muted"}`;
  // 주는 최근 주부터(오른쪽으로 갈수록 옛날) — 휴대폰에서 밀지 않아도 요즘 것이 보인다
  const order = book.weeks.map((_, i) => book.weeks.length - 1 - i);
  const k = q.replace(/\s+/g, "");
  const groups = book.groups.map((g) => ({ ...g, rows: k ? g.rows.filter((r) => r.name.includes(k)) : g.rows })).filter((g) => !k || g.rows.length > 0);
  const toggle = (id: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <label className="flex h-[52px] items-center gap-2.5 rounded-[18px] bg-[var(--gg-card)] px-4 shadow-[var(--gg-card-shadow)]">
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 검색"
          aria-label="이름 검색"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          data-testid="att-search"
        />
      </label>
      <div role="tablist" className="flex gap-1 rounded-full bg-[var(--gg-field)] p-1">
        <button type="button" role="tab" aria-selected={!both} onClick={() => setBoth(false)} className={TAB(!both)} data-testid="att-onsite">
          현장 예배
        </button>
        <button type="button" role="tab" aria-selected={both} onClick={() => setBoth(true)} className={TAB(both)} data-testid="att-both">
          현장 + 온라인
        </button>
      </div>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-muted">찾는 이름이 없어요</p>
      ) : (
        <ul className="space-y-2.5">
          {groups.map((g) => {
            const on = !!k || open.has(g.id);
            return (
              <li key={g.id} className="overflow-hidden rounded-2xl bg-[var(--gg-card)]" data-testid="att-group">
                <button type="button" onClick={() => toggle(g.id)} aria-expanded={on} disabled={!!k} className="flex h-[52px] w-full items-center justify-between px-4 text-left">
                  <span className="text-[16px] font-bold">{g.name}</span>
                  <span className="flex items-center gap-2 text-[14px] text-muted tabular-nums">
                    {g.rows.length}명
                    {k ? null : (
                      <svg viewBox="0 0 24 24" className={`size-4 transition-transform ${on ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    )}
                  </span>
                </button>
                {on ? <Table rows={g.rows} weeks={book.weeks} order={order} both={both} thisWeek={thisWeek} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Table({ rows, weeks, order, both, thisWeek }: { rows: BookRow[]; weeks: string[]; order: number[]; both: boolean; thisWeek?: string }) {
  const cell = "h-9 min-w-9 px-1 text-center align-middle";
  return (
    // isolate — 붙어 있는 이름 열이 화면 위 머리(뒤로 가기 줄) 위로 올라타지 않게 이 안에서만 쌓는다
    <div className="isolate overflow-x-auto border-t border-[var(--gg-line)]" data-testid="att-table">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13.5px] tabular-nums">
        <thead>
          <tr className="text-[12px] text-muted">
            <th className="sticky left-0 z-[1] h-9 min-w-[5.5rem] bg-[var(--gg-card)] px-4 text-left font-semibold">이름</th>
            <th className={`${cell} font-semibold`}>출석</th>
            <th className={`${cell} font-semibold`}>온라인</th>
            {order.map((i) => (
              <th key={weeks[i]} className={`${cell} font-semibold whitespace-nowrap`}>
                {weeks[i] === thisWeek ? "이번 주" : weekShort(weeks[i])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const here = both ? r.onsite + r.online : r.onsite;
            const known = r.onsite + r.online + r.absent;
            return (
              <tr key={r.id} data-testid="att-row">
                <th className="sticky left-0 z-[1] h-9 bg-[var(--gg-card)] px-4 text-left font-semibold whitespace-nowrap">{r.name}</th>
                {/* 집계되는 사람은 기록이 없어도 0%('-' 는 출석을 세지 않는 사람만, 2026-11-17) */}
                <td className={`${cell} font-semibold`}>{shareText(known ? here / known : r.off ? null : 0)}</td>
                <td className={`${cell} font-semibold`}>{shareText(r.onlineShare ?? (r.off ? null : 0))}</td>
                {order.map((i) => {
                  const m = r.marks[i];
                  return (
                    <td key={i} className={`${cell} ${m === "off" ? "bg-[var(--gg-stone-soft)]" : ""}`} aria-label={m === null ? "기록 없음" : m === "onsite" ? "현장" : m === "online" ? "온라인" : m === "off" ? `출석 제외 ${r.off ?? ""}` : "결석"}>
                      {m === null ? "" : m === "onsite" ? <Dot /> : m === "online" && both ? <Dot half /> : m === "off" ? <span className="text-[10px] font-semibold tracking-tighter text-[var(--foreground)]">{r.off}</span> : <Dot absent />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ● 현장(연두) · ○ 온라인(연두 테두리) · ● 결석(빨강, 2026-11-17 — 예전 '–') */
function Dot({ half = false, absent = false }: { half?: boolean; absent?: boolean }) {
  const look = absent ? "bg-[var(--gg-berry)]" : half ? "border-2 border-[var(--gg-leaf)] bg-transparent" : "bg-[var(--gg-leaf)]";
  return <span aria-hidden className={`inline-block size-3 rounded-full ${look}`} />;
}
