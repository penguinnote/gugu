import { WORD_ROWS, type WordRow } from "./word-rules";

/**
 * 규칙으로 맞춤법 고치기 — AI 없이(2026-11-16). 글은 밖으로 나가지 않는다(브라우저 · 우리 서버 어디서든 돈다).
 * 규칙은 matchum 0.2.0(MIT, © 2026 sjw0328 — https://github.com/sjw0328/matchum)을 옮긴 것이다:
 *   낱말 표(word-rules.ts) · 어미 규칙 · 띄어쓰기 규칙. 문맥과 상관없이 틀린 것만 고친다(뜻으로 갈리는 로서/로써 같은 것은 두다).
 * 문장을 다듬지 않는다 — 등록된 표기만 바꾼다. 나머지 띄어쓰기는 서버의 형태소 분석기가 맡는다(lib/spell/kiwi.ts).
 */

type Fix = (m: RegExpExecArray) => string | null;
type Rule = { re: RegExp; fix: Fix; exceptions?: readonly string[] };

const BASE = 0xac00;
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];
/** 글자의 받침('' 이면 없음) */
function jong(ch: string): string {
  const c = ch.charCodeAt(0);
  return c >= BASE && c <= 0xd7a3 ? JONG[(c - BASE) % 28] : "";
}
const isHangul = (ch: string | undefined) => !!ch && ch >= "가" && ch <= "힣";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (src: string) => new RegExp(src, "g");
const rule = (src: string, fix: Fix, exceptions?: readonly string[]): Rule => ({ re: rx(src), fix, exceptions });
/** 앞 글자 받침이 ㄹ 일 때만 */
const ifRieul = (f: Fix): Fix => (m) => (jong(m[1]) === "ㄹ" ? f(m) : null);

const WORD_START = "(?<![가-힣0-9])";
const END = "(?=요|[\\s.,!?~\"')\\]]|$)";
const STEM: Record<string, string> = { 할: "하", 볼: "보", 될: "되" };

const wordRule = ([wrong, right, ws, exceptions]: WordRow): Rule => rule((ws ? WORD_START : "") + esc(wrong), () => right, exceptions);

const ENDING: Rule[] = [
  rule("([가-힣])께(?=라|란|요|[\\s.,!?~\"')\\]]|$)", ifRieul((m) => `${m[1]}게`)),
  rule("([가-힣])꺼(에요)?(?=[야예요니면지라]|[\\s.,!?~]|$)", ifRieul((m) => `${m[1]} 거${m[2] ? "예요" : ""}`)),
  rule(`([가-힣])껄${END}`, ifRieul((m) => `${m[1]}걸`), ["껄껄"]),
  rule("([가-힣])런지", ifRieul((m) => `${m[1]}는지`)),
  rule("(할|볼|될)려(고|면|는|던)", (m) => `${STEM[m[1]]}려${m[2]}`),
  rule("을려(고|면|는|던)", (m) => `으려${m[1]}`),
  rule("(있|없|했|겠|었|았|였)슴(?!니)", (m) => `${m[1]}음`),
  rule("(?<![가-힣])않(?= [가-힣])", () => "안"),
  rule("지 안(았|습|는다|아요|아서|으면|는)", (m) => `지 않${m[1]}`),
  rule("(?<![가-힣])왠(?= [가-힣])", () => "웬"),
  rule("댓가(?!지)", () => "대가"),
  rule("([가-힣])던(지|가)? 말던(지|가)?", (m) => `${m[1]}든${m[2] ?? ""} 말든${m[3] ?? ""}`),
  rule("(할|볼|될)래야", (m) => `${STEM[m[1]]}려야`),
  rule("을래야", () => "으려야"),
  rule("([가-힣])이예요", (m) => (jong(m[1]) ? `${m[1]}이에요` : null)),
  rule("(?<![가-힣])누구에요", () => "누구예요"),
  rule("(했|하|있|없|좋|렇|되|됐|같|않|겠|었|았|였|갔|봤|왔|싶|많)구요", (m) => `${m[1]}고요`),
  rule("(?<=[가-힣])컨데(?=[\\s,.]|$)", () => "컨대"),
  rule("(병|감기|상처|몸살|두통|배탈)(이|가|는|도) 낳", (m) => `${m[1]}${m[2]} 나`),
  rule("(정답|답|문제|퀴즈)(을|를) 맞(추|춰|췄)", (m) => `${m[1]}${m[2]} 맞${{ 추: "히", 춰: "혀", 췄: "혔" }[m[3]]}`),
  rule("(?<![가-힣])미쳐(?= (몰|알|생각|못|깨닫|챙기|준비|피하))", () => "미처"),
  rule("가능한(?= (빨리|빠르게|많이|일찍|조속히|신속히|자주|적게))", () => "가능한 한"),
  rule("겉잡을 ?수 ?없", () => "걷잡을 수 없"),
  rule("(길|기를) 바래(요|(?![가-힣]))", (m) => `${m[1]} 바라${m[2]}`),
  rule("(길|기를) 바랬", (m) => `${m[1]} 바랐`),
];

