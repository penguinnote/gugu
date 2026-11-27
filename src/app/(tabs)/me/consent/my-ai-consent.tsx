"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { TossCard, TossSection } from "@/components/toss";

import { setMyAiConsent } from "./actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

/**
 * 내 AI 동의(2026-11-13) — 개인정보 · 동의 화면. 켜고 끌 때마다 확인 창을 먼저 띄운다(잘못 눌러 바뀌지 않게 — 사용자 요청).
 * 확인해야 저장하고, 저장된 뒤에야 칸이 바뀐다.
 */
export function MyAiConsent({ initial }: { initial: string | null }) {
  const [at, setAt] = useState<string | null>(initial);
  const [ask, setAsk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => setAsk(null), []);

  const confirm = async () => {
    if (ask === null) return;
    setBusy(true);
    setError(null);
    const r = await setMyAiConsent(ask);
    setBusy(false);
    setAsk(null);
    if (!r.ok) setError(r.message);
    else setAt(r.at);
  };

  return (
    <TossCard>
      <TossSection id="ai-title" title="AI">
        <div className="space-y-2 px-6 pb-3">
          <label className="flex items-center justify-between gap-4 py-1.5">
            <span className="text-[15px] font-semibold">
              내 기도제목 AI에 쓰기
              {at ? <span className="ml-2 text-[13px] font-normal text-[var(--gg-hint)]" data-testid="my-ai-date">{day(at)} 동의</span> : null}
            </span>
            <input
              type="checkbox"
              checked={at !== null}
              disabled={busy}
              onChange={(e) => {
                setError(null);
                setAsk(e.target.checked);
              }}
              className="size-[20px] shrink-0 accent-[var(--gg-sky)]"
              data-testid="my-ai-consent"
            />
          </label>
          {error ? <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}
        </div>
      </TossSection>
      <ConfirmDialog
        open={ask !== null}
        title={ask ? "AI 동의를 켤까요?" : "AI 동의를 거둘까요?"}
        body={
          ask
            ? "내 기도제목이 이름을 기호로 바꿔 미국 AI 서버(Anthropic)로 보내져 정리됩니다."
            : "내 기도제목을 AI로 보내지 않고, 내가 들어간 지난 AI 정리도 지워집니다."
        }
        confirmLabel={ask ? "동의" : "거두기"}
        danger={!ask}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={cancel}
        testId="my-ai-confirm"
      />
    </TossCard>
  );
}
