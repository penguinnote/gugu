"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CARD_LIST, IconCard } from "@/components/toss";
import { BTN } from "@/components/ui";
import { groupLabel } from "@/lib/labels";

import { cancelMove, decideMove } from "./move-actions";

export type MoveItem = {
  id: string;
  person_name: string;
  from_group_name: string;
  to_group_name: string;
  direction: string;
  note: string | null;
  requester_name: string | null;
  can_decide: boolean;
  mine: boolean;
};

/** 한 줄 — 보내기: '가온 목장 → 자람 목장', 데려오기도 같은 화살표(사람이 가는 쪽) */
export function moveLine(m: Pick<MoveItem, "person_name" | "from_group_name" | "to_group_name">): string {
  return `${m.person_name} · ${groupLabel(m.from_group_name)} → ${groupLabel(m.to_group_name)}`;
}

/**
 * 목장 이동 대기 신청(2026-11-26) — 우리 목장 명단 맨 위. 내가 처리할 신청은 수락 · 거절, 내가 건 신청은 취소.
 * 목사님은 모든 목장의 대기 신청을 처리한다(앱 쓰는 리더가 없는 목장도).
 */
export function MoveInbox({ items }: { items: MoveItem[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message ?? "처리하지 못했습니다.");
      router.refresh();
    });
  return (
    <IconCard icon="/icons/tossface/u1F3E1.svg" title="목장 이동 신청" aside={`${items.length}건`} testId="move-inbox">
      <ul className={CARD_LIST}>
        {items.map((m) => (
          <li key={m.id} className="space-y-2 px-4 py-3" data-testid="move-item">
            <p className="text-[15px] font-bold">{moveLine(m)}</p>
            <p className="text-[12.5px] text-[var(--gg-hint)]">
              {m.requester_name ? `${m.requester_name} 신청` : "신청"}
              {m.note ? ` · ${m.note}` : ""}
            </p>
            {m.can_decide ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} className={`${BTN("white", "sm")} !h-10`} onClick={() => act(() => decideMove(m.id, false))} data-testid="move-reject">
                  거절
                </button>
                <button type="button" disabled={busy} className={`${BTN("leaf", "sm")} !h-10`} onClick={() => act(() => decideMove(m.id, true))} data-testid="move-accept">
                  수락
                </button>
              </div>
            ) : m.mine ? (
              <button type="button" disabled={busy} className={`${BTN("white", "sm")} !h-10 w-full`} onClick={() => act(() => cancelMove(m.id))} data-testid="move-cancel">
                신청 취소
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="px-4 pb-3 text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
    </IconCard>
  );
}
