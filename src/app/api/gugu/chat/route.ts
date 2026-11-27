import { getUserContext } from "@/lib/auth/session";
import { commitQuestion, releaseQuestion, reserveQuestion } from "@/lib/ai/chat-quota";
import { CHAT_MAX_CHARS, CHAT_MAX_TURNS, runChat, type ChatEvent, type ChatTurn } from "@/lib/ai/gugu-chat";
import { failText, guguAiEnabled } from "@/lib/ai/gugu-ai";
import { createClient } from "@/lib/supabase/server";

/**
 * 구구 챗봇(2026-11-12) — POST { turns: [{ role, text }] } → 한 줄에 하나씩 JSON 이벤트(application/x-ndjson)
 *   { t: "d", v } 답 조각 · { t: "s", v } 찾는 중 안내 · { t: "e", v } 실패 문구
 *   { t: "q", used, quota } 센 뒤 이번 달 횟수(리더) · { t: "x", used, quota } 이번 달 다 씀 · { t: "end" }
 * 리더(자기 목장) · 목사님만. 대화는 남기지 않는다.
 *
 * 질문 횟수(2026-11-12) — 리더는 한 달 20번. AI 를 부르기 전에 DB 가 자리를 예약하고(다 썼으면 x 만 보내고 끝 — Anthropic 을
 * 부르지 않는다), 답을 제대로 받았을 때만 확정(+1), 오류 · 거절 · 시간 초과 · 나감이면 예약을 푼다. 목사님은 세지 않는다.
 */
export const maxDuration = 60;

function isTurns(x: unknown): x is ChatTurn[] {
  return (
    Array.isArray(x) &&
    x.length > 0 &&
    x.length <= CHAT_MAX_TURNS * 2 &&
    x.every((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.length <= CHAT_MAX_CHARS * 4) &&
    x[x.length - 1].role === "user"
  );
}

export async function POST(req: Request) {
  const me = await getUserContext();
  if (!me || !(me.leadsGroup || me.role === "pastor")) return new Response("forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as { turns?: unknown } | null;
  if (!isTurns(body?.turns)) return new Response("bad request", { status: 400 });
  const turns = body.turns;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          // 사용자가 이미 나갔다
        }
      };
      try {
        if (!guguAiEnabled()) {
          send({ t: "e", v: failText("off") });
          return;
        }
        const supabase = await createClient();
        const seat = await reserveQuestion(supabase);
        if (seat.kind === "error") {
          send({ t: "e", v: failText("load") });
          return;
        }
        if (seat.kind === "exhausted") {
          send({ t: "x", used: seat.used, quota: seat.quota });
          return;
        }
        let ok = false;
        try {
          ok = await runChat(me, turns, send, req.signal, supabase);
        } catch {
          send({ t: "e", v: failText("unknown") });
        }
        if (seat.kind === "hold") {
          if (ok) {
            const n = await commitQuestion(supabase, seat.holdId);
            if (n) send({ t: "q", used: n.used, quota: n.quota });
          } else {
            await releaseQuestion(supabase, seat.holdId);
          }
        }
        if (ok) send({ t: "end" });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
