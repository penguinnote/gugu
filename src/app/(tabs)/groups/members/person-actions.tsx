"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BTN, CARD } from "@/components/ui";
import { CARE_STATUS_LABELS, groupLabel } from "@/lib/labels";
import { finishTo } from "@/lib/nav-history";
import type { Database } from "@/lib/supabase/database.types";

import { movePerson, setCareStatus, setPersonStatus, type MemberResult } from "./actions";

type CareStatus = Database["public"]["Enums"]["care_status"];

/**
 * 명단 고치기 아래의 상태 바꾸기
 *   상태       활동 · 휴면 — 양만. 그 목장 리더 · 목사님 · 운영자가 바로 바꾼다(2026-11-17, 예전엔 휴면 신청 → 목사님 승인)
 *   판정 태그   재적 · 군 복무 · 원거리 · 교환 학생(2026-11-17) · 주말 근무 · 타 교회 · 장기 미출석 — 그 목장 리더 · 목사님 · 운영자(2026-11-17, 예전엔 운영자만)
 *   목장 옮기기  목사님 · 운영자 — 다른 목장을 골라 바로 옮긴다(계정이 연결된 리더는 운영자 화면)
 */
const CARE_ORDER: CareStatus[] = ["active", "military", "remote", "exchange", "weekend_work", "other_church", "long_absent"];

export function PersonActions({
  personId,
  status,
  groupRole,
  careStatus,
  canMove,
  linked,
  groupId,
  groups,
  listHref,
}: {
  personId: string;
  status: "active" | "dormant" | "opted_out" | "left";
  groupRole: "leader" | "member";
  careStatus: CareStatus;
  canMove: boolean;
  linked: boolean;
  groupId: string;
  groups: { id: string; name: string }[];
  listHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [target, setTarget] = useState("");

  const run = async (fn: () => Promise<MemberResult>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fn();
      if (!r.ok) setNote(r.message);
      else if (after) after();
      else router.refresh();
    } catch {
      setNote("처리하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const showStatus = groupRole === "member" && (status === "active" || status === "dormant");
  const showMove = canMove && !linked;
  const SEG = (on: boolean) => `h-9 flex-1 rounded-full text-[13.5px] font-bold transition-colors ${on ? "bg-[var(--gg-leaf)] text-[var(--gg-on-sky)]" : "text-muted"}`;

  return (
    <section className={`${CARD} space-y-3 p-4`} data-testid="person-actions">
      {showStatus ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">상태</span>
          <div role="radiogroup" aria-label="상태" className="flex w-44 gap-1 rounded-full bg-[var(--gg-field)] p-1">
            {(["active", "dormant"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                disabled={busy}
                onClick={() => status !== s && run(() => setPersonStatus(personId, s))}
                className={SEG(status === s)}
                data-testid={`status-${s}`}
              >
                {s === "active" ? "활동" : "휴면"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {status !== "left" ? (
        <div className={`flex items-center justify-between gap-3 ${showStatus ? "border-t border-[var(--gg-line)] pt-3" : ""}`}>
          <label htmlFor="care-status" className="text-[15px] font-semibold">
            판정 태그
          </label>
          <select
            id="care-status"
            value={careStatus}
            disabled={busy}
            onChange={(e) => run(() => setCareStatus(personId, e.target.value as CareStatus))}
            className="gg-field w-44"
            data-testid="care-status"
          >
            {CARE_ORDER.map((c) => (
              <option key={c} value={c}>
                {CARE_STATUS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showMove ? (
        <div className="flex items-center gap-2 border-t border-[var(--gg-line)] pt-3">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="gg-field min-w-0 flex-1" aria-label="옮길 목장">
            <option value="">다른 목장으로 옮기기</option>
            {groups
              .filter((g) => g.id !== groupId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabel(g.name)}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={busy || !target}
            onClick={() => run(() => movePerson(personId, target), () => finishTo(listHref, router))}
            className={`${BTN("white", "sm")} !h-11 shrink-0 !px-3 !text-[13px]`}
          >
            옮기기
          </button>
        </div>
      ) : null}
      {note ? (
        <p role="alert" className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">
          {note}
        </p>
      ) : null}
    </section>
  );
}
