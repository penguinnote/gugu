/**
 * 기도제목을 한 가지 꼴로(2026-11-16) — AI 없이, 형태소 분석기(Kiwi)가 쪼갠 조각으로 문장 끝만 바꾼다.
 *
 *   문장 나누기   분석기가 문장을 나눈다(조각의 sentPosition — splitIntoSents 의 자리는 바이트 단위라 쓰지 않는다). 둘 이상이면 줄마다 '• ' 를 붙이고, 하나면 그대로. 끝의 마침표 · 물음표 · 느낌표는 뗀다
 *   꼬리 떼기     '~ 기도해 주세요' · '~ 기도 부탁드려요' · '~ 기도합니다' 처럼 문장 끝의 기도 부탁
 *   끝 맞추기     바람을 말하는 끝은 모두 '~도록' 으로
 *                   ~게 · ~게끔                     → ~도록          (볼 수 있게 → 볼 수 있도록)
 *                   ~기를 · ~길 (바랍니다 · 원합니다)  → ~도록          (주시길 → 주시도록)
 *                   ~(었)으면 (좋겠어요 · 해요 · 함)   → ~도록          (회복됐으면 좋겠어요 → 회복되도록)
 *                   ~고 싶어요 · ~고 싶음              → ~도록          (화해하고 싶어요 → 화해하도록)
 *                   ~주세요 · ~주소서                 → ~주시도록
 *                   ~ㄹ 것 · ~을 것(다짐)              → ~도록          (낙심하지 않을 것 → 낙심하지 않도록, 2026-11-23)
 *   그대로 두는 것  상황을 말하는 문장('요즘 지쳐요' · '감기 걸려서 못 나옴')과 낱말만 있는 것('가족 건강') — 뜻을 지어내지 않는다
 * 바람이 아닌 문장은 전한 말투(~다고 함 · ~대)만 기록체(~음)로 바꾼다(memoEnding, 2026-11-17).
 * 바꾸는 것은 문장 끝 어절 하나뿐이고 앞부분은 글자 그대로 둔다. 분석이 이상하면(빈 글 등) 그 문장은 원래대로.
 */

export type Tok = { str: string; tag: string; position: number; wordPosition: number; sentPosition: number; length: number };
export type FormKiwi = {
  tokenize: (s: string) => Tok[];
  joinSent: (morphs: { form: string; tag: string }[]) => { str: string };
};

const base = (t: Tok) => t.tag.split("-")[0];
const is = (t: Tok | undefined, tag: string, ...forms: string[]) => !!t && base(t) === tag && (forms.length === 0 || forms.includes(t.str));
const PUNCT = new Set(["SF", "SP", "SE", "SS", "SSO", "SSC", "SW", "SO"]);

/** 기도 부탁 꼬리에 올 수 있는 조각('기도' 뒤) */
function tailOk(t: Tok): boolean {
  const b = base(t);
  if (["XSV", "VX", "EP", "EF", "EC", "JKO", "JX", "MAG"].includes(b)) return true;
  if (b === "NNG") return ["기도", "부탁", "중보"].includes(t.str);
  if (b === "VV") return ["하", "드리", "주", "부탁드리", "부탁하", "기도하"].includes(t.str);
  return false;
}
/** '~기를' 뒤에 오는 바람의 말 */
function wishOk(t: Tok): boolean {
  const b = base(t);
  if (["JKO", "JX", "EP", "EF", "XSV", "VX"].includes(b)) return true;
  if (b === "VV") return ["바라", "원하", "빌", "소망하", "기도하", "구하", "하"].includes(t.str);
  if (b === "NNG") return ["소망", "기원", "기도"].includes(t.str);
  return false;
}
/** '~으면' 뒤에 오는 말(좋겠어요 · 해요 · 함 · 싶어요) */
function hopeOk(t: Tok): boolean {
  const b = base(t);
  if (["EP", "EF", "ETN", "JX"].includes(b)) return true;
  if (b === "VA") return t.str === "좋";
  if (b === "VX" || b === "VV") return ["하", "싶"].includes(t.str);
  return false;
}

const DOROK = { form: "도록", tag: "EC" };

