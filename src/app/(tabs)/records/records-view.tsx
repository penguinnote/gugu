import Link from "next/link";
import type { ReactNode } from "react";

import { BerryIcon } from "@/components/berry-icon";
import { CARD } from "@/components/ui";
import { groupLabel } from "@/lib/labels";

import { Flame } from "../home/streak-line";

export type BoardRow = { group_id: string; number: number; name: string; streak: number; berries: number };

const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); // toLocale* 없이(06 §4.5)

/**
 * '기록' 탭 본문(2026-11-10) — 목장마다 연속 정시 제출 주 수 · 열매.
 *   맨 위 우리 목장(리더만) 큰 숫자 두 개, 그 아래 모든 목장을 한 줄씩 — 연속 제출이 긴 순, 같으면 열매가 많은 순, 그것도 같으면 번호 순
 *   (2026-11-11 사용자 요청 — 예전엔 번호 순). 순위 숫자는 붙이지 않는다.
 *   줄을 누르면 그 목장 프로필. 우리 목장 줄은 옅은 라임.
 * 화면(page)과 디자인 확인 화면이 같이 쓴다.
 */
/** 연속 제출이 긴 순 → 열매가 많은 순 → 목장 번호 순 */
export function sortBoard(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => b.streak - a.streak || b.berries - a.berries || a.number - b.number);
}

export function RecordsView({ rows, mine }: { rows: BoardRow[]; mine: string | null }) {
  return (
    <main className="mx-auto flex w-full gg-col flex-col gap-4 px-4 pt-1 pb-8">
      <RecordsMine rows={rows} mine={mine} />
      <RecordsList rows={rows} mine={mine} />
    </main>
  );
}

/** 우리 목장 박스 — 기록 화면에서는 머리 그림 아래 고정(2026-11-15, FixedPage 의 stuck) */
export function RecordsMine({ rows, mine }: { rows: BoardRow[]; mine: string | null }) {
  const my = mine ? rows.find((r) => r.group_id === mine) : undefined;
  if (!my) return null;
  return (
    <section className={`${CARD} px-5 pt-4 pb-5`} aria-label="우리 목장" data-testid="records-mine">
      <p className="text-[15px] font-semibold text-[var(--gg-section)]">{groupLabel(my.name)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat icon={<Flame on={my.streak > 0} className="h-7 w-7" />} value={`${my.streak}주`} label="연속 제출" />
        <Stat icon={<BerryIcon className="h-7 w-7" />} value={comma(my.berries)} label="열매" />
      </div>
    </section>
  );
}

/** 모든 목장 줄 — 이 칸만 스크롤된다 */
export function RecordsList({ rows: raw, mine }: { rows: BoardRow[]; mine: string | null }) {
  const rows = sortBoard(raw);
  return (
      <ul className={`${CARD} overflow-hidden py-1.5`} aria-label="모든 목장" data-testid="records-list">
        {rows.map((r) => {
          const me = r.group_id === mine;
          return (
            <li key={r.group_id}>
              <Link
                href={`/groups/${encodeURIComponent(r.name)}`}
                className={`flex h-[60px] items-center gap-3 px-5 ${me ? "bg-[var(--gg-sky-soft)]" : ""}`}
                aria-current={me ? "true" : undefined}
                data-testid="records-row"
              >
                <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{groupLabel(r.name)}</span>
                <span className="flex w-[64px] shrink-0 items-center gap-1 text-[15px] font-bold tabular-nums">
                  <Flame on={r.streak > 0} className="h-[18px] w-[18px]" />
                  <span className={r.streak > 0 ? "" : "text-muted"}>{r.streak}주</span>
                </span>
                <span className="flex w-[72px] shrink-0 items-center justify-end gap-1 text-[15px] font-bold tabular-nums">
                  <BerryIcon className="h-[18px] w-[18px]" />
                  {comma(r.berries)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--gg-tile)] px-3.5 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-[22px] leading-none font-extrabold tabular-nums">{value}</p>
        <p className="mt-1 text-[13px] text-muted">{label}</p>
      </div>
    </div>
  );
}
