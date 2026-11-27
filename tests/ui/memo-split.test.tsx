import { describe, expect, it } from "vitest";

import { isTitleLine, memoWithout, splitMemoPlain, stripChatHeaders } from "@/lib/memo-split";

// 가짜 이름만 쓴다
const P = [
  { id: "a", name: "김가온" },
  { id: "b", name: "이나래" },
  { id: "c", name: "박은혜" },
  { id: "d", name: "최준" },
  { id: "e", name: "정도윤" },
  { id: "f", name: "한도윤" },
];
const by = (r: ReturnType<typeof splitMemoPlain>) => Object.fromEntries(r.prayers.map((p) => [p.personId, p.prayer]));

describe("메모 나누기(AI 없이)", () => {
  it("이름 - 내용 · 이름은 내용 · 성까지 붙은 이름", () => {
    const r = splitMemoPlain(P, "가온 - 이번 주 시험, 집중할 수 있게\n나래는 이사 준비 중\n박은혜: 가족 건강");
    expect(by(r)).toEqual({ a: "이번 주 시험, 집중할 수 있게", b: "이사 준비 중", c: "가족 건강" });
    expect(r.note).toBe("");
  });

  it("이름만 있는 줄 아래의 글머리 줄은 그 사람 것, 빈 줄에서 끊는다", () => {
    const r = splitMemoPlain(P, "1. 가온\n- 시험\n- 취업 준비\n\n2. 나래 자매\n기도제목: 이사\n\n다음 주는 야외 모임");
    expect(by(r)).toEqual({ a: "시험\n취업 준비", b: "이사" });
    expect(r.note).toBe("다음 주는 야외 모임");
  });

  it("흔한 낱말 이름은 구분 기호 · 호칭이 붙을 때만, 낱말 속 이름은 이름이 아니다", () => {
    const r = splitMemoPlain(P, "은혜 받은 한 주였다\n은혜: 진로\n가온이네 집에서 모임\n가온이가 감기");
    expect(by(r)).toEqual({ c: "진로", a: "집에서 모임\n감기" });
    expect(r.note).toBe("은혜 받은 한 주였다");
    expect(splitMemoPlain(P, "나래미술관에 다녀옴").prayers).toEqual([]);
  });

  it("같은 이름이 둘이면 성까지 붙여야 한다 · 두 글자 이름도 성까지", () => {
    const r = splitMemoPlain(P, "도윤 - 면접\n정도윤 - 이직\n최준 - 군 입대\n준 - 모름");
    expect(by(r)).toEqual({ e: "이직", d: "군 입대\n준 - 모름" });
    expect(r.note).toBe("도윤 - 면접");
  });

  it("한 줄에서 문장이 이름으로 다시 시작하면 사람을 바꾼다 · 특이사항 머리말", () => {
    const r = splitMemoPlain(P, "가온 시험 잘 보도록. 나래 이사 잘 하도록.\n특이사항: 새가족 한 명 방문\n다음 주 쉼");
    expect(by(r)).toEqual({ a: "시험 잘 보도록.", b: "이사 잘 하도록." });
    expect(r.note).toBe("새가족 한 명 방문\n다음 주 쉼");
  });

  it("제목뿐인 줄은 버린다 · 줄 앞 괄호는 짝과 함께 뗀다(2026-11-23) ★", () => {
    for (const t of ["<기도제목>", "[11/22 기도제목]", "프레쉬 목장 기도제목", "11월 22일 기도제목 :", "■ 중보기도", "기도 제목", "오늘의 기도 나눔", "이번 주 나눔:"]) expect(isTitleLine(t), t).toBe(true);
    for (const t of ["기도제목 나눌 때 다들 진지했음", "기도제목: 이사", "가온 - 시험", "다음 주는 야외 모임"]) expect(isTitleLine(t), t).toBe(false);
    const r = splitMemoPlain(P, "<기도제목>\n가온: 시험 잘 볼 수 있도록\n[11/22 기도제목]\n나래: 이사\n\n■ 중보기도\n(다음 주 쉼)\n기도제목 나눌 때 다들 진지했음");
    expect(by(r)).toEqual({ a: "시험 잘 볼 수 있도록", b: "이사" });
    expect(r.note).toBe("다음 주 쉼\n기도제목 나눌 때 다들 진지했음");
    expect(r.note).not.toMatch(/기도 ?제목>|중보기도/);
  });

  it("memoWithout — 고른 사람 조각만 덜어 낸다", () => {
    const out = memoWithout(P, "가온 - 시험\n나래 - 이사\n이어진 줄\n\n다 같이 식사", new Set(["b"]));
    expect(out).toBe("김가온: 시험\n다 같이 식사");
  });
  it("카톡에서 복사한 머리 — 시각은 무조건, 보낸 사람 · 날짜 줄도 지우고 글 안의 '이름: 기도제목' 으로 나눈다(2026-11-17) ★", () => {
    const pc = [
      "--------------- 2026년 11월 15일 일요일 ---------------",
      "[김가온] [오후 3:12] • 가온: 시험 잘 볼 수 있도록",
      "[김가온] [오후 3:13] • 나래: 이사 잘 마무리되도록 [오후 3:13]",
      "2026. 11. 15. 오후 3:20, 김가온 : • 은혜: 진로",
      "오전 9:05 다 같이 식사",
    ].join("\n");
    expect(stripChatHeaders(pc).split("\n").filter((l) => l.trim())).toEqual(["• 가온: 시험 잘 볼 수 있도록", "• 나래: 이사 잘 마무리되도록 ", "• 은혜: 진로", "다 같이 식사"]);
    const r = splitMemoPlain(P, pc);
    expect(by(r)).toEqual({ a: "시험 잘 볼 수 있도록", b: "이사 잘 마무리되도록", c: "진로" });
    expect(r.note).toBe("다 같이 식사");
    expect(r.note).not.toMatch(/오후|2026/);
  });
});
