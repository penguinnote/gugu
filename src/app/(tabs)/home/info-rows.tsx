import Image from "next/image";
import Link from "next/link";

import { Chevron } from "@/components/ui";

/** 홈 카드 아래의 줄들(돌봄 · 출석부) — 리더 카드와 임원진 카드가 같이 쓴다. 운영자 카드의 할 일 줄과 같은 모양, 누르면 그 화면 */
export type InfoRow = { testId: string; href: string; icon: string; label: string; value: string; strong: boolean };

/** 출석부 줄(2026-11-16) — 숫자 없이 가는 줄만(2026-11-18 사용자 — 예전엔 '이번 주 n명') */
export const ATTENDANCE_ROW: InfoRow = { testId: "home-attendance", href: "/attendance", icon: "/icons/tossface/u1F4CB.svg", label: "출석부", value: "", strong: false };

export function InfoRows({ rows, className = "" }: { rows: InfoRow[]; className?: string }) {
  return (
    <ul className={`${className} divide-y divide-[var(--gg-line)] border-t border-[var(--gg-line)]`} data-testid="home-info">
      {rows.map((r) => (
        <li key={r.testId}>
          <Link href={r.href} className="flex items-center gap-3 px-5 py-3" data-testid={r.testId}>
            <Image src={r.icon} alt="" width={22} height={22} unoptimized className="size-[22px] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.label}</span>
            {r.value ? <span className={`shrink-0 text-[15px] font-bold tabular-nums ${r.strong ? "text-[var(--gg-sky-ink)]" : "text-[var(--gg-hint)]"}`}>{r.value}</span> : null}
            <Chevron className="h-4 w-4 shrink-0 text-[var(--gg-hint)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
