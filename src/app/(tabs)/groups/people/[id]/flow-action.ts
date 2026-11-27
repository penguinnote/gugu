"use server";

import { summarizePersonFlow, type FlowResult } from "@/lib/ai/person-flow";

/** 사람 화면 'AI 요약 만들기'(2026-11-12) — 권한 · 켜짐은 summarizePersonFlow 가 본다 */
export async function summarizeFlowAction(personId: string): Promise<FlowResult> {
  return summarizePersonFlow(personId);
}