/** -ㄹ + 의존명사 붙여 쓴 것 → 띄어 쓴다 */
const dep = (noun: string, after: string, exceptions: string[]): Rule => rule(`([가-힣])${noun}(${after})`, ifRieul((m) => `${m[1]} ${noun}${m[2]}`), exceptions);

const SPACING: Rule[] = [
  rule("([가-힣])( ?)수( ?)(있|없)", (m) => (jong(m[1]) !== "ㄹ" || (m[2] && m[3]) ? null : `${m[1]} 수 ${m[4]}`)),
  dep("것", "", ["날것", "물것", "들것", "별것", "탈것", "날것들", "보잘것없", "하잘것없"]),
  dep("때", "(?!까치)", ["물때", "썰물때", "밀물때", "끝물때", "깔때기", "볼때기"]),
  dep("줄", "(?= ?(?:알|몰|모))", ["글줄", "날줄", "물줄", "밧줄"]),
  rule(
    "(?<![가-힣])안(?=하(?:기|고|면|니|려|는|지|자|게)|해(?:도|서|요|야|[\\s.,!?~]|$)|했|할(?:게|래|거|까|[\\s.,!?~]|$)|한(?:다|대|데)|합니다|함(?:[\\s.,!?~]|$))",
    () => "안 ",
    ["안하무인"],
  ),
  rule("(?<=[가-힣])때문", () => " 때문"),
  rule("([가-힣])수밖에", ifRieul((m) => `${m[1]} 수밖에`)),
  rule("(?<=[가-힣]) ?수 밖에", () => " 수밖에"),
  rule("([가-힣])수도(?= )", ifRieul((m) => `${m[1]} 수도`), ["살수도"]),
  rule("것같(?=[다아았은네습기던고지을])", () => "것 같"),
  rule("([가-힣])거(?=야|예요|에요|면)", ifRieul((m) => `${m[1]} 거`)),
  rule("(?<=[가-힣])는게(?=[\\s.,!?~]|$)", () => "는 게"),
  rule("(?<=[가-힣])는거(?=[야요예지다면니든고]|[\\s.,!?~]|$)", () => "는 거"),
  rule("([가-힣])(텐데|테니|테야)", ifRieul((m) => `${m[1]} ${m[2]}`)),
  rule("([가-힣])리가(?= (없|있|만무))", ifRieul((m) => `${m[1]} 리가`)),
  rule("(?<=[가-힣])는대로", () => "는 대로", ["되는대로"]),
  rule("([가-힣])채로", (m) => (jong(m[1]) === "ㄴ" ? `${m[1]} 채로` : null), ["안채로", "본채로", "산채로"]),
  rule("(?<=[가-힣])지(않|못하|못했|못한|못할|못해|말고|말아|말라|말자|마라)", (m) => `지 ${m[1]}`, [
    "마지않", "머지않", "못지않", "마지못하", "마지못해", "마지못한", "마지못할", "마지못했", "되지못하", "되지못해", "되지못한", "되지못할", "되지못했",
  ]),
  rule("(?<=[가-힣])지마(?=[\\s.,!?~]|요|$)", () => "지 마", ["새옹지마"]),
  rule("(?<=[가-힣])고(싶|있|계시|계셨|말았|나서|나니|나면)", (m) => `고 ${m[1]}`),
  rule("(?<=[가-힣]) (처럼|조차|에게서|에게|한테|부터)(?!해)", (m) => m[1]),
  rule("(?<=[가-힣])(로|에서) 부터", (m) => `${m[1]}부터`),
  rule("(?<![가-힣])(그런|이런|저런|어떤)(게|거)(?=[\\s.,!?~야지다면니요]|$)", (m) => `${m[1]} ${m[2]}`),
];

