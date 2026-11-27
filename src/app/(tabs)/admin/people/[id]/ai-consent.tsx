"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CARD } from "@/components/ui";

import { setAiConsent } from "./actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

/**
 * AI 동의(2026-11-13 옵트인, 예전 'AI 정리에서 빼기') — 청년 동의서의 'AI 정리를 위한 해외 서버 사용' 항목에 동의한 사람만 켠다.
 * 켜고 끌 때 확인 창을 먼저 띄우고(사용자 요청), 확인하면 저장한다. 켜면 오늘이 동의일, 끄면 철회.
 */
export function AiConsent({ personId, initial }: { personId: string; initial: string | null }) {
  const [at, setAt] = useState<string | null>(initial);
  const [ask, setAsk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => setAsk(null), []);

  const confirm = async () => {
    if (ask === null) return;
    setBusy(true);
    setError(null);
    const r = await setAiConsent(personId, ask);
    setBusy(false);
    setAsk(null);
    if (!r.ok) setError(r.message);
    else setAt(r.at ?? null);
  };

  return (
    <section className={`${CARD} space-y-2 p-4`}>
      <label className="flex items-start gap-2.5 text-[15px] font-semibold">
        <input
          type="checkbox"
          checked={at !== null}
          disabled={busy}
          onChange={(e) => {
            setError(null);
            setAsk(e.target.checked);
          }}
          className="mt-0.5 size-[18px] shrink-0 accent-[var(--gg-sky)]"
          data-testid="ai-consent"
        />
        <span className="flex flex-1 items-baseline justify-between gap-2">
          AI 동의
          {at ? <span className="text-[13px] font-normal text-[var(--gg-hint)]" data-testid="ai-consent-date">{day(at)}</span> : null}
        </span>
      </label>
      {error ? <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
      <ConfirmDialog
        open={ask !== null}
        title={ask ? "AI 동의를 켤까요?" : "AI 동의를 거둘까요?"}
        body={ask ? "AI 정리를 위해 기록이 해외 서버를 거치는 것에 동의한 분만 켜 주세요." : "이분의 기록을 AI로 보내지 않고, 이분이 들어간 지난 AI 정리도 지워집니다."}
        confirmLabel={ask ? "동의" : "거두기"}
        danger={!ask}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={cancel}
        testId="ai-consent-confirm"
      />
    </section>
  );
}
