/**
 * 이름 뒤 조사 맞추기(2026-11-07) — AI 는 P01 같은 기호 뒤에 조사를 붙이고, 화면이 기호를 이름으로 바꾼다.
 * 그래서 '류나무이' · '서강물가' 처럼 받침과 조사가 어긋난다. 이름 마지막 글자를 보고 고친다.
 * 라이브러리를 쓰지 않는다 — 받침은 한글 음절 코드로 바로 셈하고, 다루는 조사는 아래 목록뿐이다.
 *
 * 다루는 조사(받침 있을 때 / 없을 때 · 맞춤법이 틀린 꼴도 받아서 고친다)
 *   이/가 · 은/는 · 을/를 · 과/와 · 으로/로(ㄹ 받침은 로) · 이나/나 · 이랑/랑 · 이며/며
 *   이에요/예요 · 이었/였 · 이라고/라고 · 이라는/라는 · 이라서/라서
 * 의 · 도 · 에게 · 만 · 께 · 처럼 같은 조사는 받침과 상관없어 손대지 않는다.
 *
 * 마지막 글자
 *   한글 음절  받침 없음 · ㄹ · 그 밖의 받침
 *   숫자       읽는 소리로(1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 · 0 영 → 받침, 2 · 4 · 5 · 9 → 없음)
 *   영문       m · n · ng 로 끝나면 받침, l 은 ㄹ, 그 밖은 받침 없음(Mark → 마크)
 *   괄호 · 문장부호는 건너뛰고 그 앞 글자를 본다 — '(이름 없음)' 은 '음'
 *   모르면(한글 자모만 · 기호만) 고치지 않는다
 */

type Coda = "none" | "rieul" | "other";

/** [받침 있을 때, 없을 때] — 긴 것부터 맞춘다 */
const PAIRS: readonly [string, string, ...string[]][] = [
  ["이에요", "예요", "이예요"],
  ["이라고", "라고"],
  ["이라는", "라는"],
  ["이라서", "라서"],
  ["으로", "로"],
  ["이나", "나"],
  ["이랑", "랑"],
  ["이며", "며"],
  ["이었", "였"],
  ["이", "가"],
  ["은", "는"],
  ["을", "를"],
  ["과", "와"],
];

const FORM = new Map<string, number>();
PAIRS.forEach((forms, i) => forms.forEach((f) => FORM.set(f, i)));
const FORMS = [...FORM.keys()].sort((a, b) => b.length - a.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 바로 뒤에 붙은 조사(긴 것부터) */
export const JOSA_PATTERN = `(?:${FORMS.map(escapeRe).join("|")})`;

/** 한 글자 조사 뒤에 한글이 바로 이어지면 조사가 아니다('가족' · '이번' · '나무') — 로 · 과 · 와 뒤의 이 글자들만 예외(로서 · 로부터 · 과도 · 와는 …) */
const AFTER_ONE = new Set(["도", "는", "의", "만", "서", "써", "부", "까"]);
const STACKS = new Set(["로", "과", "와"]);

const DIGIT_CODA: Record<string, Coda> = { "0": "other", "1": "rieul", "2": "none", "3": "other", "4": "none", "5": "none", "6": "other", "7": "rieul", "8": "rieul", "9": "none" };

export function codaOf(word: string): Coda | null {
  const w = word.replace(/[^0-9A-Za-z가-힣]+$/u, "");
  const last = w.at(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
  }
  if (last in DIGIT_CODA) return DIGIT_CODA[last];
  const lower = w.toLowerCase();
  if (/(m|n|ng)$/.test(lower)) return "other";
  if (lower.endsWith("l")) return "rieul";
  if (/[a-z]$/.test(lower)) return "none";
  return null;
}

/** word 뒤에 쓸 조사 — 다루지 않는 조사이거나 받침을 모르면 그대로 */
export function josaFor(word: string, particle: string): string {
  const i = FORM.get(particle);
  const coda = codaOf(word);
  if (i === undefined || coda === null) return particle;
  const [withCoda, without] = PAIRS[i];
  if (withCoda === "으로") return coda === "other" ? "으로" : "로";
  return coda === "none" ? without : withCoda;
}

/** 조사로 볼 수 있나 — 한 글자 조사 바로 뒤에 다른 한글이 붙어 있으면 낱말의 일부로 본다 */
export function isJosaHere(particle: string, next: string | undefined): boolean {
  if (particle.length > 1 || particle === "였" || !next) return true; // 였 은 늘 뒤에 어미가 붙는다(였다 · 였고)
  return !/[가-힣]/.test(next) || (STACKS.has(particle) && AFTER_ONE.has(next));
}
