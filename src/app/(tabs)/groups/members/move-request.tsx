"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BTN, CARD } from "@/components/ui";
import { groupLabel } from "@/lib/labels";

import { cancelMove, requestMove } from "./move-actions";
import { moveLine, type MoveItem } from "./move-inbox";

/**
 * 목장 이동 신청(2026-11-26) — 우리 목장 명단의 사람 화면(본인 포함). 옮길 목장을 고르고 한 줄 메모.
 * 받는 목장 리더(또는 목사님)가 수락하면 명단이 저절로 바뀐다. 대기 중이면 그 줄과(내가 걸었으면) 취소.
 */
export function MoveRequest({
  personId,
  groupId,
  groups,
  pending,
}: {
  personId: string;
  groupId: string;
  groups: { id: string; name: string }[];
  pending: MoveItem | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message ?? "처리하지 못했습니다.");
      else {
        setTarget("");
        setNote("");
      }
      router.refresh();
    });

  return (
    <section className={`${CARD} space-y-3 p-4`} data-testid="move-request">
      <p className="text-[15px] font-semibold">목장 이동 신청</p>
      {pending ? (
        <div className="space-y-2">
          <p className="text-[14px]" data-testid="move-pending">
            {moveLine(pending)} · 대기 중
          </p>
          {pending.mine ? (
            <button type="button" disabled={busy} onClick={() => run(() => cancelMove(pending.id))} className={`${BTN("white", "sm")} !h-10 w-full`}>
              신청 취소
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="gg-field w-full" aria-label="옮길 목장" data-testid="move-target">
            <option value="">목장 선택</option>
            {groups
              .filter((g) => g.id !== groupId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabel(g.name)}
                </option>
              ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="한 줄 메모" className="gg-field w-full" aria-label="메모" data-testid="move-note" />
          <button
            type="button"
            disabled={!target || busy}
            onClick={() => run(() => requestMove(personId, target, note))}
            className={`${BTN("leaf", "sm")} !h-10 w-full`}
            data-testid="move-submit"
          >
            신청
          </button>
        </div>
      )}
      {error ? <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
    </section>
  );
}
