"use client";

import { useState } from "react";

import { BTN } from "@/components/ui";

import { addNewFamily } from "./new-family-actions";

/**
 * 새가족 추가(2026-11-26) — 보고서 화면에서 바로, 이름만. 저장하면 지금 쓰던 입력은 그대로 두고 그 사람 카드가 명단 맨 아래에 나타난다.
 * 같은 이름 알림은 뺐다(2026-11-26 사용자 — 필요 없음). 우리 목장에 같은 이름이 있으면 저장이 막히고 그 까닭을 보인다.
 * 키보드가 아래를 덮으므로 창은 화면 위쪽에 둔다.
 */
export type NewFamilyActions = { add: typeof addNewFamily };

export function NewFamily({
  weekKey,
  onAdded,
  actions = { add: addNewFamily },
}: {
  weekKey: string;
  onAdded: (p: { id: string; name: string }) => void;
  /** 디자인 확인 화면이 지어낸 답으로 바꿔 끼운다 */
  actions?: NewFamilyActions;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setName("");
    setMsg(null);
  };
  const save = async () => {
    const n = name.trim();
    if (!n) {
      setMsg("이름을 적어 주세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await actions.add(weekKey, n).catch(() => ({ ok: false as const, message: "넣지 못했습니다. 잠시 뒤 다시 눌러 주세요." }));
    setBusy(false);
    if (!r.ok) {
      setMsg(r.message);
      return;
    }
    onAdded({ id: r.id, name: n });
    setOpen(false);
    setName("");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-semibold text-[var(--gg-sky-ink)] underline underline-offset-4" data-testid="new-family-open">
        새가족 추가
      </button>
      {open ? (
        <div className="gg-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-5 pt-[calc(var(--nn-safe-top)+56px)]" onClick={close} data-testid="new-family">
          <div role="dialog" aria-modal="true" aria-labelledby="new-family-title" className="w-full max-w-sm space-y-3 rounded-[24px] bg-[var(--gg-card)] p-5" onClick={(e) => e.stopPropagation()}>
            <p id="new-family-title" className="text-[18px] font-bold">
              새가족 추가
            </p>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMsg(null);
              }}
              maxLength={30}
              autoFocus
              autoComplete="off"
              placeholder="이름"
              aria-label="이름"
              className="gg-field w-full"
              data-testid="new-family-name"
            />
            {msg ? (
              <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]" role="status">
                {msg}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button type="button" onClick={close} disabled={busy} className={`${BTN("white", "sm")} !h-11 flex-1`}>
                취소
              </button>
              <button type="button" onClick={() => void save()} disabled={busy} className={`${BTN("sky", "sm")} !h-11 flex-1`} data-testid="new-family-save">
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
