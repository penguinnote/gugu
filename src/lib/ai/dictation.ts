import "server-only";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { makeAnon } from "./anon";
import { askJson, failText, guguAiEnabled } from "./gugu-ai";
import { memoWithout } from "@/lib/memo-split";

import { scrubBareGiven } from "./gugu-text";

/**
 * 보고서 받아쓰기(2026-11-12) — 리더가 모임 메모(단톡 · 메모장)를 붙여 넣으면 사람별 기도제목과 목장 특이사항으로 나눈다.
 * 채우는 것은 기도제목 · 특이사항뿐(사용자 결정 — 출석 · 컨택은 리더가 누른다). 화면이 결과를 먼저 보이고, 리더가 고른 것만 넣는다.
 * 자료는 리더 세션으로 읽는다(RLS) — 그 보고서의 목장 리더만. 이름은 기호로 바꿔 보내고(anon.ts) AI 에서 뺀 사람은 받지 않는다.
 * 저장하지 않는다 — 넣은 뒤 리더가 고쳐서 평소처럼 제출한다.
 * AI 가 다루지 않는 사람(동의 전) · AI 가 꺼졌거나 답하지 못할 때는 화면이 AI 없이 이름으로 나눈다(lib/memo-split, 2026-11-16).
 */

export const MEMO_MAX = 4000;

export const DICTATION_SYSTEM = `너는 교회 청년부 목장 리더가 보고서 쓰는 것을 돕는 비서다. 리더가 모임 중에 적은 메모를 받아, 목장원마다 기도제목을 나누고 목장 전체 특이사항을 따로 뽑는다.

입력
- 명단: 이번 보고서에 들어가는 사람 기호(P01 같은). 메모 속 이름도 같은 기호로 바뀌어 있다.
- 메모: 리더가 쓴 글. '(이름 생략)'은 다루지 않는 사람이다 — 그 사람 내용은 버린다.

쓰는 법
- prayers: 명단에 있는 사람만, 메모에 그 사람 기도제목이나 나눔이 있을 때만 넣는다. 없으면 빼고 지어내지 않는다.
- 기도제목은 메모의 뜻을 그대로 살려 짧게 다듬는다. 메모에 없는 내용 · 해석 · 조언을 더하지 않는다.
- 꼴을 맞춘다: 모든 기도제목은 '~도록' 으로 끝낸다('~기를' · '~으면 좋겠어요' · '~기도해 주세요' 로 끝내지 않는다). 상황은 바람 앞에 이어 쓴다(예: '시험 기간이라 집중이 어려운데, 시험 잘 볼 수 있도록'). 끝에 마침표를 붙이지 않는다. 한 사람의 기도제목이 둘 이상이면 ' / ' 로 이어 한 줄로 쓴다(글머리표 · 줄바꿈 없이). 'ㅎㅎ' · 'ㅠㅠ' 같은 것은 뺀다.
- 맞춤법 · 띄어쓰기 · 문장부호는 표준어 규정에 맞게 반드시 고친다(예: 잘할수있도록 → 잘할 수 있도록, 한주 → 한 주, 고민중 → 고민 중, 지원하는걸 → 지원하는 걸, 되길 → 되기를). 구어체 · 줄임말도 바른 말로 바꾼다. 고유 이름(학교 · 프로그램 이름)은 그대로 둔다.
- 특이사항도 같은 규칙으로 맞춤법을 고친다.
- 기도제목 안에서 다른 사람을 가리킬 때도 기호로 쓴다.
- note: 한 사람의 기도제목이 아닌 목장 전체 이야기(모임 장소 · 함께 한 일 · 새로 온 사람 · 다음 일정 등). 없으면 빈 글.
- 출석 · 결석 · 연락 여부는 쓰지 않는다(리더가 따로 누른다).`;

export const DICTATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prayers", "note"],
  properties: {
    prayers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "prayer"],
        properties: { who: { type: "string" }, prayer: { type: "string" } },
      },
    },
    note: { type: "string" },
  },
} as const;

type Out = { prayers: { who: string; prayer: string }[]; note: string };

export type DictationResult =
  | { ok: true; prayers: { personId: string; prayer: string }[]; note: string }
  | { ok: false; message: string };

export async function splitMemo(reportId: string, personIds: string[], memo: string): Promise<DictationResult> {
  const me = await getUserContext();
  if (!me || !me.leadsGroup || !me.groupId) return { ok: false, message: "목장 리더만 쓸 수 있어요." };
  if (!guguAiEnabled()) return { ok: false, message: failText("off") };
  const text = memo.trim();
  if (!text) return { ok: false, message: "메모를 붙여 넣어 주세요." };
  if (text.length > MEMO_MAX) return { ok: false, message: `메모가 너무 길어요. ${MEMO_MAX.toLocaleString()}자까지 돼요.` };

  const supabase = await createClient();
  const { data: report } = await supabase.from("reports").select("id, group_id").eq("id", reportId).maybeSingle();
  if (!report || report.group_id !== me.groupId) return { ok: false, message: "이 목장보고서를 쓸 수 없어요." };

  const { data: people, error } = await supabase.from("persons").select("id, name, status, ai_excluded, group_id");
  if (error) return { ok: false, message: failText("load") };
  const all = (people ?? []).map((p) => ({ id: p.id, name: p.name, excluded: p.ai_excluded || p.status === "opted_out", groupId: p.group_id }));
  const listed = all.filter((p) => personIds.includes(p.id));
  const anon = makeAnon(all);
  const tokens = listed.flatMap((p) => {
    const t = anon.token(p.id);
    return t ? [t] : [];
  });
  if (tokens.length === 0) return { ok: false, message: "채울 수 있는 사람이 없어요." };
  // 동의하지 않은 사람 앞으로 적힌 줄은 보내기 전에 덜어 낸다(2026-11-16) — 그 사람 것은 화면이 AI 없이 나눈다(lib/memo-split)
  const kept = memoWithout(listed, text, new Set(listed.filter((p) => p.excluded).map((p) => p.id)));
  const scrubbed = scrubBareGiven(anon.scrub(kept, me.groupId), listed.filter((p) => !p.excluded), anon);
  const body = `명단: ${tokens.join(", ")}\n\n메모:\n${scrubbed}`;

  const res = await askJson<Out>(DICTATION_SYSTEM, body, DICTATION_SCHEMA as unknown as Record<string, unknown>);
  if (!res.ok) return { ok: false, message: failText(res.reason) };
  const allowed = new Set(listed.filter((p) => !p.excluded).map((p) => p.id));
  const prayers = res.out.prayers.flatMap((x) => {
    const id = anon.personOf(x.who.trim());
    const prayer = anon.fill(x.prayer).trim();
    return id && allowed.has(id) && prayer ? [{ personId: id, prayer }] : [];
  });
  return { ok: true, prayers, note: anon.fill(res.out.note).trim() };
}
