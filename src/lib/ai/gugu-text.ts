import { formatWeekLabel } from "@/lib/week";

import type { Anon } from "./anon";
import { COMMON_WORD_NAMES, givenNameOf } from "./names";

/**
 * 구구 AI 글 다루기(2026-11-12) — 서버 밖에서도 돌아가는 순수 함수만(시험이 바로 부른다).
 *   scrubBareGiven  메모 · 질문에서 성 뺀 이름만 쓴 것도 기호로
 *   flowLines       사람 한 명의 주별 기록 → AI 에 보낼 줄
 *   tokenStreamer   흘려보내는 답의 기호를 이름으로(끝에 걸린 기호는 다음 조각까지 붙잡는다)
 */

/** 같은 목장 사람의 '이름만'(성 뺀) 쓴 것도 기호로 — 메모는 '하윤: 시험' 처럼 이름만 쓰기 쉽다. 흔한 낱말 이름은 건너뛴다 */
export function scrubBareGiven(text: string, members: { id: string; name: string }[], anon: Anon): string {
  let out = text;
  const seen = new Map<string, string[]>();
  for (const m of members) {
    const g = givenNameOf(m.name);
    if (g && !COMMON_WORD_NAMES.has(g)) seen.set(g, [...(seen.get(g) ?? []), m.id]);
  }
  for (const [given, ids] of [...seen.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (ids.length !== 1) continue; // 같은 이름이 둘이면 누구인지 모른다
    const t = anon.token(ids[0]) ?? "(이름 생략)";
    // 이름 뒤 '이' + 조사(하윤이가 · 하윤이랑)는 '이' 까지 기호로
    const re = new RegExp(`(?<![가-힣])${given}(이(?=[가는를랑도와의]|한테|에게))?`, "g");
    out = out.replace(re, (m: string, _i: string | undefined, offset: number, whole: string) => {
      const next = whole[offset + m.length];
      // 바로 뒤가 한글이면 조사 · 호칭(언니 · 오빠 · 누나 · 형 · 자매 …)일 때만 — 이름 뒤에 붙은 다른 낱말이면 그대로
      if (next && /[가-힣]/.test(next) && !/[이가은는을를의도와과랑한에께님씨언오누형자]/.test(next)) return m;
      return t;
    });
  }
  return out;
}


export type FlowRec = {
  week_key: string | null;
  worship_attended: boolean | null;
  worship_online: boolean | null;
  group_meeting_attended: boolean | null;
  one_on_one_contacted: boolean | null;
  prayer_request: string | null;
  group_id_at_write: string | null;
};

/** 주별 줄 — 기록이 없는 주 · 휴주도 한 줄씩(최근 → 과거) */
export function flowLines(recs: FlowRec[], weeks: string[], skipped: Set<string>, scrub: (t: string, g: string | null) => string): string[] {
  const byWeek = new Map(recs.flatMap((r) => (r.week_key ? [[r.week_key, r] as const] : [])));
  return weeks.map((w) => {
    const label = formatWeekLabel(w);
    if (skipped.has(w)) return `- ${label}: 휴주`;
    const r = byWeek.get(w);
    if (!r) return `- ${label}: 기록 없음`;
    const worship = r.worship_attended ? (r.worship_online ? "온라인 예배" : "현장 예배") : "예배 결석";
    const meeting = r.group_meeting_attended ? "목장 참석" : "목장 불참";
    const contact = r.one_on_one_contacted ? "개별 연락으로 교제 있음" : "개별 연락으로 교제 없음";
    const prayer = r.prayer_request?.trim() ? ` · 기도제목: ${scrub(r.prayer_request.trim(), r.group_id_at_write)}` : "";
    return `- ${label}: ${worship} · ${meeting} · ${contact}${prayer}`;
  });
}


/** 흘려보내는 글에서 기호를 이름으로 — 끝에 걸린 기호(P · P0 · P01 + 조사)는 다음 조각이 올 때까지 붙잡는다 */
export function tokenStreamer(anon: Anon, emit: (text: string) => void) {
  let pending = "";
  const HOLD = /P\d{0,3}(?:\s?(?:형|자|형제|자매)님?)?[가-힣]{0,3}$/;
  return {
    push(delta: string) {
      pending += delta;
      const m = HOLD.exec(pending);
      const cut = m ? m.index : pending.length;
      if (cut > 0) {
        emit(anon.fill(pending.slice(0, cut)));
        pending = pending.slice(cut);
      }
    },
    flush() {
      if (pending) emit(anon.fill(pending));
      pending = "";
    },
  };
}
