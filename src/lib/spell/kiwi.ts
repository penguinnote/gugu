import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 띄어쓰기 고치기 — Kiwi 형태소 분석기(Apache-2.0, https://github.com/bab2min/Kiwi)의 WASM 판을 우리 서버에서 돌린다(2026-11-16).
 * 글은 밖으로 나가지 않는다. 모델(약 104MB)은 빌드 때 vendor/kiwi-model 에 받는다(scripts/fetch-kiwi-model.mjs).
 * 처음 부를 때 한 번 올리고(3초쯤) 그 뒤로는 그대로 쓴다. 모델이 없거나 올리지 못하면 null — 부르는 쪽은 규칙만으로 간다.
 * 공백만 바꾼 결과만 받는다 — 글자가 하나라도 달라지면(마침표를 붙이는 등) 그 줄은 원래대로 둔다. 조사 오타 고치기(을↔를 · 은↔는)만 예외다.
 *
 * 띄울 자리 거르기(2026-11-23) — 분석기는 붙여 쓴 어절을 낱말마다 다 쪼갰다('감사함안에서' → '감사 함 안에서', '제자반' → '제자 반',
 *   '기도제목' → '기도 제목'). 그래서 분석기가 띄운 자리마다 그 앞뒤 조각을 본다(spaceOk):
 *     뒤 조각이 조사 · 어미 · 접미사 · 이다면 띄우지 않는다
 *     앞뒤가 모두 명사류면 띄우지 않는다 — 뒤가 띄어 써야 하는 명사(동안 · 때 · 중 · 안 …, SPACED_NOUN)일 때만 띄운다
 * 조사 오타(2026-11-23) — 받침 없는 명사 뒤 '을 · 은', 받침 있는 명사 뒤 '를 · 는' 을 짝으로 바꿔 보고, 분석기가 그 글자를 조사로 읽을 때만 받는다(fixJosa).
 */

import { formatLines, type FormKiwi, type Tok } from "./prayer-form";

type Spacer = { space: (s: string, resetWhitespace?: boolean) => string } & FormKiwi;
let loading: Promise<Spacer | null> | null = null;

async function load(): Promise<Spacer | null> {
  const dir = join(process.cwd(), "vendor", "kiwi-model");
  const wasm = join(process.cwd(), "node_modules", "kiwi-nlp", "dist", "kiwi-wasm.wasm");
  if (!existsSync(dir) || !existsSync(wasm)) return null;
  const { KiwiBuilder } = await import("kiwi-nlp");
  const builder = await KiwiBuilder.create(wasm);
  const modelFiles = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => !f.startsWith("."))
      .map((f) => [f, new Uint8Array(readFileSync(join(dir, f)))]),
  );
  return (await builder.build({ modelFiles, modelType: "cong" })) as unknown as Spacer;
}

/** 붙여 쓰는 것이 맞는데 분석기가 띄우는 것 */
const REJOIN: [RegExp, string][] = [
  [/(부탁|감사|말씀|축하|사과|인사) (드[려리렸립릴린])/g, "$1$2"],
  [/(?<![가-힣])새 가족/g, "새가족"], // 교회 말(새가족반)
  [/(중간|기말) 고사/g, "$1고사"],
  [/(?<![가-힣])담 ?주/g, "다음 주"], // 2026-11-23 — 명사끼리 붙인 채로 두면서 분석기가 '담주' 를 더 이상 띄우지 않는다
  [/(?<![가-힣])몇 일/g, "며칠"],
];

const squeeze = (s: string) => s.replace(/\s+/g, "");

const tagOf = (t: Tok) => t.tag.split("-")[0];
const NOUNISH = new Set(["NNG", "NNP", "NNB", "NR", "SN", "XR"]);
/** 명사 뒤에 와도 띄어 쓰는 명사 — 앞이 명사일 때 이 낱말 앞만 띄운다 */
const SPACED_NOUN = new Set([
  "동안", "때", "때문", "중", "정도", "사이", "이후", "이전", "후", "전", "뒤", "앞", "위", "아래", "안", "밖", "속", "다음", "대신", "덕분", "이상", "이하",
  "가운데", "무렵", "만큼", "뿐", "김", "날", "쪽", "끝", "말",
]);

/**
 * 분석기가 이 자리(원문 글자 위치 pos 앞)에 공백을 더해도 되나 — 원문의 조각(tokenize)으로 앞뒤를 본다.
 * 조각의 경계가 아닌 자리는 예전처럼 받는다.
 */
export function spaceOk(toks: Tok[], pos: number): boolean {
  const next = toks.find((t) => t.position === pos);
  let prev: Tok | undefined;
  for (const t of toks) if (t.position + t.length === pos) prev = t;
  if (!next || !prev) return true;
  const nt = tagOf(next);
  if (/^(J|E|XS)/.test(nt) || nt === "VCP") return false;
  if (NOUNISH.has(tagOf(prev)) && NOUNISH.has(nt)) return SPACED_NOUN.has(next.str);
  return true;
}

