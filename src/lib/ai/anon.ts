import { isJosaHere, JOSA_PATTERN, josaFor } from "./josa";
import { givenNameScrubber, type NamedPerson } from "./names";

/**
 * 이름 가리기 · 되돌리기(2026-11-12 구구 AI — 흐름 요약 · 받아쓰기 · 챗봇이 같이 쓴다). 목사님 AI 정리(digest-core)와 같은 원칙:
 *   · 사람 이름은 AI 에 보내지 않는다 — 성까지 붙은 이름 · 이름만 쓴 것(호칭 · 조사 붙을 때) 모두 P01 같은 기호로
 *   · AI 에서 뺀 사람(ai_excluded · 떠남)은 기호도 주지 않고 '(이름 생략)'
 *   · AI 가 쓴 글의 기호는 화면에서 이름으로 되돌리고, 뒤에 붙은 조사를 받침에 맞춘다(josa.ts)
 * 목장 이름은 가리지 않는다(사람이 아니다).
 */

export const OMITTED = "(이름 생략)";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pad = (n: number) => String(n).padStart(2, "0");

export type Anon = {
  /** 사람 → 기호(처음 부르면 새로 매긴다). 뺀 사람이면 null */
  token: (personId: string) => string | null;
  /** 글 속 이름을 기호로 */
  scrub: (text: string, groupId?: string | null) => string;
  /** AI 가 쓴 글의 기호를 이름으로(조사 맞춤) — 모르는 기호는 '(이름 없음)' */
  fill: (text: string) => string;
  /** 기호 → 사람 id */
  personOf: (token: string) => string | null;
};

export function makeAnon(persons: NamedPerson[]): Anon {
  const excluded = new Set(persons.filter((p) => p.excluded).map((p) => p.id));
  const nameOf = new Map(persons.map((p) => [p.id, p.name]));
  const toToken = new Map<string, string>();
  const toPerson = new Map<string, string>();
  const token = (id: string) => {
    if (excluded.has(id)) return null;
    let t = toToken.get(id);
    if (!t) {
      t = `P${pad(toToken.size + 1)}`;
      toToken.set(id, t);
      toPerson.set(t, id);
    }
    return t;
  };
  const named = persons.filter((p) => p.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  // givenNameScrubber 는 뺀 사람에게 기호를 묻지 않는다(뺀 사람은 OMITTED) — 그래도 null 이면 생략으로
  const scrubGiven = givenNameScrubber(persons, (id) => token(id) ?? OMITTED, OMITTED);
  const scrub = (text: string, groupId: string | null = null) => {
    let out = text;
    for (const p of named) {
      if (!out.includes(p.name)) continue;
      out = out.replace(new RegExp(escapeRe(p.name), "g"), token(p.id) ?? OMITTED);
    }
    return scrubGiven(out, groupId).replace(/[ \t]+/g, " ").trim();
  };
  const TOKEN = new RegExp(`\\b(P\\d{2,3})(\\s?(?:형제|자매)님?)?(${JOSA_PATTERN})?`, "g");
  const fill = (text: string) =>
    text.replace(TOKEN, (m: string, t: string, _title: string | undefined, particle: string | undefined, offset: number, whole: string) => {
      const id = toPerson.get(t);
      const name = id ? (nameOf.get(id) ?? "(이름 없음)") : "(이름 없음)";
      if (!particle) return name;
      const next = whole[offset + m.length];
      return name + (isJosaHere(particle, next) ? josaFor(name, particle) : particle);
    });
  return { token, scrub, fill, personOf: (t) => toPerson.get(t) ?? null };
}
