import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

/**
 * 구구 AI(2026-11-12) — 사람별 흐름 요약 · 보고서 받아쓰기 · 구구 챗봇이 같이 쓰는 Claude 부르기.
 *
 * 켜는 조건(모두): GUGU_AI_ENABLED=true · ANTHROPIC_API_KEY · Vercel Production.
 *   목사님 AI 정리(DIGEST_AI_ENABLED)와 따로 켜고 끈다. 미리보기가 운영 DB 를 쓰므로 Production 밖에서는 부르지 않는다.
 *   모델은 GUGU_AI_MODEL(기본 claude-sonnet-5-5 · claude-haiku-5-5 도 됨).
 * 이름은 보내기 전에 기호로 바꾼다(anon.ts). 로그에는 까닭 코드 · 토큰 수만 — 글은 남기지 않는다.
 */

export function guguAiEnabled(): boolean {
  return process.env.GUGU_AI_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY && process.env.VERCEL_ENV === "production";
}

const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type GuguModel = (typeof MODELS)[number];
export function guguModel(): GuguModel {
  const v = process.env.GUGU_AI_MODEL?.trim();
  return (MODELS as readonly string[]).includes(v ?? "") ? (v as GuguModel) : "claude-sonnet-5-5";
}

export function anthropic() {
  return new Anthropic({ timeout: 90_000, maxRetries: 1 });
}

export type AiFail = { ok: false; reason: string };

/** SDK 오류 → 까닭 코드 */
export function failReason(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "auth";
  if (e instanceof Anthropic.BadRequestError) return "bad_request";
  if (e instanceof Anthropic.RateLimitError) return "rate_limit";
  if (e instanceof Anthropic.APIConnectionError) return "network";
  if (e instanceof Anthropic.APIError) return `api_${e.status ?? "x"}`;
  return "unknown";
}

/** 짧은 글 한 번(흐름 요약) */
export async function askText(system: string, user: string, maxTokens = 2000): Promise<{ ok: true; text: string } | AiFail> {
  try {
    const res = await anthropic().messages.create({
      model: guguModel(),
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text) return { ok: false, reason: res.stop_reason === "max_tokens" ? "max_tokens" : "empty" };
    console.info("[gugu-ai] text", res.usage.input_tokens, res.usage.output_tokens);
    return { ok: true, text };
  } catch (e) {
    const reason = failReason(e);
    console.error("[gugu-ai] text failed", reason);
    return { ok: false, reason };
  }
}

/** JSON 스키마로 받기(받아쓰기) */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 6000): Promise<{ ok: true; out: T } | AiFail> {
  try {
    const res = await anthropic().beta.messages.parse({
      model: guguModel(),
      max_tokens: maxTokens,
      output_config: { effort: "low", format: betaJSONSchemaOutputFormat(schema as never) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens" };
    if (!res.parsed_output) return { ok: false, reason: "parse" };
    console.info("[gugu-ai] json", res.usage.input_tokens, res.usage.output_tokens);
    return { ok: true, out: res.parsed_output as T };
  } catch (e) {
    const reason = failReason(e);
    console.error("[gugu-ai] json failed", reason);
    return { ok: false, reason };
  }
}

/** 화면에 보일 실패 문구 */
export function failText(reason: string): string {
  if (reason === "off") return "지금은 AI를 쓸 수 없어요.";
  if (reason === "rate_limit") return "AI가 바빠요. 잠시 뒤 다시 해 주세요.";
  if (reason === "refusal") return "AI가 이 내용은 다루지 않았어요.";
  return "AI가 답하지 못했어요. 잠시 뒤 다시 해 주세요.";
}
