import { COMMON_WORD_NAMES, givenNameOf } from "@/lib/ai/names";

/**
 * 모임 메모 나누기 — AI 없이(2026-11-16). 줄이나 문장이 명단 이름으로 시작하면 그 사람 기도제목으로, 나머지는 목장 특이사항으로 나눈다.
 * 글은 기기 밖으로 나가지 않는다(브라우저에서 돈다) — AI 동의와 상관없이 모든 사람에게 쓴다. 문장은 고치지 않고 그대로 옮긴다.
 *
 *   이름으로 본다     줄 · 문장 맨 앞의 성까지 붙은 이름, 또는 성을 뺀 이름(명단에 그 이름이 한 명뿐일 때)
 *                     뒤에 호칭(형제 · 자매 · 언니 …) · 조사(은 · 는 · 이 · 가 · 의 · 도) · 구분 기호(: - , ·)가 붙어도 된다
 *                     흔한 낱말과 같은 이름(은혜 · 사랑 …)은 성까지 붙었거나, 호칭 · 구분 기호가 바로 붙을 때만
 *   이어지는 줄       이름 없이 이어지는 줄은 바로 앞 사람 것. 빈 줄이 나오면 끊는다
 *   특이사항          어느 사람 것도 아닌 글, '특이사항' · '공지' · '전체' 로 시작하는 줄부터
 *   제목 줄           '<기도제목>' · '[11/22 기도제목]' · '프레쉬 목장 기도제목' · '■ 중보기도' 처럼 제목뿐인 줄은 버린다(2026-11-23 —
 *                     '<기도제목>' 이 특이사항 '기도제목>' 으로 들어갔다). 줄 앞의 여는 괄호는 짝이 되는 닫는 괄호와 함께 뗀다
 * 못 나누는 것: 문장 가운데 나오는 이름, 별명, 한 문장에 섞인 여러 사람 — 그래서 화면이 결과를 먼저 보이고 리더가 고른다.
 */

export type SplitPerson = { id: string; name: string };
export type MemoSegment = { personId: string | null; text: string };

