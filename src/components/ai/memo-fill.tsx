"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { DictationResult } from "@/lib/ai/dictation";
import { splitMemoPlain } from "@/lib/memo-split";
import { dropJamo, fixSpelling } from "@/lib/spell/rules";

/**
 * 보고서 받아쓰기(2026-11-12) — '✨ AI로 채우기'(2026-11-14, 예전 '모임 메모로 채우기') 를 누르면 아래에서 판이 올라온다.
 *   1) 메모 붙여 넣기 → '나눠 보기'
 *   2) 사람별 기도제목 · 특이사항을 보이고, 고른 것만 '채우기'(이미 쓴 칸은 '바꿈' 표시)
 * AI 없이도 나눈다(2026-11-16) — 이름으로 시작하는 줄을 그 사람 것으로(lib/memo-split, 글이 기기 밖으로 나가지 않는다).
 *   action 이 없으면(AI 꺼짐) 그것만, 있으면 AI 결과에 없는 사람(동의 전인 사람 등)을 그것으로 메운다. AI 가 답하지 못해도 그것으로 보인다.
 * 이름으로 나눈 글은 맞춤법 · 띄어쓰기를 고치고 꼴을 맞춘다(2026-11-16, ㅎㅎ 지우기 · 문장마다 한 줄 · 기도제목 끝은 '~도록') — 서버의 규칙 + 형태소 분석기(/api/polish, AI 아님 · 글이 밖으로 안 나간다).
 *   서버가 답하지 못하면 화면에서 규칙만으로 고친다(lib/spell/rules).
 * 채운 뒤 리더가 고쳐서 평소처럼 제출한다. action 은 서버 동작(reports/actions), 디자인 확인 화면은 가짜.
 */

export type MemoPerson = { id: string; name: string; prayer: string };
type Found = { personId: string; prayer: string };
const MAX = 4000;

