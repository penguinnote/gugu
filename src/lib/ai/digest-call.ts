import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

import { DIGEST_SCHEMA, DIGEST_SYSTEM, type DigestOutput } from "./digest-core";

/**
 * Claude 부르기 한 번(2026-11-07) — 앱(digest.ts)과 평가(eval/digest)가 같이 쓴다. 서버에서만 부른다(ANTHROPIC_API_KEY).
 * 생각은 기본(adaptive) · 응답은 JSON 스키마(structured outputs).
 * temperature 는 보내지 않는다(400). 도구 강제 호출도 쓰지 않는다 — JSON 은 output_config.format 으로.
 * 거절(stop_reason refusal)은 HTTP 200 으로 온다 — content 를 읽기 전에 본다.
 *
 * 모델 · effort 는 환경변수로 고른다(2026-11-06 — 소넷 · 하이쿠 비교 평가):
 *   DIGEST_MODEL   claude-sonnet-5-5(기본) · claude-haiku-5-5. 없거나 그 밖의 값이면 소넷
 *   DIGEST_EFFORT  low · medium(기본) · high · xhigh · max. 그 모델이 지원하지 않는 값이면 medium
 *     (Anthropic 문서 기준 두 모델 모두 low~max 다섯 단계. 기본값은 소넷 5.5 high · 하이쿠 5.5 medium 이라 둘 다 medium 으로 맞춘다)
 *   서버 쪽 재시도 모델(fallbacks)은 소넷만 — 하이쿠 5.5 에는 없다(넣으면 거절은 그대로거나 400)
 */
export const DIGEST_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type DigestModel = (typeof DIGEST_MODELS)[number];
export const DEFAULT_DIGEST_MODEL: DigestModel = "claude-sonnet-5-5";

export const DIGEST_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type DigestEffort = (typeof DIGEST_EFFORTS)[number];
export const DEFAULT_DIGEST_EFFORT: DigestEffort = "medium";
const SUPPORTED_EFFORT: Record<DigestModel, readonly DigestEffort[]> = {
  "claude-sonnet-5-5": DIGEST_EFFORTS,
  "claude-haiku-5-5": DIGEST_EFFORTS,
};

export function resolveDigestModel(value: string | undefined = process.env.DIGEST_MODEL): DigestModel {
  const v = value?.trim();
  return (DIGEST_MODELS as readonly string[]).includes(v ?? "") ? (v as DigestModel) : DEFAULT_DIGEST_MODEL;
}

export function resolveDigestEffort(model: DigestModel, value: string | undefined = process.env.DIGEST_EFFORT): DigestEffort {
  const v = value?.trim().toLowerCase();
  return (SUPPORTED_EFFORT[model] as readonly string[]).includes(v ?? "") ? (v as DigestEffort) : DEFAULT_DIGEST_EFFORT;
}

export type CallOptions = { model?: DigestModel; effort?: DigestEffort };
export type CallResult =
  | { ok: true; out: DigestOutput; inputTokens: number; outputTokens: number; model: DigestModel; effort: DigestEffort }
  | { ok: false; reason: string; retry: boolean; model: DigestModel; effort: DigestEffort };

export async function callClaude(body: string, opts: CallOptions = {}): Promise<CallResult> {
  const model = opts.model ?? resolveDigestModel();
  const effort = opts.effort && (SUPPORTED_EFFORT[model] as readonly string[]).includes(opts.effort) ? opts.effort : resolveDigestEffort(model);
  const fail = (reason: string, retry: boolean): CallResult => ({ ok: false, reason, retry, model, effort });
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // 안전 검사에 걸리면 서버가 알맞은 모델로 한 번 더 해 본다(소넷만 · 사이버 · AI 개발 분류만 — 기도제목 정리엔 드물다)
      ...(model === "claude-sonnet-5-5" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort, format: betaJSONSchemaOutputFormat(DIGEST_SCHEMA) },
      system: DIGEST_SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    if (res.stop_reason === "refusal") return fail("refusal", false);
    if (res.stop_reason === "max_tokens") return fail("max_tokens", true);
    if (!res.parsed_output) return fail("parse", true);
    return { ok: true, out: res.parsed_output as DigestOutput, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model, effort };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail("auth", false);
    if (e instanceof Anthropic.BadRequestError) return fail("bad_request", false);
    if (e instanceof Anthropic.RateLimitError) return fail("rate_limit", false);
    if (e instanceof Anthropic.APIConnectionError) return fail("network", true);
    if (e instanceof Anthropic.APIError) return fail(`api_${e.status ?? "x"}`, true);
    return fail("parse", true);
  }
}

/**
 * 예상 비용(달러) — Anthropic 공식 가격표(platform.claude.com/docs/en/about-claude/pricing, 2026-11-06 확인), 100만 토큰당.
 *   소넷 5.5  입력 $2 · 출력 $10
 *   하이쿠 5.5 입력 $0.10 · 출력 $0.50 (프롬프트 10만 토큰 넘으면 $0.50 · $2.50)
 * 생각(thinking) 토큰은 출력 토큰에 들어 있다. 캐시 · 배치 · 미국 전용 처리 할증은 쓰지 않으므로 빼고 셈한다.
 */
export function estimateCostUsd(model: DigestModel, inputTokens: number, outputTokens: number): number {
  const [inRate, outRate] =
    model === "claude-haiku-5-5" ? (inputTokens > 100_000 ? [0.5, 2.5] : [0.1, 0.5]) : [2, 10];
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}
