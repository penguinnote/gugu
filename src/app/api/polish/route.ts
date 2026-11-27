import { existsSync } from "node:fs";
import { join } from "node:path";

import { getUserContext } from "@/lib/auth/session";
import { fixSpacing } from "@/lib/spell/kiwi";
import { dropJamo, fixSpelling } from "@/lib/spell/rules";

/**
 * 맞춤법 · 띄어쓰기 고치고 꼴 맞추기 — AI 없이(2026-11-16). POST { prayers: string[], note?: string } → { prayers, note, spaced }
 *   1) 자음 · 모음만 있는 것(ㅎㅎ · ㅠㅠ)을 지우고 규칙으로 맞춤법을 고친다(lib/spell/rules)
 *   2) 형태소 분석기로 띄어쓰기를 고치고(lib/spell/kiwi) 문장마다 한 줄로 나눈다(둘 이상이면 글머리표)
 *   3) 기도제목은 문장 끝을 '~도록' 으로 맞춘다(lib/spell/prayer-form). 특이사항(note)은 끝을 바꾸지 않는다
 * 모두 우리 서버 안에서 돈다 — 글은 밖으로 나가지 않고 남기지도 않는다. 분석기를 못 쓰면 1)만 한 글을 준다(spaced: false).
 * 보고서를 쓰는 사람만(목장 리더). 이 길에만 모델을 싣는다(next.config outputFileTracingIncludes).
 */
export const maxDuration = 30;

const MAX_TEXTS = 60;
const MAX_CHARS = 4000;

/** 배포에 모델이 실렸는지만 알린다(글 · 사람 정보 없음) — 배포 뒤 확인용 */
export function GET() {
  return Response.json({ model: existsSync(join(process.cwd(), "vendor", "kiwi-model", "cong.mdl")) });
}

export async function POST(req: Request) {
  const me = await getUserContext();
  if (!me || !me.leadsGroup) return new Response("forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as { prayers?: unknown; note?: unknown } | null;
  const prayers = body?.prayers;
  const note = typeof body?.note === "string" ? body.note : "";
  if (!Array.isArray(prayers) || prayers.length > MAX_TEXTS || !prayers.every((t) => typeof t === "string") || prayers.join("").length + note.length > MAX_CHARS * 2) {
    return new Response("bad request", { status: 400 });
  }
  const texts = [...(prayers as string[]), note].map((t) => fixSpelling(dropJamo(t)));
  const done = (await fixSpacing(texts, (i) => i < prayers.length)) ?? null;
  const out = done ?? texts;
  return Response.json({ prayers: out.slice(0, prayers.length), note: out[prayers.length], spaced: done !== null });
}
