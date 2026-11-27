"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CARD } from "@/components/ui";

import { setOfficer } from "./actions";

/**
 * 임원진 켜고 끄기(2026-11-26) — 계정 권한의 '임원진 맡기기 · 그만두기' 와 같은 처리. 임원진은 전체 명단 엑셀을 받는다.
 * 앱 계정이 연결되지 않은 사람은 흐리게 두고 까닭 한 줄.
 */
export function OfficerToggle({ personId, linked, initial, hint }: { personId: string; linked: boolean; initial: boolean; /** 넓은 화면 편집 칸의 설명 한 줄(2026-11-27) */ hint?: string }) {
  const [on, setOn] = useState(initial);
  const [ask, setAsk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => setAsk(null), []);

  const confirm = async () => {
    if (ask === null) return;
    setBusy(true);
    setError(null);
    const r = await setOfficer(personId, ask);
    setBusy(false);
    if (r.ok) setOn(ask);
    else setError(r.message);
    setAsk(null);
  };

  return (
    <section className={`${CARD} space-y-2 p-4 ${linked ? "" : "opacity-60"}`} data-testid="officer-toggle">
      <label className="flex items-start gap-2.5 text-[15px] font-semibold">
        <input
          type="checkbox"
          checked={on}
          disabled={!linked || busy}
          onChange={(e) => {
            setError(null);
            setAsk(e.target.checked);
          }}
          className="mt-0.5 size-[18px] shrink-0 accent-[var(--gg-sky)]"
          data-testid="officer-check"
        />
        <span>
          임원진
          {hint ? <span className="mt-0.5 block text-[13px] font-normal text-[var(--gg-hint)]">{hint}</span> : null}
        </span>
      </label>
      {!linked ? <p className="text-[13px] text-[var(--gg-hint)]">앱 계정이 연결된 사람만 맡길 수 있어요</p> : null}
      {error ? <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
      <ConfirmDialog
        open={ask !== null}
        title={ask ? "임원진을 맡길까요?" : "임원진을 그만두게 할까요?"}
        confirmLabel={ask ? "맡기기" : "그만두기"}
        danger={!ask}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={cancel}
        testId="officer-confirm"
      />
    </section>
  );
}