/** 한 문장 → 끝을 '~도록' 으로 맞춘 문장(바람의 끝이 아니면 그대로) */
export function uniformEnding(kiwi: FormKiwi, sentence: string): string {
  let s = sentence.trim();
  let toks = kiwi.tokenize(s);
  while (toks.length && PUNCT.has(base(toks[toks.length - 1]))) toks = toks.slice(0, -1);
  if (toks.length === 0) return "";
  s = s.slice(0, toks[toks.length - 1].position + toks[toks.length - 1].length);

  // 1) 기도 부탁 꼬리 떼기
  for (let i = toks.length - 1; i >= 1 && i >= toks.length - 9; i--) {
    if ((is(toks[i], "NNG", "기도", "중보") || is(toks[i], "VV", "기도하")) && toks.slice(i + 1).every(tailOk) && toks.length - i >= 2) {
      // '기도' 가 어절 가운데면(…위한기도) 건드리지 않는다
      if (toks[i - 1].wordPosition === toks[i].wordPosition) break;
      s = s.slice(0, toks[i].position).trimEnd();
      toks = toks.slice(0, i);
      break;
    }
  }
  const n = toks.length;
  const last = toks[n - 1];
  // '기도해 주세요' 처럼 부탁만 있는 문장은 그대로 둔다
  if (is(toks[0], "NNG", "기도", "중보") || is(toks[0], "VV", "기도하")) return s;

  // 2) 끝 맞추기 — k: 여기부터 버린다, add: 대신 붙일 조각
  let k = -1;
  let add = [DOROK];
  if (is(last, "EC", "게", "게끔", "도록")) k = n - 1;
  // 다짐 '~ㄹ 것 · ~을 것'(2026-11-23) — '낙심하지 않을 것' → '낙심하지 않도록'. '것' 으로 끝날 때만('할 것이 많아서' 는 그대로)
  if (k < 0 && n >= 3 && is(last, "NNB", "것") && is(toks[n - 2], "ETM", "ᆯ", "을") && ["VV", "VA", "VX", "XSV", "XSA"].includes(base(toks[n - 3]))) k = n - 2;
  if (k < 0) {
    for (let i = n - 1; i >= 1 && i >= n - 8; i--) {
      const rest = toks.slice(i + 1);
      if (is(toks[i], "ETN", "기") && rest.every(wishOk) && (rest.length > 0 || false)) k = i;
      else if (is(toks[i], "EC", "으면", "면") && rest.every(hopeOk)) k = is(toks[i - 1], "EP", "었", "았", "였") ? i - 1 : i;
      else if (is(toks[i], "EC", "고") && is(toks[i + 1], "VX", "싶") && rest.slice(1).every((t) => ["EP", "EF", "ETN", "JX"].includes(base(t)))) k = i;
      if (k >= 0) break;
    }
  }
  if (k < 0 && is(last, "EF", "세요", "소서", "옵소서", "시옵소서", "십시오") && n >= 2) {
    // ~주세요 · ~도와주세요 · ~주소서 → ~주시도록
    const j = is(toks[n - 2], "EP", "시") ? n - 3 : n - 2;
    if (j >= 0 && (base(toks[j]) === "VV" || base(toks[j]) === "VX") && toks[j].str.endsWith("주")) {
      // '~되도록 도와주세요' — 앞이 이미 바람의 끝이면 '도와주세요' 를 떼고 그 끝을 맞춘다
      if (j >= 1 && is(toks[j - 1], "EC", "도록", "게", "게끔") && toks[j - 1].wordPosition !== toks[j].wordPosition) {
        return uniformEnding(kiwi, s.slice(0, toks[j].position));
      }
      k = j + 1;
      add = [{ form: "시", tag: "EP" }, DOROK];
    }
  }
  if (k <= 0) return s;

  // 바뀌는 조각이 든 어절의 첫 조각부터 다시 붙인다(앞 어절은 글자 그대로)
  let j = k;
  while (j > 0 && toks[j - 1].wordPosition === toks[k].wordPosition) j--;
  if (j === k) {
    j = k - 1;
    while (j > 0 && toks[j - 1].wordPosition === toks[k - 1].wordPosition) j--;
  }
  const joined = kiwi.joinSent([...toks.slice(j, k).map((t) => ({ form: t.str, tag: t.tag })), ...add]).str.trim();
  if (!joined || !joined.endsWith("도록")) return s;
  return (s.slice(0, toks[j].position) + joined).trim();
}