const PAIR: Record<string, string> = { 을: "를", 를: "을", 은: "는", 는: "은" };
const JOSA_OK = new Set(["JKO", "JX", "JKS"]);
const BASE_SYL = 0xac00;
/** 받침이 있는 글자인가 */
const batchim = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= BASE_SYL && c <= 0xd7a3 && (c - BASE_SYL) % 28 !== 0;
};

/**
 * 조사 오타 고치기(2026-11-23) — '한 주을' → '한 주를'. 받침 없는 명사 바로 뒤 '을 · 은', 받침 있는 명사 바로 뒤 '를 · 는' 이
 * 따로 떨어진 한 글자 조각일 때만 짝으로 바꿔 보고, 바꾼 글에서 분석기가 그 글자를 조사(JKO · JX · JKS)로 읽어야 받는다. '이 · 가' 는 건드리지 않는다.
 */
export function fixJosa(kiwi: Pick<FormKiwi, "tokenize">, line: string): string {
  let out = line;
  for (let guard = 0; guard < 8; guard++) {
    const toks = kiwi.tokenize(out);
    let changed = false;
    for (let i = 1; i < toks.length; i++) {
      const t = toks[i];
      const prev = toks[i - 1];
      if (t.length !== 1 || !(t.str in PAIR) || prev.position + prev.length !== t.position || !NOUNISH.has(tagOf(prev))) continue;
      const before = out[t.position - 1];
      const wrong = batchim(before) ? t.str === "를" || t.str === "는" : t.str === "을" || t.str === "은";
      if (!wrong) continue;
      const fixed = out.slice(0, t.position) + PAIR[t.str] + out.slice(t.position + 1);
      const ok = kiwi.tokenize(fixed).some((u) => u.position === t.position && u.str === PAIR[t.str] && JOSA_OK.has(tagOf(u)));
      if (ok) {
        out = fixed;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return out;
}

const BASE = 0xac00;
/** 받침이 ㄴ 인 글자인가(는 · 은 · 던 · 한 · 인 …) */
const nieun = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= BASE && c <= 0xd7a3 && (c - BASE) % 28 === 4;
};

/**
 * 분석기가 띄운 결과에서 공백을 더하기만 한다(2026-11-17) — 리더가 띄어 쓴 곳은 그대로 둔다. 분석기는 공백을 지우기도 해서
 * '정신없다고 함' 을 '정신없다고함' 으로 붙였다. 그리고 ㄴ 받침 뒤 '데' 앞에는 새로 띄우지 않는다 — '하고 있는데' 를
 * '하고 있는 데' 로 띄웠다(이어 주는 '~는데'). 리더가 '하는 데' 처럼 띄어 쓴 것은 그대로다.
 */
export function addSpacesOnly(orig: string, spaced: string, allow: (pos: number) => boolean = () => true): string {
  const a = [...orig];
  const b = [...spaced];
  let out = "";
  let i = 0;
  let j = 0;
  let pos = 0; // a[i] 의 원문 위치(UTF-16) — 분석기 조각의 position 과 같은 단위
  while (i < a.length) {
    if (/\s/.test(a[i])) {
      pos += a[i].length;
      out += a[i++];
      while (j < b.length && /\s/.test(b[j])) j++;
      continue;
    }
    // 분석기만 띄운 자리
    let addSpace = false;
    while (j < b.length && /\s/.test(b[j])) {
      addSpace = true;
      j++;
    }
    if (addSpace && out && !/\s$/.test(out) && !(a[i] === "데" && nieun(out[out.length - 1])) && allow(pos)) out += " ";
    if (j < b.length && b[j] === a[i]) j++;
    pos += a[i].length;
    out += a[i++];
  }
  return out;
}

/**
 * 글 여러 개 → 띄어쓰기를 고치고 꼴을 맞춘 글. 분석기를 못 쓰면 null
 * unify(i) 가 참인 글은 문장 끝을 '~도록' 으로 맞춘다(기도제목). 거짓이면 문장 나누기 · 글머리표만(특이사항) — lib/spell/prayer-form
 */
export async function fixSpacing(texts: string[], unify: (i: number) => boolean = () => false): Promise<string[] | null> {
  loading ??= load().catch(() => null);
  const kiwi = await loading;
  if (!kiwi) {
    loading = null; // 다음 부름에 다시 해 본다
    return null;
  }
  return texts.map((text, i) => {
    const spaced = text
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line;
        try {
          const toks = kiwi.tokenize(line);
          let out = addSpacesOnly(line, kiwi.space(line, false), (pos) => spaceOk(toks, pos));
          for (const [re, to] of REJOIN) out = out.replace(re, to);
          out = fixJosa(kiwi, out);
          // 공백 말고는 건드리지 않은 것만(REJOIN 의 '다음 주' · '며칠', 조사 오타 을↔를 · 은↔는 은 빼고 견준다)
          const norm = (s: string) => squeeze(s).replace(/다음주/g, "담주").replace(/며칠/g, "몇일").replace(/를/g, "을").replace(/는/g, "은");
          return norm(out) === norm(line) ? out.trim() : line;
        } catch {
          return line;
        }
      })
      .join("\n");
    try {
      return formatLines(kiwi, spaced, unify(i)) || spaced;
    } catch {
      return spaced;
    }
  });
}
