"use client";

import { useMemo, useState } from "react";

import { IconCard } from "@/components/toss";
import { BTN, ICON, Icon } from "@/components/ui";
import { DownloadLink, PDF_TYPE } from "@/components/download-link";
import { exportQuery, parseExportParams, presetRange, rangeLabel } from "@/lib/export/range";
import { formatWeekLabel } from "@/lib/week";

type Group = { id: string; name: string };

type Period = "this" | "last4" | "custom" | null;

// 칸(2026-11-11 토스 결 — 보고서 출석 칸과 같은 모양) — 회색 네모, 고르면 라임
const CELL = "flex h-10 items-center justify-center rounded-xl px-2 text-[14.5px] transition-colors";
const CHIP = `${CELL} flex-1`;
const ON = "bg-[var(--gg-sky)] font-bold text-[var(--gg-on-sky)]";
const OFF = "bg-[var(--gg-field)] font-semibold text-[var(--gg-section)]";
// 목장 칸(체크박스) — 켜면 라임. 진짜 input 은 눈에 안 보이게 둔다
const PICK = `${CELL} cursor-pointer bg-[var(--gg-field)] font-semibold text-[var(--gg-section)] has-[:checked]:bg-[var(--gg-sky)] has-[:checked]:font-bold has-[:checked]:text-[var(--gg-on-sky)]`;
const SELECT = "gg-field min-w-0 flex-1 !px-2.5 !py-2 !text-[14px]";

/**
 * P-6 내보내기 — 기간 · 목장 · 형식. **미리 골라 둔 값이 없다** — 범위를 매번 고른다(02 §3.3 범위 선택 강제).
 * '전체 목장' 은 명시적으로 고를 때만이다(2026-10-06). 고르기 전에는 두 버튼이 잠기고 이유 한 줄이 보인다.
 * Excel 은 /export/xlsx, PDF 는 /export/pdf 로 받는다(휴대폰은 곧바로 공유 시트 — DownloadLink). 로그는 그 두 경로가 남긴다.
 * 토스 결(2026-11-11): 기간 🗓 · 목장 👥 이 카드 하나씩, 칸은 회색 네모(고르면 라임). Excel 은 잎빛 · PDF 는 흰 통통한 단추.
 * 리더(ownGroup)는 목장 칸 대신 '우리 목장' 한 줄 — 자기 목장으로 묶여 있다.
 */
export function ExportForm({ groups, ownGroup = null, thisWeek, weekOptions }: { groups: Group[]; ownGroup?: string | null; thisWeek: string; weekOptions: string[] }) {
  const [period, setPeriod] = useState<Period>(null);
  const [from, setFrom] = useState(thisWeek);
  const [to, setTo] = useState(thisWeek);
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const range = useMemo(() => {
    if (!period) return null;
    return period === "custom" ? { from, to } : presetRange(period, thisWeek);
  }, [period, from, to, thisWeek]);

  const result = useMemo(() => {
    if (!range) return { ok: false as const, message: "기간을 고르세요." };
    const groupsParam = ownGroup ?? (all ? "all" : picked.join(","));
    return parseExportParams({ from: range.from, to: range.to, groups: groupsParam || undefined }, thisWeek, groups.map((g) => g.id));
  }, [range, all, picked, thisWeek, groups, ownGroup]);

  const query = result.ok ? exportQuery(result.range) : null;

  const toggle = (id: string) => {
    setAll(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <div className="space-y-4">
      <IconCard icon="/icons/tossface/u1F5D3.svg" title="기간">
        <div className="space-y-2.5">
        <div className="flex gap-1.5" role="radiogroup" aria-label="기간">
          {(
            [
              ["this", "이번 주"],
              ["last4", "최근 4주"],
              ["custom", "직접 지정"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={period === v} onClick={() => setPeriod(v)} className={`${CHIP} ${period === v ? ON : OFF}`}>
              {label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="flex items-center gap-2">
            <select aria-label="시작 주차" value={from} onChange={(e) => setFrom(e.target.value)} className={SELECT}>
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {formatWeekLabel(w)} {w.slice(0, 4)}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted">~</span>
            <select aria-label="끝 주차" value={to} onChange={(e) => setTo(e.target.value)} className={SELECT}>
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {formatWeekLabel(w)} {w.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {range ? (
          <p className="text-[13.5px] font-semibold text-[var(--gg-section)]" data-testid="range-label">
            {rangeLabel(range.from, range.to)}
          </p>
        ) : null}
        </div>
      </IconCard>

      {ownGroup ? (
        <IconCard icon="/icons/tossface/u1F465.svg" title={`${groups[0]?.name ?? "우리"} 목장`} />
      ) : (
      <IconCard icon="/icons/tossface/u1F465.svg" title="목장">
        <div className="space-y-1.5">
        <label className={PICK}>
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              if (e.target.checked) setPicked([]);
            }}
            className="sr-only"
          />
          전체 목장
        </label>
        <ul className="grid grid-cols-3 gap-1.5">
          {groups.map((g) => (
            <li key={g.id}>
              <label className={`${PICK} ${all ? "cursor-default opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  checked={all || picked.includes(g.id)}
                  disabled={all}
                  onChange={() => toggle(g.id)}
                  aria-label={`${g.name} 목장`}
                  className="sr-only"
                />
                <span className="truncate">{g.name}</span>
              </label>
            </li>
          ))}
        </ul>
        </div>
      </IconCard>
      )}

      <section className="space-y-3">
        {!result.ok ? (
          <p className="text-center text-[13px] text-muted" role="status" data-testid="why">
            {result.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <DownloadLink href={query ? `/export/xlsx?${query}` : null} className={`${BTN(query ? "leaf" : "white")} w-full ${query ? "" : "!text-muted"}`} loadingLabel="Excel 만드는 중…" testId="xlsx">
            <Icon d={ICON.export} className="h-5 w-5" strokeWidth={2.4} />
            Excel 받기
          </DownloadLink>
          <DownloadLink href={query ? `/export/pdf?${query}` : null} type={PDF_TYPE} className={`${BTN("white")} w-full ${query ? "" : "!text-muted"}`} loadingLabel="PDF 만드는 중…" testId="pdf">
            <Icon d={ICON.export} className="h-5 w-5" strokeWidth={2.4} />
            PDF 받기
          </DownloadLink>
        </div>
      </section>
    </div>
  );
}
