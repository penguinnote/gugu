"use client";

import { useState, useTransition } from "react";

import { BTN, CARD } from "@/components/ui";
import { formatWeekLabel } from "@/lib/week";

import { setSkippedWeek, type WeekResult } from "./actions";

export type WeekRow = { weekKey: string; skipped: boolean; reason: string | null };

/**
 * A-1b 휴주 — 이번 주부터 앞으로 12주. 한 줄에 주차 · 사유 입력 · 켜기/끄기 버튼. 저장 버튼은 따로 없다 —
 * 버튼이 곧 저장이다(주 1회도 안 되는 조작). 결과는 서버에서 다시 읽은 값으로 그린다.
 * 구구 테마: 카드 하나에 12줄, 휴주인 줄은 라일락빛으로 찬다.
 */
export function WeeksForm({ initial, save = setSkippedWeek, thisWeek, testId = "weeks" }: { initial: WeekRow[]; save?: typeof setSkippedWeek; thisWeek?: string; testId?: string }) {
  const [rows, setRows] = useState(initial);
  const [reasons, setReasons] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((r) => [r.weekKey, r.reason ?? ""])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(row: WeekRow) {
    if (busy) return;
    setBusy(row.weekKey);
    setNotice(null);
    startTransition(async () => {
      const r: WeekResult = await save(row.weekKey, !row.skipped, reasons[row.weekKey] ?? "");
      if (r.ok) {
        setRows((prev) =>
          prev.map((x) => (x.weekKey === row.weekKey ? { ...x, skipped: !row.skipped, reason: (reasons[row.weekKey] ?? "").trim() || null } : x)),
        );
      } else {
        setNotice(r.message);
      }
      setBusy(null);
    });
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <p role="alert" className="rounded-2xl bg-[var(--gg-berry-soft)] px-3.5 py-2.5 text-[13px] leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
          {notice}
        </p>
      ) : null}
      <ul className={`${CARD} space-y-1 p-2`} data-testid={testId}>
        {rows.map((row, i) => (
          <li
            key={row.weekKey}
            className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5 ${row.skipped ? "bg-[var(--gg-sun-soft)]" : ""}`}
            data-skipped={row.skipped ? "true" : "false"}
          >
            <div className="w-[5.5rem] shrink-0 space-y-0.5">
              <p className="text-[13.5px] font-bold">{formatWeekLabel(row.weekKey)}</p>
              {(thisWeek ? row.weekKey === thisWeek : i === 0) ? (
                <span className="gg-pill !h-5 bg-[var(--gg-sky-soft)] !px-1.5 !text-[10.5px] text-[var(--gg-sky-ink)]">이번 주</span>
              ) : row.skipped ? (
                <span className="gg-pill !h-5 bg-[var(--gg-sun)] !px-1.5 !text-[10.5px] text-[#5a3a00]">휴주</span>
              ) : null}
            </div>
            <input
              value={reasons[row.weekKey] ?? ""}
              onChange={(e) => setReasons({ ...reasons, [row.weekKey]: e.target.value })}
              disabled={row.skipped}
              maxLength={100}
              placeholder="사유 (예: 방학)"
              aria-label={`${formatWeekLabel(row.weekKey)} 사유`}
              className="gg-field min-w-0 flex-1 !rounded-xl !px-3 !py-2 !text-[14px] disabled:text-muted"
            />
            <button
              type="button"
              onClick={() => toggle(row)}
              aria-disabled={busy !== null}
              aria-label={`${formatWeekLabel(row.weekKey)} ${row.skipped ? "휴주 해제" : "휴주 지정"}`}
              className={`${BTN("white", "sm")} shrink-0 !h-9 !px-3 !text-[14px]`}
            >
              {busy === row.weekKey ? "…" : row.skipped ? "해제" : "휴주"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