/** 전한 말투의 끝(~다고 함 · ~다고 했음 · ~대 · ~래)을 이루는 조각 — '하' 뒤에 올 수 있는 것 */
const REPORT_TAIL = new Set(["EP", "EF", "ETN", "EC", "JX"]);
const QUOTE = /^(?:ᆫ|는)?(?:다|라|자|냐)고$/;
const HEARSAY = /^(?:ᆫ|는)?(?:대|래)(?:요)?$/;

/**
 * 메모 말투를 짧은 기록체로(2026-11-17 사용자) — 리더가 전해 들은 말을 적은 끝만 '~음/~ㅁ' 으로 바꾼다.
 *   힘들다고 함 → 힘듦 · 온다고 했음 → 옴 · 면접 봤다고 했어요 → 면접 봤음 · 못 나올 수도 있대 → 못 나올 수도 있음 · 안 된대 → 안 됨 · 학생이래 → 학생임
 * 바꾸는 것은 마지막 어절 하나 — 앞부분은 글자 그대로. 이런 끝이 아니면 그대로 둔다(뜻을 지어내지 않는다).
 */
export function memoEnding(kiwi: FormKiwi, sentence: string): string {
  const s = sentence.trim();
  let toks = kiwi.tokenize(s);
  while (toks.length && PUNCT.has(base(toks[toks.length - 1]))) toks = toks.slice(0, -1);
  const n = toks.length;
  if (n < 2) return s;
  let k = -1;
  // ~다고 함 / ~다고 했음 / ~다고 했어요 — '다고' 부터 버린다
  for (let i = n - 2; i >= 1 && i >= n - 6; i--) {
    if (base(toks[i]) === "EC" && QUOTE.test(toks[i].str) && (is(toks[i + 1], "VX", "하") || is(toks[i + 1], "VV", "하")) && toks.slice(i + 2).every((t) => REPORT_TAIL.has(base(t)))) {
      k = i;
      break;
    }
  }
  // ~대 / ~래 — 끝 하나를 버린다
  if (k < 0 && base(toks[n - 1]) === "EF" && HEARSAY.test(toks[n - 1].str)) k = n - 1;
  if (k <= 0) return s;
  let j = k;
  while (j > 0 && toks[j - 1].wordPosition === toks[k].wordPosition) j--;
  if (j === k) return s; // 끝 조각만 따로 떨어진 어절 — 붙일 줄기가 없다
  const joined = kiwi.joinSent([...toks.slice(j, k).map((t) => ({ form: t.str, tag: t.tag })), { form: "음", tag: "ETN" }]).str.trim();
  if (!joined || !/[음ㅁ-ㅎ가-힣]$/.test(joined)) return s;
  return (s.slice(0, toks[j].position) + joined).trim();
}

const STEM = new Set(["VV", "VA", "VX", "VCP", "VCN", "XSV", "XSA"]);
/** 감사 제목 — '~해서 감사(해요 · 합니다 · 했음 …)'. 끝을 '감사' 로 맞춘다 */
const THANKS = /^(.*감사)(?:해요|합니다|했어요|했습니다|했다|했음|함|하다|드려요|드립니다|해)?$/;
/** 힘든 일을 말하는 낱말 — 이런 상황은 '~하도록' 이 아니라 '~ 가운데 함께해 주시도록' */
const HARD = /힘들|힘듦|힘든|지치|지쳐|아프|아파|아픔|바쁘|바빠|바쁨|걱정|고민|정신없|우울|스트레스|피곤|어렵|어려|막막|불안|외로|슬프|슬퍼|다치|다쳐|입원|수술/;
const ENDING = new Set(["EP", "EF", "EC", "ETN", "ETM", "JX"]);
const NOUN = new Set(["NNG", "NNP", "NNB", "NR", "NP", "SN", "SL"]);
const hasBatchim = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
/** 는데 · 는 을 받는 줄기(움직씨 · 있다 · 없다 · 때매김 뒤) — 나머지 그림씨 · 이다는 ㄴ데 · ㄴ */
const takesNeun = (stem: Tok, hasEp: boolean) => hasEp || ["VV", "VX", "XSV"].includes(base(stem)) || /(있|없)$/.test(stem.str);