export function MemoFill({
  persons,
  note,
  action,
  onApply,
  className = "",
}: {
  persons: MemoPerson[];
  note: string;
  action?: ((personIds: string[], memo: string) => Promise<DictationResult>) | null;
  onApply: (prayers: Found[], note: string | null) => void;
  /** 넓은 화면 카드의 자리(목장보고서 격자 칸) */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ prayers: Found[]; note: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, busy]);

  const name = new Map(persons.map((p) => [p.id, p]));
  const split = async () => {
    setBusy(true);
    setError(null);
    const plain = splitMemoPlain(persons, memo);
    const r: DictationResult | null = action
      ? await action(
          persons.map((p) => p.id),
          memo,
        ).catch((): DictationResult => ({ ok: false, message: "AI가 답하지 못했어요. 잠시 뒤 다시 해 주세요." }))
      : null;
    // AI 결과가 먼저, 거기 없는 사람은 이름으로 나눈 것으로 메운다. AI 가 못 했으면 이름으로 나눈 것만
    const ai = r?.ok ? r : null;
    const have = new Set(ai?.prayers.map((p) => p.personId));
    const order = new Map(persons.map((p, i) => [p.id, i]));
    // 이름으로 나눈 글만 맞춤법 · 띄어쓰기를 고친다(AI 가 쓴 글은 이미 다듬어져 있다)
    const rest = plain.prayers.filter((p) => !have.has(p.personId));
    // AI 가 쓴 글도 같은 정리를 거친다(2026-11-17) — ㅎㅎ 가 남거나 글머리표로 늘어놓거나 '~도록' 으로 안 끝나는 일이 있었다
    const all = [...(ai?.prayers ?? []), ...rest];
    const rawNote = ai ? ai.note : plain.note;
    const fixed = all.length || rawNote.trim() ? await polish(all.map((p) => p.prayer), rawNote) : { prayers: [], note: "" };
    const prayers = all.map((p, i) => ({ ...p, prayer: fixed.prayers[i] })).filter((p) => p.prayer.trim()).sort(
      (a, b) => (order.get(a.personId) ?? 0) - (order.get(b.personId) ?? 0),
    );
    const foundNote = fixed.note;
    setBusy(false);
    if (r && !r.ok && prayers.length === 0) {
      setError(r.message);
      return;
    }
    setFound({ prayers, note: foundNote });
    setPicked(new Set([...prayers.map((p) => p.personId), ...(foundNote ? ["note"] : [])]));
  };
  const toggle = (k: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const apply = () => {
    if (!found) return;
    onApply(
      found.prayers.filter((p) => picked.has(p.personId)),
      picked.has("note") && found.note ? found.note : null,
    );
    close();
  };
  const close = () => {
    setOpen(false);
    setFound(null);
    setError(null);
  };
  const count = found ? found.prayers.filter((p) => picked.has(p.personId)).length + (picked.has("note") && found.note ? 1 : 0) : 0;

  // 판 안쪽 — 휴대폰은 아래에서 올라오는 판(sheet), 넓은 화면(1024px 이상)은 왼쪽 칸에 펼쳐 둔 카드(card, 2026-11-27). 둘은 같은 상태를 쓴다
  const body = (v: "sheet" | "card") => {
    const tid = (k: string) => (v === "sheet" ? `memo-fill-${k}` : `memo-card-${k}`);
    const titleId = v === "sheet" ? "memo-fill-title" : "memo-card-title";
    return !found ? (
      <>
        <h2 id={titleId} className={v === "sheet" ? "text-[20px] font-extrabold tracking-[-0.02em]" : "flex items-center gap-2 text-[17px] font-bold"}>
          {v === "card" ? <Image src="/icons/tossface/u2728.svg" alt="" width={22} height={22} unoptimized className="size-[22px]" /> : null}
          기도제목을 붙여 넣어요
        </h2>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value.slice(0, MAX))}
          rows={9}
          placeholder={"• 가온: 이번 주 시험 잘 볼 수 있도록\n• 나래: 이사 잘 마무리되도록"}
          aria-label="모임 메모"
          className={`gg-field resize-none !text-[15px] leading-relaxed ${v === "sheet" ? "mt-4 min-h-[38dvh]" : "mt-3 min-h-[220px]"}`}
          data-testid={tid("text")}
        />
        <p className="mt-1.5 text-right text-[12.5px] text-muted tabular-nums">
          {memo.length.toLocaleString()} / {MAX.toLocaleString()}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-[14px] font-semibold text-[var(--gg-berry-ink)]">
            {error}
          </p>
        ) : null}
        <div className={`flex gap-2 ${v === "sheet" ? "mt-4" : "mt-3"}`}>
          {v === "sheet" ? (
            <button type="button" onClick={close} disabled={busy} className="gg-btn gg-btn-white gg-btn-sm !h-12 flex-1">
              닫기
            </button>
          ) : (
            <button type="button" onClick={() => setMemo("")} disabled={busy || !memo} className="gg-btn gg-btn-white gg-btn-sm !h-11 flex-1" data-testid={tid("clear")}>
              지우기
            </button>
          )}
          <button type="button" onClick={split} disabled={busy || !memo.trim()} className={`gg-btn gg-btn-sky gg-btn-sm flex-[2] ${v === "sheet" ? "!h-12" : "!h-11"}`} data-testid={tid("split")}>
            {busy ? "나누는 중…" : "나눠 보기"}
          </button>
        </div>
      </>
    ) : (
      <>
        <h2 id={titleId} className={v === "sheet" ? "text-[20px] font-extrabold tracking-[-0.02em]" : "text-[17px] font-bold"}>
          {found.prayers.length || found.note ? "이렇게 나눴어요" : "나눌 내용을 찾지 못했어요"}
        </h2>
        <ul className={`-mx-1 mt-3 space-y-2 overflow-y-auto px-1 pb-1 ${v === "sheet" ? "min-h-0 flex-1" : "max-h-[46dvh]"}`}>
          {found.prayers.map((p) => {
            const who = name.get(p.personId);
            return <Pick key={p.personId} on={picked.has(p.personId)} onToggle={() => toggle(p.personId)} title={who?.name ?? ""} replaces={!!who?.prayer.trim()} text={p.prayer} testId={tid("item")} />;
          })}
          {found.note ? <Pick on={picked.has("note")} onToggle={() => toggle("note")} title="📝 특이사항" replaces={!!note.trim()} text={found.note} testId={tid("item")} /> : null}
        </ul>
        <div className={`flex gap-2 ${v === "sheet" ? "mt-4" : "mt-3"}`}>
          <button type="button" onClick={() => setFound(null)} className={`gg-btn gg-btn-white gg-btn-sm flex-1 ${v === "sheet" ? "!h-12" : "!h-11"}`}>
            다시 붙여 넣기
          </button>
          <button type="button" onClick={apply} disabled={count === 0} className={`gg-btn gg-btn-sky gg-btn-sm flex-[2] ${v === "sheet" ? "!h-12" : "!h-11"}`} data-testid={tid("apply")}>
            {count > 0 ? `${count}개 채우기` : "채우기"}
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="gg-btn gg-btn-white gg-btn-sm !h-11 w-full !gap-2 lg:hidden" data-testid="memo-fill-open">
        <Image src="/icons/tossface/u2728.svg" alt="" width={20} height={20} unoptimized className="size-5" />
        기도제목 붙여넣기
      </button>
      <section aria-labelledby="memo-card-title" className={`hidden rounded-[22px] bg-[var(--gg-card)] p-4 shadow-[var(--gg-card-shadow)] lg:block ${className}`} data-testid="memo-card">
        {body("card")}
      </section>
      {open ? (
        <div className="gg-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !busy && close()} data-testid="memo-fill">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-fill-title"
            className="gg-sheet-up flex max-h-[88dvh] w-full max-w-sm flex-col rounded-t-[28px] bg-[var(--gg-card)] px-5 pt-6 pb-[calc(var(--nn-safe-bottom)+1.25rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {body("sheet")}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * 맞춤법 · 띄어쓰기를 고치고 꼴을 맞춘다 — 서버(규칙 + 형태소 분석기)에 맡긴다: ㅎㅎ 같은 것을 지우고, 문장마다 한 줄,
 * 기도제목 끝은 '~도록' 으로. 서버가 못 하면 화면에서 ㅎㅎ 지우기 · 맞춤법 규칙만
 */
async function polish(prayers: string[], note: string): Promise<{ prayers: string[]; note: string }> {
  try {
    const res = await fetch("/api/polish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prayers, note }), signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(String(res.status));
    const out = (await res.json()) as { prayers?: unknown; note?: unknown };
    if (Array.isArray(out.prayers) && out.prayers.length === prayers.length && out.prayers.every((t) => typeof t === "string") && typeof out.note === "string") {
      return { prayers: out.prayers as string[], note: out.note };
    }
    throw new Error("shape");
  } catch {
    const local = (t: string) => fixSpelling(dropJamo(t));
    return { prayers: prayers.map(local), note: local(note) };
  }
}

/** 결과 한 줄 — 왼쪽 동그라미 체크 · 이름 · (이미 쓴 칸이면 '바꿈') · 아래 글 */
function Pick({ on, onToggle, title, replaces, text, testId }: { on: boolean; onToggle: () => void; title: string; replaces: boolean; text: string; testId: string }) {
  return (
    <li>
      <label className={`flex cursor-pointer gap-3 rounded-2xl px-3.5 py-3 ring-2 ring-inset transition-colors ${on ? "bg-[var(--gg-sky-soft)] ring-[var(--gg-sky)]" : "bg-[var(--gg-field)] ring-transparent"}`} data-testid={testId}>
        <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />
        <span aria-hidden className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full ${on ? "bg-[var(--gg-sky)] text-[var(--gg-on-sky)]" : "bg-white ring-2 ring-[var(--gg-line)] ring-inset"}`}>
          {on ? (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            {title}
            {replaces ? <span className="gg-pill !h-5 bg-[var(--gg-sun-soft)] !px-1.5 !text-[11px] text-[var(--gg-sun-ink)]">바꿈</span> : null}
          </span>
          <span className="gg-text mt-0.5 block text-[14.5px] leading-relaxed break-keep">{text}</span>
        </span>
      </label>
    </li>
  );
}
