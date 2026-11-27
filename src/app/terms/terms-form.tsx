"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { BTN, CARD } from "@/components/ui";

/** 첫 접속 동의(2026-11-13) — 두 가지 모두 체크해야 시작 단추가 켜진다 */
export const TERMS_ITEMS = [
  {
    key: "mine",
    label: "내 정보 처리에 동의합니다",
    body: "로그인한 계정의 이름 · 이메일과 알림을 받을 기기 정보를 앱을 쓰는 동안 처리합니다. 목장보고서 작성 · 열람, 내보내기 같은 앱에서 한 일은 기록으로 남습니다.",
  },
  {
    key: "keep",
    label: "청년들의 정보를 지키겠습니다",
    body: "앱에서 보는 기도제목 · 출석 · 명단 정보는 목장 돌봄에만 쓰고, 캡처하거나 다른 곳에 옮기지 않겠습니다. 앱을 그만 쓰게 되면 내려받은 명단 · 목장보고서 파일도 지우겠습니다.",
  },
] as const;

/** 선택(2026-11-13) — 명단과 연결된 사람(리더 등)만. 체크하면 내 명단 행의 AI 동의가 켜진다. 안 해도 앱은 쓴다 */
export const TERMS_AI = {
  label: "내 기도제목도 AI에 써도 됩니다 (선택)",
  body: "목사님 AI 정리 · 구구 챗봇 · 목장보고서 받아쓰기에 내 기록도 들어갑니다. 이름은 기호로 바꿔 미국 AI 서버(Anthropic)로 보내고, AI 학습에는 쓰지 않습니다. 전체 → 개인정보 · 동의에서 언제든 끌 수 있습니다.",
};

export function TermsForm({
  agree,
  ai = null,
}: {
  agree: (ai: boolean | null) => Promise<{ ok: false; message: string }>;
  /** null 이면 AI 선택 항목을 보이지 않는다(명단과 연결 안 된 계정). 값은 지금 동의 상태 */
  ai?: boolean | null;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [aiOn, setAiOn] = useState<boolean>(ai ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const all = TERMS_ITEMS.every((t) => checked[t.key]);

  return (
    <div className="flex flex-col gap-4">
      {TERMS_ITEMS.map((t) => (
        <label key={t.key} className={`${CARD} flex items-start gap-3 p-4`}>
          <input
            type="checkbox"
            checked={!!checked[t.key]}
            onChange={(e) => setChecked((c) => ({ ...c, [t.key]: e.target.checked }))}
            className="mt-1 size-[20px] shrink-0 accent-[var(--gg-sky)]"
            data-testid={`terms-${t.key}`}
          />
          <span className="space-y-1.5">
            <span className="block text-[16px] font-bold">{t.label}</span>
            <span className="block text-[14px] leading-relaxed text-muted">{t.body}</span>
          </span>
        </label>
      ))}

      {ai !== null ? (
        <label className={`${CARD} flex items-start gap-3 p-4`}>
          <input
            type="checkbox"
            checked={aiOn}
            onChange={(e) => setAiOn(e.target.checked)}
            className="mt-1 size-[20px] shrink-0 accent-[var(--gg-sky)]"
            data-testid="terms-ai"
          />
          <span className="space-y-1.5">
            <span className="block text-[16px] font-bold">{TERMS_AI.label}</span>
            <span className="block text-[14px] leading-relaxed text-muted">{TERMS_AI.body}</span>
          </span>
        </label>
      ) : null}

      <Link href="/privacy" className="self-start px-1 text-[14px] font-semibold text-[var(--gg-sky-ink)] underline underline-offset-4">
        개인정보 처리방침 보기
      </Link>

      {error ? <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]">{error}</p> : null}

      <div className="mt-2 flex flex-col gap-3">
        <button
          type="button"
          disabled={!all || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await agree(ai === null ? null : aiOn);
              if (r && !r.ok) setError(r.message);
            })
          }
          className={`${BTN("leaf")} w-full disabled:opacity-40`}
          data-testid="terms-agree"
        >
          동의하고 시작하기
        </button>
        <SignOutButton className={`${BTN("white")} w-full`}>동의하지 않고 나가기</SignOutButton>
      </div>
    </div>
  );
}