const TITLE = "(?:형제|자매|언니|오빠|누나|형|님|씨|리더|목자|목동)";
const SEP = "[:：\\-–—,，·=)>\\]]";
const BULLET = /^[\s>*•·\-–—▶▷■□●○✔✅☑️]*(?:\d{1,2}\s*[.)]\s*)?[\s[(<]*/;
const NOTE_HEAD = /^(?:📝\s*)?(?:목장\s*)?(?:특이\s*사항|공지(?:\s*사항)?|전체(?:\s*나눔)?|기타)\s*[:：\-–—]?\s*/;
const PRAYER_HEAD = /^(?:기도\s*제목|기도|나눔)\s*[:：\-–—]?\s*/;

/** 여는 괄호 → 닫는 괄호 */
const BRACKET: Record<string, string> = { "<": ">", "[": "]", "(": ")", "【": "】", "《": "》", "「": "」", "『": "』", "〈": "〉", "{": "}" };
const LEAD = /^[\s>*•·\-–—▶▷■□●○◆◇★☆✔✅☑️]*(?:\d{1,2}\s*[.)]\s*)?\s*/;
/** 줄 앞의 글머리 기호를 떼고, 여는 괄호로 시작하면 짝이 되는 닫는 괄호와 함께 뗀다('<기도제목>' → '기도제목') */
export function unwrapLine(raw: string): string {
  let l = raw.replace(LEAD, "");
  for (let guard = 0; guard < 3; guard++) {
    const close = BRACKET[l[0]];
    if (!close) break;
    const at = l.indexOf(close, 1);
    l = (at > 0 ? l.slice(1, at) + l.slice(at + 1) : l.slice(1)).replace(LEAD, "");
  }
  return l;
}
/** 제목뿐인 줄 — 앞에 날짜 · 목장 이름 · '오늘의 · 이번 주' 가 오거나 끝에 ':' 가 붙어도 */
const TITLE_LINE = new RegExp(
  String.raw`^(?:(?:\d{1,2}\s*[/.]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*월|오늘의|오늘|이번\s*주|금주|지난\s*주|[가-힣A-Za-z]{1,10}\s*목장)\s*(?:의\s*)?)*` +
    String.raw`(?:기도\s*제목|중보\s*기도|기도\s*나눔|나눔|기도)(?:\s*(?:나눔|모음|정리|목록))?\s*[:：]?$`,
);
export function isTitleLine(raw: string): boolean {
  const t = unwrapLine(raw).replace(/[<>[\](){}【】《》「」『』〈〉■□●○◆◇★☆▶▷]/g, " ").replace(/\s+/g, " ").trim();
  return !!t && TITLE_LINE.test(t);
}

type Rule = { id: string; re: RegExp };

function rulesFor(persons: SplitPerson[]): Rule[] {
  const givenCount = new Map<string, number>();
  for (const p of persons) {
    const g = givenNameOf(p.name);
    if (g) givenCount.set(g, (givenCount.get(g) ?? 0) + 1);
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 이름 뒤: 호칭 → 조사 → 구분 기호. 끝은 한글이 아니어야 한다('지수함수' 는 '지수' 가 아니다)
  const loose = `(?:\\s?${TITLE})?(?:이(?:가|는|의|도|랑|네)?|은|는|가|의|도)?\\s*${SEP}*(?![가-힣])`;
  const strict = `(?:\\s?${TITLE}(?:이|은|는|가|의|도)?\\s*${SEP}*|\\s*${SEP}+)(?![가-힣])`;
  const out: { id: string; len: number; re: RegExp }[] = [];
  for (const p of persons) {
    const full = p.name.trim();
    if (!full) continue;
    out.push({ id: p.id, len: full.length + 10, re: new RegExp(`^${esc(full)}${loose}`) });
    const g = givenNameOf(full);
    if (g && givenCount.get(g) === 1) out.push({ id: p.id, len: g.length, re: new RegExp(`^${esc(g)}${COMMON_WORD_NAMES.has(g) ? strict : loose}`) });
  }
  return out.sort((a, b) => b.len - a.len);
}

/** 줄 맨 앞(글머리 기호 뒤)이 이름이면 그 사람과 남은 글 */
function leadName(rules: Rule[], s: string): { id: string; rest: string } | null {
  for (const r of rules) {
    const m = r.re.exec(s);
    if (m) return { id: r.id, rest: s.slice(m[0].length) };
  }
  return null;
}

/**
 * 카카오톡에서 복사한 글의 머리를 지운다(2026-11-17 사용자) — 시각은 무조건, 보낸 사람 · 날짜 줄도.
 *   PC 카톡   '[김가온] [오후 3:12] 내용' · 날짜 줄 '--------------- 2026년 11월 15일 일요일 ---------------'
 *   내보내기  '2026. 11. 15. 오후 3:12, 김가온 : 내용' · '2026년 11월 15일 오후 3:12, 김가온 : 내용'
 *   어디에 있든  '[오후 3:12]' · '[오전 9:05]' · '[3:12 PM]' · '오후 3:12'(줄 맨 앞)
 * 보낸 사람은 기도제목의 주인이 아닐 수 있어(리더가 대신 올린 글) 나누는 데 쓰지 않는다 — 글 안의 '이름: 기도제목' 으로 나눈다.
 */
export function stripChatHeaders(memo: string): string {
  const TIME = String.raw`(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?`;
  return memo
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*-{3,}.*\d{4}년.*-{3,}\s*$/.test(l) && !/^\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*[월화수목금토일]요일\s*$/.test(l))
    .flatMap((l) => {
      const heads = [
        // PC 카톡 '[보낸 사람] [시각] '
        new RegExp(String.raw`^\s*\[[^\]\n]{1,30}\]\s*\[(?:${TIME})\]\s*`),
        // 내보내기 '2026. 11. 15. 오후 3:12, 김가온 : ' · '2026년 11월 15일 오후 3:12, 김가온 : '
        new RegExp(String.raw`^\s*\d{4}[.년]\s*\d{1,2}[.월]\s*\d{1,2}[.일]?\s*(?:${TIME})\s*,\s*[^:\n]{1,30}\s:\s*`),
        // 줄 맨 앞의 시각
        new RegExp(String.raw`^\s*(?:${TIME})\s+`),
      ];
      let out = l;
      let head = false;
      for (const re of heads) {
        if (re.test(out)) {
          out = out.replace(re, "");
          head = true;
        }
      }
      // 어디에 있든 시각
      out = out.replace(new RegExp(String.raw`\[(?:${TIME})\]`, "g"), "").replace(/[ \t]{2,}/g, " ");
      // 머리가 있던 줄은 새 메시지 — 빈 줄을 앞에 두어 앞 사람에게 이어 붙지 않게 한다
      return head ? ["", out] : [out];
    })
    .join("\n");
}

/** 메모 → 차례대로 나눈 조각(personId 가 null 이면 누구 것도 아닌 글) */
export function memoSegments(persons: SplitPerson[], memo0: string): MemoSegment[] {
  const memo = stripChatHeaders(memo0);
  const rules = rulesFor(persons);
  const segs: MemoSegment[] = [];
  let cur: string | null = null; // 지금 이어 쓰는 사람
  let noteMode = false;
  const push = (personId: string | null, text: string) => {
    const t = text.trim();
    if (!t) return;
    const last = segs[segs.length - 1];
    if (last && last.personId === personId) last.text += `\n${t}`;
    else segs.push({ personId, text: t });
  };
  for (const raw of memo.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      cur = null;
      continue;
    }
    const line = unwrapLine(raw);
    if (!leadName(rules, line) && isTitleLine(raw)) {
      cur = null; // 제목 줄 — 버리고, 그 아래는 새 묶음
      continue;
    }
    const noteHead = NOTE_HEAD.exec(line);
    if (noteHead && !leadName(rules, line)) {
      noteMode = true;
      cur = null;
      push(null, line.slice(noteHead[0].length));
      continue;
    }
    // 한 줄 안에서 문장이 이름으로 다시 시작하면 거기서 사람을 바꾼다
    const parts = line.split(/(?<=[.!?。…])\s+|\s+\/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const hit = leadName(rules, parts[i].replace(BULLET, ""));
      if (hit) {
        cur = hit.id;
        noteMode = false;
        push(cur, hit.rest.replace(/^\s+/, "").replace(PRAYER_HEAD, ""));
      } else {
        push(noteMode ? null : cur, cur && !noteMode ? parts[i].replace(PRAYER_HEAD, "") : parts[i]);
      }
    }
  }
  return segs;
}

