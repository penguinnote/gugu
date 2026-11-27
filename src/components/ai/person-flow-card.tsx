"use client";

import { useState } from "react";

import { IconCard } from "@/components/toss";

import type { FlowResult } from "@/lib/ai/person-flow";

/**
 * 사람 화면의 '✨ 최근 흐름' 카드(2026-11-12) — 'AI 요약 만들기' 를 누를 때만 만든다(저장하지 않는다).
 * action 은 서버 동작(flow-action.ts). 디자인 확인 화면은 가짜 동작을 넣는다.
 */
export function PersonFlowCard({ personId, action }: { personId: string; action: (personId: string) => Promise<FlowResult> }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "fail"; message: string }>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "busy" });
    const r = await action(personId).catch((): FlowResult => ({ ok: false, message: "AI가 답하지 못했어요. 잠시 뒤 다시 해 주세요." }));
    setState(r.ok ? { kind: "done", text: r.text } : { kind: "fail", message: r.message });
  };
  return (
    <IconCard icon="/icons/tossface/u2728.svg" title="최근 흐름" testId="person-flow">
      {state.kind === "done" ? (
        <div className="space-y-3">
          <p className="gg-text text-[15px] leading-relaxed break-keep" data-testid="person-flow-text">
            {state.text}
          </p>
          <button type="button" onClick={run} className="text-[13.5px] font-semibold text-[var(--gg-section)]">
            다시 만들기
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {state.kind === "fail" ? (
            <p role="alert" className="text-[14px] font-semibold text-[var(--gg-berry-ink)]">
              {state.message}
            </p>
          ) : null}
          <button type="button" onClick={run} disabled={state.kind === "busy"} className="gg-btn gg-btn-white gg-btn-sm !h-11 w-full" data-testid="person-flow-run">
            {state.kind === "busy" ? "정리하는 중…" : "AI 요약 만들기"}
          </button>
        </div>
      )}
    </IconCard>
  );
}