/**
 * 상황을 말하는 문장(바람이 아닌 것)을 이어 쓸 꼴로(2026-11-17 사용자 — 모든 기도제목이 '~도록' 으로 끝나게)
 *   joint   뒤의 바람에 이을 때 — '힘듦' → '힘든데', '봤음' → '봤는데', '취업 준비 중' → '취업 준비 중인데'
 *   alone   이을 바람이 없을 때 — '힘든 가운데 함께해 주시도록', '면접 봤는데 그 가운데 함께해 주시도록',
 *           '취업 준비 중에 함께해 주시도록', 낱말만 있으면 '가족 건강을 지켜 주시도록'
 * 바꾸는 것은 마지막 어절뿐 — 앞부분은 글자 그대로. 분석이 이상하면 null(그 문장은 따로 둔다)
 */
function situation(kiwi: FormKiwi, sentence: string): { joint: string | null; alone: string } | null {
  const s = sentence.trim();
  let toks = kiwi.tokenize(s);
  while (toks.length && PUNCT.has(base(toks[toks.length - 1]))) toks = toks.slice(0, -1);
  const n = toks.length;
  if (n === 0) return null;
  const last = toks[n - 1];
  const body = s.slice(0, last.position + last.length);
  // '~을 위해' — 그대로 바람 앞에 잇고, 혼자면 '~을 위해 함께해 주시도록'
  if (/(?:을|를|\s)\s*위(?:해|하여)(?:서)?$/.test(body)) return { joint: body, alone: `${body} 함께해 주시도록` };
  // 낱말로 끝남 — '~ 중' 이면 '중인데 · 중에', 아니면 따로 한 항목('건강 · 안전' 은 지켜 주시도록, 나머지는 위해 함께해 주시도록)
  if (NOUN.has(base(last))) {
    if (last.str === "중") return { joint: `${body}인데`, alone: `${body}에 함께해 주시도록` };
    const josa = hasBatchim(body[body.length - 1]) ? "을" : "를";
    return { joint: null, alone: /건강|안전/.test(body) ? `${body}${josa} 지켜 주시도록` : `${body}${josa} 위해 함께해 주시도록` };
  }
  // 마지막 줄기와 그 뒤 때매김(었)만 남기고 끝을 바꾼다
  let p = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (STEM.has(base(toks[i]))) {
      p = i;
      break;
    }
    if (!ENDING.has(base(toks[i]))) return null;
  }
  if (p < 0) return null;
  let q = p + 1;
  while (q < n && base(toks[q]) === "EP") q++;
  const hasEp = q > p + 1;
  let j = p;
  while (j > 0 && toks[j - 1].wordPosition === toks[p].wordPosition) j--;
  const keep = toks.slice(j, q).map((t) => ({ form: t.str, tag: t.tag }));
  const head = s.slice(0, toks[j].position);
  const join = (add: { form: string; tag: string }[]) => kiwi.joinSent([...keep, ...add]).str.trim();
  const neun = takesNeun(toks[p], hasEp);
  const joint = head + join([{ form: neun ? "는데" : "ᆫ데", tag: "EC" }]);
  // 이을 바람이 없을 때 — 힘든 일(부정 · 어려움)이면 '~ 가운데 함께해 주시도록', 아니면 그 말 그대로 바람으로('꼭 옴' → '꼭 오도록')
  const hard = HARD.test(s) || toks.some((t) => (base(t) === "MAG" && (t.str === "안" || t.str === "못")) || (STEM.has(base(t)) && /^(않|없|못하)$/.test(t.str)));
  // 다짐(~할게요 · ~하겠다)은 그대로 바람으로 — '잘 할게요' → '잘 하도록'
  const promise = toks.slice(p + 1).some((t) => (base(t) === "EF" && /^ᆯ게(?:요)?$/.test(t.str)) || (base(t) === "EP" && t.str === "겠"));
  const plain = promise ? toks.slice(j, p + 1).map((t) => ({ form: t.str, tag: t.tag })) : null;
  const alone = plain
    ? `${head}${kiwi.joinSent([...plain, { form: "도록", tag: "EC" }]).str.trim()}`
    : hasEp
    ? `${joint} 그 가운데 함께해 주시도록`
    : hard
      ? `${head}${join([{ form: neun ? "는" : "ᆫ", tag: "ETM" }])} 가운데 함께해 주시도록`
      : `${head}${join([{ form: "도록", tag: "EC" }])}`;
  return joint.trim() && alone.trim() ? { joint: joint.trim(), alone: alone.trim() } : null;
}