/** '중' 을 띄면 안 되는 낱말(집중 · 신중 · 소중 …)의 앞 글자 */
const NOT_MID = "(?<![집열와도밤궁공수명적신귀소편치비체가엄존병의])";

/** 목장 보고서에서 자주 보이는 것 — matchum 에 없는 것만 */
const EXTRA: Rule[] = [
  rule("([가-힣])함니다", (m) => `${m[1]}합니다`),
  rule("(?<![가-힣])이번주", () => "이번 주"),
  rule("(?<![가-힣])다음주", () => "다음 주"),
  rule("(?<![가-힣])저번주", () => "저번 주"),
  rule("(?<![가-힣])한주", () => "한 주"),
  rule(`(?<=[가-힣])${NOT_MID}중인(?=데|[\\s.,!?~]|$)`, () => " 중인"),
  rule(`(?<=[가-힣])${NOT_MID}중이(?=에요|라|다|고|어서|어도|었|니)`, () => " 중이"),
  rule("않토록", () => "않도록"),
];

const RULES: Rule[] = [...WORD_ROWS.map(wordRule), ...ENDING, ...SPACING, ...EXTRA];

/** word 가 [start, end) 를 통째로 덮고 낱말 첫머리에서 시작하는가('날것' 은 예외지만 '끝날것' 의 '날것' 은 아니다) */
function covered(text: string, start: number, end: number, word: string): boolean {
  for (let st = Math.max(0, end - word.length); st <= start; st++) {
    if (text.startsWith(word, st) && (st === 0 || !isHangul(text[st - 1]))) return true;
  }
  return false;
}

type Hit = { start: number; end: number; to: string };

function findAll(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    for (let m = r.re.exec(text); m; m = r.re.exec(text)) {
      if (m[0] === "" && r.re.lastIndex === m.index) r.re.lastIndex++;
      const start = m.index;
      const end = start + m[0].length;
      if (r.exceptions?.some((w) => covered(text, start, end, w))) continue;
      const to = r.fix(m);
      if (to !== null && to !== m[0]) hits.push({ start, end, to });
    }
  }
  // 앞에서부터, 같은 자리면 긴 것 먼저. 앞에서 고른 것과 겹치면 버린다
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Hit[] = [];
  let last = -1;
  for (const h of hits) {
    if (h.start >= last) {
      out.push(h);
      last = h.end;
    }
  }
  return out;
}

/** 자음 · 모음만 있는 것(ㅎㅎ · ㅋㅋ · ㅠㅠ)과 웃음 기호(^^ · ;;)를 지운다. 줄바꿈은 그대로 */
export function dropJamo(text: string): string {
  return text
    .replace(/[ㄱ-ㅎㅏ-ㅣ]+|\^\^+|;{2,}|~{2,}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "");
}

/** 글 → 규칙에 걸린 표기만 고친 글. 줄바꿈은 그대로 */
export function fixSpelling(text: string): string {
  let cur = text;
  // 한 번 고친 자리 옆에서 다른 규칙이 걸릴 수 있다('할수있다' → '할 수 있다' 뒤 '됬') — 두 번까지
  for (let i = 0; i < 2; i++) {
    const hits = findAll(cur);
    if (hits.length === 0) break;
    let out = "";
    let pos = 0;
    for (const h of hits) {
      out += cur.slice(pos, h.start) + h.to;
      pos = h.end;
    }
    cur = out + cur.slice(pos);
  }
  return cur.replace(/ {2,}/g, " ");
}
