"use client";

import { useState, useTransition } from "react";

import { setNote } from "../../actions";

/**
 * 목사님 한마디(2026-11-10) — 도장 위의 짧은 칸. 선택이다(확인 · 도장만으로도 충분하다).
 * 쓰고 '보내기' 를 누르면 저장되고 그 목장 리더 홈 카드에 크게 뜬다. 고쳐 쓰면 바뀌고, 다 지우고 보내면 지워진다. 200자까지.
 */
export function NoteBox({ reportId, initial }: { reportId: string; initial: string | null }) {
  const [saved, setSaved] = useState<string | null>(initial);
  const [text, setText] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = text.trim() !== (saved ?? "");
  const left = 200 - text.trim().length;

  const send = () => {
    setError(null);
    start(async () => {
      const res = await setNote(reportId, text);
      if (!res.ok) return setError(res.message);
      setSaved(res.note);
      setText(res.note ?? "");
    });
  };

  return (
    <div className="space-y-2 rounded-[22px] bg-[var(--gg-card)] p-3.5 shadow-[var(--gg-card-shadow)]" data-testid="note-box">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={220}
        rows={2}
        placeholder="리더에게 한마디"
        aria-label="리더에게 한마디"
        className="block w-full resize-none rounded-2xl bg-[var(--gg-field)] px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted"
      />
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] tabular-nums ${left < 0 ? "font-bold text-[var(--gg-berry-ink)]" : "text-muted"}`}>
          {error ?? (saved && !dirty ? "보냈어요 ✓" : `${Math.max(0, text.trim().length)} / 200`)}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={pending || !dirty || left < 0}
          className="gg-pill !h-9 bg-[var(--gg-sky)] !px-4 text-[14px] font-bold text-[var(--gg-on-sky)] disabled:opacity-40"
        >
          {saved && !text.trim() ? "지우기" : saved ? "고쳐 보내기" : "보내기"}
        </button>
      </div>
    </div>
  );
}