/**
 * 글(여러 줄) → 한 줄, 문장은 ' / ' 로 잇는다(2026-11-17 사용자 — 글머리표로 늘어놓지 않는다).
 * unify(기도제목)면 모든 문장이 '~도록' 으로 끝나게: 바람은 '~도록', 상황은 뒤의 바람에 이어 붙이고('~인데, ~도록'),
 * 이을 바람이 없으면 '~ 가운데 함께해 주시도록'. 특이사항은 끝을 바꾸지 않는다.
 */
export function formatLines(kiwi: FormKiwi, text: string, unify: boolean): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const l = line.replace(/^[\s•·\-–—*]+/, "").trim();
    if (!l) continue;
    // 문장 나누기 — 조각의 sentPosition 이 바뀌는 자리에서 끊는다
    const sents: string[] = [];
    try {
      const toks = kiwi.tokenize(l);
      let from = 0;
      for (let i = 1; i <= toks.length; i++) {
        if (i === toks.length || toks[i].sentPosition !== toks[i - 1].sentPosition) {
          const to = i === toks.length ? l.length : toks[i].position;
          sents.push(l.slice(from, to));
          from = to;
        }
      }
      if (toks.length === 0) sents.push(l);
    } catch {
      sents.length = 0;
      sents.push(l);
    }
    for (const raw of sents) {
      const sent = raw.trim();
      if (!sent) continue;
      let done = sent;
      try {
        // 바람이면 '~도록', 아니면 전한 말투를 기록체로(2026-11-17)
        // 감사 제목은 '~ 감사' 로 맞추고 끝을 바꾸지 않는다(2026-11-17) — '잘 끝나서 감사' 가 '~도록' 으로 바뀌면 뜻이 달라진다
        const thanks = unify ? THANKS.exec(sent.replace(/[.!?。~\s]+$/, "")) : null;
        if (thanks) done = thanks[1];
        else {
          done = unify ? uniformEnding(kiwi, sent) : sent;
          if (unify && done.replace(/[.!?。~\s]+$/, "") === sent.replace(/[.!?。~\s]+$/, "")) done = memoEnding(kiwi, sent);
        }
      } catch {
        done = sent;
      }
      done = (done || sent).replace(/[.!?。~\s]+$/, "").trim();
      if (done) out.push(done);
    }
  }
  if (!unify) return out.join(" / ");
  // 상황은 뒤의 바람에 이어 붙이고, 이을 바람이 없으면 '~ 가운데 함께해 주시도록'
  const items: string[] = [];
  let pending: { joint: string; alone: string }[] = [];
  // '기도해 주세요' · '기도 부탁드려요' 처럼 부탁만 있는 문장은 뺀다(다른 문장이 있을 때)
  const ask = (t: string) => /^(?:같이\s*|함께\s*)?(?:기도|중보)\s*(?:해|부탁|요청|함께|해 주)/.test(t) && t.length <= 14;
  const body = out.filter((t) => !ask(t));
  if (body.length === 0) return out.join(" / ");
  const flush = () => {
    if (!pending.length) return;
    const last = pending[pending.length - 1];
    items.push([...pending.slice(0, -1).map((x) => x.joint), last.alone].join(", "));
    pending = [];
  };
  for (const sent of body) {
    if (sent.endsWith("도록") || sent.endsWith("감사")) {
      items.push(pending.length ? `${pending.map((x) => x.joint).join(", ")}, ${sent}` : sent);
      pending = [];
      continue;
    }
    let st: { joint: string | null; alone: string } | null = null;
    try {
      st = situation(kiwi, sent);
    } catch {
      st = null;
    }
    if (st && st.joint) pending.push({ joint: st.joint, alone: st.alone });
    else if (st) {
      flush();
      items.push(st.alone);
    } else {
      flush();
      items.push(sent);
    }
  }
  flush();
  return items.join(" / ");
}
