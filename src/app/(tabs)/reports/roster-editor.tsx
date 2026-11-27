"use client";

import { useState } from "react";

import { BTN } from "@/components/ui";

export type RosterItem = { id: string; name: string; hidden: boolean };
export type RosterSave = (items: { id: string; hidden: boolean; order: number }[]) => Promise<{ ok: true } | { ok: false; message: string }>;

/**
 * 보고서 명단 편집(2026-11-14 사용자 요청) — 보고서 화면에서 바로, 다른 화면으로 넘어가지 않는다.
 *   순서 바꾸기(↑ ↓) · 숨기기 · 다시 보이기. 상태(휴면 · 기록 제외 · 떠남)를 바꾸지 않고 이 목장 보고서에서만 잠시 뺀다
 *   — 교환학생 · 본가에 오래 가 있음 같은 때. 저장하면 지금 쓰던 입력은 그대로 두고 명단만 바뀐다.
 */
export function RosterEditor({ items, save, onSaved }: { items: RosterItem[]; save: RosterSave; onSaved: (next: RosterItem[]) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<RosterItem[]>(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setList(items);
    setError(null);
    setOpen(true);
  };
  const move = (i: number, d: -1 | 1) =>
    setList((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggle = (id: string) => setList((cur) => cur.map((p) => (p.id === id ? { ...p, hidden: !p.hidden } : p)));
  const commit = async () => {
    setBusy(true);
    setError(null);
    const r = await save(list.map((p, i) => ({ id: p.id, hidden: p.hidden, order: i + 1 }))).catch(() => ({ ok: false as const, message: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." }));
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onSaved(list);
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={start} className="text-[13px] font-semibold text-[var(--gg-sky-ink)] underline underline-offset-4" data-testid="roster-edit-open">
        명단 편집
      </button>
      {open ? (
        <div className="gg-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !busy && setOpen(false)} data-testid="roster-edit">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-edit-title"
            className="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-t-[28px] bg-[var(--gg-card)] pb-[calc(var(--nn-safe-bottom)+16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="roster-edit-title" className="px-5 pt-5 pb-3 text-[18px] font-bold">
              명단 편집
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-[var(--gg-line)] overflow-y-auto border-y border-[var(--gg-line)]">
              {list.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 px-5 py-2.5" data-testid="roster-row" data-person={p.id}>
                  <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${p.hidden ? "text-[var(--gg-hint)] line-through" : ""}`}>{p.name}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${p.name} 위로`} className="grid size-9 place-items-center rounded-full text-[var(--gg-hint)] disabled:opacity-30" data-testid="roster-up">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`${p.name} 아래로`} className="grid size-9 place-items-center rounded-full text-[var(--gg-hint)] disabled:opacity-30" data-testid="roster-down">
                    ↓
                  </button>
                  <button type="button" onClick={() => toggle(p.id)} className={`${BTN(p.hidden ? "sky" : "white", "sm")} !h-9 !min-w-[76px] !px-3 !text-[13.5px]`} data-testid="roster-toggle">
                    {p.hidden ? "보이기" : "숨기기"}
                  </button>
                </li>
              ))}
            </ul>
            {error ? <p className="px-5 pt-3 text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
            <div className="flex gap-2 px-5 pt-4">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className={`${BTN("white", "sm")} !h-11 flex-1`}>
                취소
              </button>
              <button type="button" onClick={() => void commit()} disabled={busy} className={`${BTN("sky", "sm")} !h-11 flex-1`} data-testid="roster-save">
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