/** 메모 → 사람별 기도제목 · 특이사항(문장은 그대로) */
export function splitMemoPlain(persons: SplitPerson[], memo: string): { prayers: { personId: string; prayer: string }[]; note: string } {
  const by = new Map<string, string[]>();
  const note: string[] = [];
  for (const s of memoSegments(persons, memo)) {
    if (s.personId) by.set(s.personId, [...(by.get(s.personId) ?? []), s.text]);
    else note.push(s.text);
  }
  const clean = (t: string) =>
    t
      .split("\n")
      .map((l) => l.replace(BULLET, "").trim())
      .filter(Boolean)
      .join("\n");
  return {
    prayers: [...by.entries()].flatMap(([personId, texts]) => {
      const prayer = clean(texts.join("\n"));
      return prayer ? [{ personId, prayer }] : [];
    }),
    note: clean(note.join("\n")),
  };
}

/** 메모에서 이 사람들 조각을 뺀 글 — AI 로 보내기 전에 동의하지 않은 사람 것을 덜어 낸다 */
export function memoWithout(persons: SplitPerson[], memo: string, dropIds: ReadonlySet<string>): string {
  const nameOf = new Map(persons.map((p) => [p.id, p.name]));
  return memoSegments(persons, memo)
    .filter((s) => !s.personId || !dropIds.has(s.personId))
    .map((s) => (s.personId ? `${nameOf.get(s.personId)}: ${s.text}` : s.text))
    .join("\n");
}
