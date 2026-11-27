/**
 * 글 속 '이름만' 가리기(2026-11-07) — 가명(digest-core pseudonymize)은 성까지 붙은 이름을 먼저 바꾸고, 그다음 이것을 쓴다.
 *
 *   AI 에서 뺀 사람   성을 뺀 이름(두 글자 이상)이 글 어디에 나오든 '(이름 생략)'. 흔한 말과 겹쳐 잘못 가려져도 가리는 쪽.
 *                     뒤에 붙은 이 · 아 · 야(은결이가 · 은결아)도 같이 지운다. 기호가 아니라서 누구인지 이어지지 않는다
 *   나머지 사람       사람을 가리키는 말이 붙을 때만 그 사람 기호로 — 호칭(형제 · 자매 · 언니 · 오빠 · 형 · 누나 · 님 · 씨),
 *                     이름 뒤 '이' + 조사(은결이가 · 은결이랑), 부르는 꼴(은결아 · 재희야)
 *                     같은 이름이 명단에 둘 이상이면 글을 쓴 목장에 그 이름이 한 명뿐일 때만 그 사람, 아니면 '(이름 생략)'
 *   흔한 낱말 이름    COMMON_WORD_NAMES — 뺀 사람이라도 위처럼 사람을 가리키는 말이 붙을 때만('은혜받았다' 는 그대로)
 *   두 글자 이름      뺀 사람만 — 성을 뺀 한 글자를, 앞이 한글이 아니고 뒤에 호칭 · 이+조사 · 아/야 가 붙을 때만 '(이름 생략)'
 *                     ('준이가' · '준아' · '준 형제' 는 가리고 '준비' · '기준이' · '수준' 은 그대로). 나머지 사람의 두 글자 이름은 다루지 않는다
 */

/** 흔한 낱말과 같은 이름 — 사람을 가리키는 말이 붙을 때만 이름으로 본다. 목록은 여기 한 곳에만 둔다 */
export const COMMON_WORD_NAMES: ReadonlySet<string> = new Set([
  "은혜", "사랑", "소망", "하늘", "기쁨", "이레", "믿음", "평안", "평화", "온유", "진리", "지혜", "슬기", "보람",
  "한결", "하나", "미소", "바다", "구름", "노을", "이슬", "단비", "가을", "겨울", "여름", "새벽", "아름", "나라", "우주",
]);

const TWO_CHAR_SURNAMES = ["남궁", "제갈", "선우", "황보", "독고", "사공", "서문", "동방"];

/** 성을 뺀 이름 — 한글 세 · 네 글자 이름만(두 글자 이름은 성을 빼면 한 글자라 다루지 않는다) */
export function givenNameOf(fullName: string): string | null {
  const n = fullName.trim();
  if (!/^[가-힣]{3,4}$/.test(n)) return null;
  return n.length === 4 && TWO_CHAR_SURNAMES.includes(n.slice(0, 2)) ? n.slice(2) : n.slice(1);
}

/** 두 글자 이름의 성을 뺀 한 글자 — AI 에서 뺀 사람에게만 쓴다 */
export function shortGivenNameOf(fullName: string): string | null {
  const n = fullName.trim();
  return /^[가-힣]{2}$/.test(n) ? n.slice(1) : null;
}

const TITLE = "형제|자매|언니|오빠|누나|형|님|씨";
/** 호칭 뒤 — 조사 · 끝 · 한글 아닌 글자만('형편' · '씨앗' 은 호칭이 아니다) */
const AFTER_TITLE = "(?=[이가은는을를의도와과랑한에께네만하들님]|[^가-힣]|$)";
/** 이름 뒤 '이' 다음에 오는 조사 */
const AFTER_I = "(?=가|랑|는|를|도|와|한테|에게|의|네|만|하고)";

function refPattern(given: string, anywhere: boolean): RegExp {
  const ctx = `(?:(\\s?(?:${TITLE}))${AFTER_TITLE}|이${AFTER_I}|[아야](?![가-힣]))`;
  return anywhere ? new RegExp(`${given}${ctx}?`, "g") : new RegExp(`(?<![가-힣])${given}${ctx}`, "g");
}

export type NamedPerson = { id: string; name: string; excluded: boolean; groupId?: string | null };

/** text · 글을 쓴 목장 → 이름만 쓴 것을 바꾼 글 */
export function givenNameScrubber(persons: NamedPerson[], tokenFor: (personId: string) => string, omitted: string): (text: string, groupId: string | null) => string {
  const byGiven = new Map<string, NamedPerson[]>();
  for (const p of persons) {
    const g = givenNameOf(p.name);
    if (g) byGiven.set(g, [...(byGiven.get(g) ?? []), p]);
  }
  const rules = [...byGiven.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([given, cands]) => {
      const hideAll = cands.some((p) => p.excluded) && !COMMON_WORD_NAMES.has(given);
      return { given, cands, hideAll, re: refPattern(given, hideAll) };
    });
  const shortRules = shortExcludedPatterns(persons);

  return (text, groupId) => {
    let out = text;
    for (const { given, cands, hideAll, re } of rules) {
      if (!out.includes(given)) continue;
      out = out.replace(re, (_m, title: string | undefined) => {
        let who: NamedPerson | null = null;
        if (!hideAll) {
          const inGroup = cands.filter((p) => groupId && p.groupId === groupId);
          who = cands.length === 1 ? cands[0] : inGroup.length === 1 ? inGroup[0] : null;
        }
        return (who && !who.excluded ? tokenFor(who.id) : omitted) + (title ?? "");
      });
    }
    for (const { given, re } of shortRules) {
      if (out.includes(given)) out = out.replace(re, (_m, title: string | undefined) => omitted + (title ?? ""));
    }
    return out;
  };
}

/** 이름이 낱말 처음에 나오나 — 앞이 한글이 아닐 때만(가리기와 같은 경계. '올라온' 속 '라온' 은 세지 않는다) */
export function hasNameAt(text: string, given: string): boolean {
  return new RegExp(`(?<![가-힣])${given}`).test(text);
}

/** AI 에서 뺀 사람의 두 글자 이름 — 한 글자, 사람을 가리키는 말이 붙을 때만 */
function shortExcludedPatterns(persons: NamedPerson[]): { given: string; re: RegExp }[] {
  const seen = new Set<string>();
  for (const p of persons) {
    const g = p.excluded ? shortGivenNameOf(p.name) : null;
    if (g) seen.add(g);
  }
  return [...seen].map((given) => ({ given, re: refPattern(given, false) }));
}

/**
 * 글에 남은 AI 에서 뺀 사람 이름(평가 · 검사용) — 가리기와 같은 규칙으로 본다.
 * 세 글자 이상: 성을 뺀 이름이 어디든 있으면(흔한 낱말 이름은 낱말과 구별할 수 없어 뺀다). 두 글자: 한 글자 + 사람을 가리키는 말
 */
export function excludedNameLeaks(persons: NamedPerson[], text: string): string[] {
  const leaks: string[] = [];
  for (const p of persons) {
    if (!p.excluded) continue;
    const g = givenNameOf(p.name);
    if (g && !COMMON_WORD_NAMES.has(g) && text.includes(g)) leaks.push(g);
  }
  for (const { re } of shortExcludedPatterns(persons)) {
    const m = text.match(re);
    if (m) leaks.push(m[0]);
  }
  return [...new Set(leaks)];
}
