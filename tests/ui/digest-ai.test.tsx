import { describe, expect, it } from "vitest";

import { fillNames, idsIn, pseudonymize, validateDigest, type DigestOutput, type DigestSource } from "@/lib/ai/digest-core";

/**
 * AI 주간 정리의 순수한 부분(2026-11-07) — 가명 · 검사 · 자리표시. 이름은 모두 지어낸 것.
 */
const G1 = "00000000-0000-4000-8000-0000000000a1";
const G2 = "00000000-0000-4000-8000-0000000000a2";
const P = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const R = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;

const base = (): DigestSource => ({
  weekKey: "2026-10-04",
  groups: [
    { id: G1, name: "가온" },
    { id: G2, name: "나래" },
  ],
  persons: [
    { id: P(1), name: "김하늘", excluded: false },
    { id: P(2), name: "이바다", excluded: false },
    { id: P(3), name: "박구름", excluded: true },
    { id: P(4), name: "최별빛", excluded: false },
  ],
  records: [
    { id: R(1), personId: P(1), groupId: G1, prayer: "취업 준비. 이바다 와 같이 기도해 주세요", prayerStatus: "ongoing", streakWeeks: 4, absentReason: null, meetingAbsentReason: null, onlineReason: null, note: null },
    { id: R(2), personId: P(2), groupId: G1, prayer: null, prayerStatus: null, streakWeeks: null, absentReason: "출장", meetingAbsentReason: null, onlineReason: null, note: null },
    { id: R(3), personId: P(3), groupId: G2, prayer: "가족 건강", prayerStatus: "new", streakWeeks: 1, absentReason: null, meetingAbsentReason: null, onlineReason: null, note: null },
    { id: R(4), personId: P(4), groupId: G2, prayer: null, prayerStatus: null, streakWeeks: null, absentReason: null, meetingAbsentReason: null, onlineReason: null, note: null },
  ],
  notes: [{ groupId: G2, note: "박구름 이 이번 주 이사했다" }],
});

describe("가명", () => {
  it("이름이 하나도 나가지 않는다 — 기록 주인 · 글 속 이름 모두 기호로, 뺀 사람은 (이름 생략)", () => {
    const ps = pseudonymize(base())!;
    for (const name of ["김하늘", "이바다", "박구름", "최별빛", "가온", "나래"]) expect(ps.body).not.toContain(name);
    expect(ps.body).toContain("P02 와 같이 기도해");
    expect(ps.body).toContain("(이름 생략) 이 이번 주 이사했다");
  });

  it("AI 에서 뺀 사람의 기록은 통째로 빠지고, 글이 없는 기록도 보내지 않는다", () => {
    const ps = pseudonymize(base())!;
    expect(ps.sent).toEqual({ records: 2, notes: 1 });
    expect([...ps.record.values()].map((r) => r.id)).toEqual([R(1), R(2)]);
    expect(ps.body).not.toContain("가족 건강");
  });

  it("연속 주 · 상태를 붙인다", () => {
    const ps = pseudonymize(base())!;
    expect(ps.body).toContain("기도제목(연속 4주, 이어지는 제목): 취업 준비");
    expect(ps.body).toContain("예배 결석 사유: 출장");
  });

  it("보낼 글이 없으면 null", () => {
    const src = base();
    src.records = src.records.map((r) => ({ ...r, prayer: null, absentReason: null }));
    src.notes = [];
    expect(pseudonymize(src)).toBeNull();
  });
});

describe("검사", () => {
  const ps = () => pseudonymize(base())!;
  const out = (o: Partial<DigestOutput>): DigestOutput => ({ highlights: [], thanks: [], groups: [], intercession: [], ...o });

  it("기호를 자리표시로 바꾸고 근거를 기록 · 목장으로", () => {
    const v = validateDigest(out({ highlights: [{ text: "P01 의 취업 기도가 4주째 이어진다 (R01)", sources: ["R01"] }], groups: [{ group: "G02", summary: "이사 소식이 있다", sources: ["N01"] }] }), ps());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.digest.highlights[0]).toEqual({ text: `{{p:${P(1)}}} 의 취업 기도가 4주째 이어진다`, src: [{ r: R(1), g: G1 }] });
    expect(v.digest.groups[0]).toEqual({ g: G2, text: "이사 소식이 있다", src: [{ n: G2 }] });
  });

  it("근거가 없거나 모르는 기호면 그 항목을 버린다", () => {
    const v = validateDigest(
      out({
        highlights: [
          { text: "좋은 항목 P01", sources: ["R01"] },
          { text: "근거 없음", sources: [] },
          { text: "P02 좋은 항목 둘", sources: ["R02"] },
        ],
        thanks: [{ text: "P09 모르는 사람", sources: ["R01"] }],
      }),
      ps(),
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.digest.highlights).toHaveLength(2);
      expect(v.digest.thanks).toHaveLength(0);
      expect(v.digest.dropped).toBe(2);
    }
  });

  it("절반 넘게 버려지면 실패", () => {
    const v = validateDigest(out({ highlights: [{ text: "a", sources: ["R99"] }, { text: "b", sources: ["R01"] }, { text: "c", sources: [] }] }), ps());
    expect(v).toMatchObject({ ok: false, reason: "too_many_dropped" });
  });

  it("눈여겨볼 것은 다섯 개까지", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `P01 항목 ${i}`, sources: ["R01"] }));
    const v = validateDigest(out({ highlights: many, thanks: many.slice(0, 5) }), ps());
    expect(v.ok && v.digest.highlights.length).toBe(5);
  });
});

describe("상한 · 버린 까닭 (2026-11-07)", async () => {
  const { countDrops, LIMITS } = await import("@/lib/ai/digest-core");
  const ps = () => pseudonymize(base())!;
  const out = (o: Partial<DigestOutput>): DigestOutput => ({ highlights: [], thanks: [], groups: [], intercession: [], ...o });
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `P01 — 제목 ${i}`, sources: ["R01"] }));

  it("함께 기도할 제목은 열다섯 개까지 — 넘친 것은 '상한 넘음', 잘린 것만으로는 실패하지 않는다", () => {
    expect(LIMITS.intercession).toBe(15);
    const v = validateDigest(out({ intercession: many(40), highlights: many(2) }), ps());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.digest.intercession).toHaveLength(15);
    expect(v.digest.dropped).toBe(25);
    expect(countDrops(v.drops)).toEqual({ over_limit: 25, no_source: 0, unknown_token: 0, person_mismatch: 0, other: 0 });
    expect(v.drops[0]).toMatchObject({ section: "intercession", reason: "over_limit", text: "P01 — 제목 15", sources: ["R01"] });
  });

  it("까닭별로 센다 — 근거 없음 · 모르는 기호(근거 · 글 속) · 그 밖(빈 글 · 모르는 목장 · 같은 목장 두 번)", () => {
    const v = validateDigest(
      out({
        highlights: [
          { text: "좋은 항목 P01", sources: ["R01"] },
          { text: "근거 없음", sources: [] },
          { text: "모르는 근거", sources: ["R99"] },
          { text: "P09 모르는 사람", sources: ["R01"] },
          { text: "  ", sources: ["R01"] },
          ...many(6),
        ],
        groups: [
          { group: "G01", summary: "요약", sources: ["R01"] },
          { group: "G01", summary: "또 요약", sources: ["R01"] },
          { group: "G09", summary: "모르는 목장", sources: ["R01"] },
        ],
      }),
      ps(),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(countDrops(v.drops)).toEqual({ over_limit: 2, no_source: 1, unknown_token: 2, person_mismatch: 0, other: 3 });
    expect(v.digest.dropped).toBe(8);
    expect(v.drops.find((d) => d.reason === "no_source")).toEqual({ section: "highlights", reason: "no_source", text: "근거 없음", sources: [] });
    expect(v.drops.filter((d) => d.section === "groups").map((d) => d.reason)).toEqual(["other", "other"]);
  });

  it("잘못 쓴 항목이 상한 안 항목의 절반을 넘으면 실패 — 까닭은 그래도 남는다", () => {
    const v = validateDigest(out({ highlights: [{ text: "a", sources: [] }, { text: "b", sources: ["R99"] }, { text: "P01 c", sources: ["R01"] }], intercession: many(30) }), ps());
    expect(v.ok).toBe(true); // 잘못 쓴 2 · 상한 안 18 — 절반이 안 된다
    const w = validateDigest(out({ highlights: [{ text: "a", sources: [] }, { text: "b", sources: ["R99"] }, { text: "P01 c", sources: ["R01"] }] }), ps());
    expect(w.ok).toBe(false);
    expect(countDrops(w.drops)).toEqual({ over_limit: 0, no_source: 1, unknown_token: 1, person_mismatch: 0, other: 0 });
  });
});

describe("근거와 사람 · 호칭 · 이름 경계 (2026-11-07)", async () => {
  const { countDrops } = await import("@/lib/ai/digest-core");
  const { hasNameAt } = await import("@/lib/ai/names");
  const ps = () => pseudonymize(base())!; // R01 = P01(김하늘) · R02 = P02(이바다) · N01 = 나래 특이사항
  const out = (o: Partial<DigestOutput>): DigestOutput => ({ highlights: [], thanks: [], groups: [], intercession: [], ...o });

  it("글 속 사람이 근거 기록의 주인도, 그 기록에 함께 나온 사람도 아니거나 주인이 없으면 '근거와 사람 불일치'로 버린다", () => {
    // R01(P01) 기도제목에 P02(이바다)가 함께 나온다 — "P01 과 P02" 는 통과, "P02 만" 은 주인이 없어 버림
    const v = validateDigest(
      out({
        highlights: [
          { text: "P01 의 취업 기도가 이어진다", sources: ["R01"] },
          { text: "P02 가 취업을 준비한다", sources: ["R01"] }, // 다른 사람 기록을 그 사람 일처럼(주인 없음)
          { text: "P01 과 P02 가 함께 기도했다", sources: ["R01"] }, // P02 는 R01 에 함께 나온다 — 통과
          { text: "P02 가 P01 과 출장을 갔다", sources: ["R02"] }, // P01 은 R02 에 나오지 않는다
        ],
        thanks: [{ text: "P01 · P02 출장이 잘 끝났다", sources: ["R01", "R02"] }], // 둘 다 근거가 있다
        intercession: [{ text: "P02 — 출장 가운데", sources: ["R01"] }],
        groups: [{ group: "G01", summary: "P02 가 출장으로 빠졌다", sources: ["R01"] }], // 목장 한 줄은 보지 않는다
      }),
      ps(),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(countDrops(v.drops)).toEqual({ over_limit: 0, no_source: 0, unknown_token: 0, person_mismatch: 3, other: 0 });
    expect(v.drops.map((d) => d.text)).toEqual(["P02 가 취업을 준비한다", "P02 가 P01 과 출장을 갔다", "P02 — 출장 가운데"]);
    expect(v.digest.highlights).toHaveLength(2);
    expect(v.digest.thanks).toHaveLength(1);
    expect(v.digest.groups).toHaveLength(1);
  });

  it("기록 속에 함께 나온 사람 — 주인과 같이 쓰면 통과, 주인 없이 쓰거나 언급 안 된 사람이면 버린다", () => {
    // 하율(P01)의 기록에 다솜(P02)이 나온다. 소율(P03)의 메모, 민결(P04)은 소율 메모에 나오지 않는다
    const src: DigestSource = {
      weekKey: "2026-09-27",
      groups: base().groups,
      persons: [
        { id: P(11), name: "고하율", excluded: false },
        { id: P(12), name: "남다솜", excluded: false },
        { id: P(13), name: "강소율", excluded: false },
        { id: P(14), name: "홍민결", excluded: false },
      ],
      records: [
        { ...base().records[3], id: R(11), personId: P(11), groupId: G1, prayer: "한결 나아졌어요. 다솜이랑 저녁에 산책했어요", prayerStatus: "ongoing" },
        { ...base().records[3], id: R(12), personId: P(13), groupId: G2, note: "언니랑 밤새 이야기했어요. 많이 울었어요" },
        { ...base().records[3], id: R(13), personId: P(14), groupId: G2, prayer: "부서 이동 후 적응", prayerStatus: "new" },
      ],
      notes: [],
    };
    const ps = pseudonymize(src)!;
    const tok = (id: string) => [...ps.person].find(([, v]) => v === id)![0];
    const [hayul, dasom, soyul, mingyeol] = [P(11), P(12), P(13), P(14)].map(tok);
    expect(ps.record.get("R01")!.mentions).toEqual([P(12)]);
    const v = validateDigest(
      out({
        highlights: [
          { text: `${hayul} 이 ${dasom} 과 산책하며 한결 나아졌다`, sources: ["R01"] }, // 주인 + 기록 속 사람 — 통과
          { text: `${dasom} 이 산책하며 나아졌다`, sources: ["R01"] }, // 기록 속 사람만, 주인 없음 — 버림
          { text: `${mingyeol} 이 밤새 이야기하며 많이 울었다`, sources: ["R02"] }, // 소율 메모를 민결의 일로 — 버림
          { text: `${soyul} 이 밤새 이야기하며 많이 울었다`, sources: ["R02"] }, // 주인 — 통과
        ],
      }),
      ps,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.digest.highlights.map((h) => h.src[0])).toEqual([{ r: R(11), g: G1 }, { r: R(12), g: G2 }]);
    expect(v.drops.map((d) => [d.reason, d.text])).toEqual([
      ["person_mismatch", `${dasom} 이 산책하며 나아졌다`],
      ["person_mismatch", `${mingyeol} 이 밤새 이야기하며 많이 울었다`],
    ]);
  });

  it("기록을 근거로 달았는데 글에 사람이 하나도 없으면 버린다(주인이 나와야 한다)", () => {
    const v = validateDigest(out({ highlights: [{ text: "P01 의 취업 기도", sources: ["R01"] }, { text: "취업 기도가 이어진다", sources: ["R01"] }] }), ps());
    expect(v.ok && countDrops(v.drops).person_mismatch).toBe(1);
  });

  it("특이사항만 단 항목은 사람 검사를 하지 않는다", () => {
    const v = validateDigest(out({ highlights: [{ text: "P01 이 나래 목장 이사 소식을 전했다", sources: ["N01"] }] }), ps());
    expect(v.ok && v.digest.highlights.length).toBe(1);
  });

  it("사람 불일치도 실패 기준에 든다 — 잘못 쓴 항목이 제대로 쓴 항목보다 많으면 실패", () => {
    const v = validateDigest(out({ highlights: [{ text: "P02 a", sources: ["R01"] }, { text: "P02 b", sources: ["R01"] }, { text: "P01 c", sources: ["R01"] }] }), ps());
    expect(v).toMatchObject({ ok: false, reason: "too_many_dropped" });
  });

  it("사람 바로 뒤의 형제 · 자매(님)는 지우고 조사를 이름에 맞춘다", () => {
    const people = new Map([[P(1), "김하늘"], [P(2), "이바다"]]);
    const groups = new Map([[G1, "가온"]]);
    expect(fillNames(`{{p:${P(1)}}} 자매가 왔다`, people, groups)).toBe("김하늘이 왔다");
    expect(fillNames(`{{p:${P(2)}}} 형제는 · {{p:${P(1)}}}자매님과 · {{p:${P(2)}}} 형제 집`, people, groups)).toBe("이바다는 · 김하늘과 · 이바다 집");
    expect(fillNames(`{{p:${P(1)}}}의 자매가 · 형제들이`, people, groups)).toBe("김하늘의 자매가 · 형제들이");
  });

  it("이름만 세기 — 앞이 한글이 아닐 때만('올라온' 속 '라온' 은 세지 않는다)", () => {
    expect(hasNameAt("사진을 올라온 대로", "라온")).toBe(false);
    expect(hasNameAt("라온이가 왔다", "라온")).toBe(true);
    expect(hasNameAt('{"text":"라온 형제"}', "라온")).toBe(true);
    expect(hasNameAt("어제, 라온 생일", "라온")).toBe(true);
  });
});

describe("보여 주기", () => {
  it("자리표시에 이름을 붙이고, 모르는 id 는 (이름 없음)", () => {
    const people = new Map([[P(1), "김하늘"]]);
    const groups = new Map([[G1, "가온"]]);
    expect(fillNames(`{{p:${P(1)}}} · {{p:${P(2)}}} · {{g:${G1}}}`, people, groups)).toBe("김하늘 · (이름 없음) · 가온 목장");
  });

  it("나오는 사람 · 목장 id 를 모은다(근거 목장 포함)", () => {
    const ids = idsIn({ v: 1, highlights: [{ text: `{{p:${P(1)}}}`, src: [{ r: R(1), g: G1 }] }], thanks: [], groups: [{ g: G2, text: "x", src: [{ n: G2 }] }], intercession: [], sent: { records: 1, notes: 1 }, dropped: 0 });
    expect(ids.people).toEqual([P(1)]);
    expect(ids.groups.sort()).toEqual([G1, G2].sort());
  });
});

describe("모델 · effort 고르기 (2026-11-06)", async () => {
  const { estimateCostUsd, resolveDigestEffort, resolveDigestModel } = await import("@/lib/ai/digest-call");

  it("DIGEST_MODEL — 소넷 · 하이쿠만, 없거나 그 밖의 값이면 소넷", () => {
    expect(resolveDigestModel("claude-haiku-5-5")).toBe("claude-haiku-5-5");
    expect(resolveDigestModel(" claude-sonnet-5-5 ")).toBe("claude-sonnet-5-5");
    expect(resolveDigestModel(undefined)).toBe("claude-sonnet-5-5");
    expect(resolveDigestModel("claude-opus-5-5")).toBe("claude-sonnet-5-5");
    expect(resolveDigestModel("")).toBe("claude-sonnet-5-5");
  });

  it("DIGEST_EFFORT — low~max, 기본 medium, 모르는 값은 medium", () => {
    for (const m of ["claude-sonnet-5-5", "claude-haiku-5-5"] as const) {
      expect(resolveDigestEffort(m, undefined)).toBe("medium");
      expect(resolveDigestEffort(m, "LOW")).toBe("low");
      expect(resolveDigestEffort(m, "xhigh")).toBe("xhigh");
      expect(resolveDigestEffort(m, "max")).toBe("max");
      expect(resolveDigestEffort(m, "turbo")).toBe("medium");
    }
  });

  it("예상 비용 — 공식 가격표(100만 토큰당 소넷 $2/$10 · 하이쿠 $0.10/$0.50, 10만 토큰 넘으면 $0.50/$2.50)", () => {
    expect(estimateCostUsd("claude-sonnet-5-5", 30_000, 3_000)).toBeCloseTo(0.09, 6);
    expect(estimateCostUsd("claude-haiku-5-5", 30_000, 3_000)).toBeCloseTo(0.0045, 6);
    expect(estimateCostUsd("claude-haiku-5-5", 200_000, 3_000)).toBeCloseTo(0.1075, 6);
  });
});

describe("이름 뒤 조사 (2026-11-07)", async () => {
  const { codaOf, josaFor } = await import("@/lib/ai/josa");
  const N = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
  const people = new Map([
    [N(1), "류나무"],
    [N(2), "서강물"],
    [N(3), "문달님"],
    [N(4), "추하람"],
    [N(5), "오솔길"],
    [N(6), "John"],
    [N(7), "Mark"],
    [N(8), "Paul"],
    [N(9), "민수7"],
    [N(10), "하나2"],
  ]);
  const groups = new Map([[G1, "솔빛"]]);
  const fill = (s: string) => fillNames(s.replace(/\{(\d+)\}/g, (_, n) => `{{p:${N(Number(n))}}}`), people, groups);

  it("평가에서 나온 여섯 개 — 류나무이 · 서강물가 · 문달님가 · 추하람는 · 오솔길가 · 류나무과", () => {
    expect(fill("{1}이 야근으로 오지 못했다")).toBe("류나무가 야근으로 오지 못했다");
    expect(fill("{2}가 새 기도제목을 나눴다")).toBe("서강물이 새 기도제목을 나눴다");
    expect(fill("{3}가 기도를 부탁했다")).toBe("문달님이 기도를 부탁했다");
    expect(fill("{4}는 새 기도제목을 냈다")).toBe("추하람은 새 기도제목을 냈다");
    expect(fill("{5}가 함께 왔다")).toBe("오솔길이 함께 왔다");
    expect(fill("{1}과 이야기했다")).toBe("류나무와 이야기했다");
  });

  it("맞게 쓴 조사는 그대로", () => {
    expect(fill("{1}가 · {2}이 · {4}은 · {3}을 · {1}와")).toBe("류나무가 · 서강물이 · 추하람은 · 문달님을 · 류나무와");
  });

  it("으로/로 — ㄹ 받침은 로", () => {
    expect(fill("{5}으로부터")).toBe("오솔길로부터");
    expect(fill("{2}으로")).toBe("서강물로");
    expect(fill("{3}로")).toBe("문달님으로");
    expect(fill("{1}으로서")).toBe("류나무로서");
  });

  it("두 글자 이상 조사 — 이나 · 이랑 · 이에요 · 이었 · 이라고 · 이며", () => {
    expect(fill("{1}이나 {2}나")).toBe("류나무나 서강물이나");
    expect(fill("{1}이랑 {3}랑")).toBe("류나무랑 문달님이랑");
    expect(fill("{1}이에요 · {2}예요 · {1}이예요")).toBe("류나무예요 · 서강물이에요 · 류나무예요");
    expect(fill("{1}이었다 · {2}였다")).toBe("류나무였다 · 서강물이었다");
    expect(fill("{1}이라고 · {4}라고")).toBe("류나무라고 · 추하람이라고");
    expect(fill("{3}며")).toBe("문달님이며");
  });

  it("조사가 아니면 건드리지 않는다 — 가족 · 이번 · 의 · 도 · 에게 · 띄어 쓴 말", () => {
    expect(fill("{2}가족과")).toBe("서강물가족과");
    expect(fill("{1}이번 주")).toBe("류나무이번 주");
    expect(fill("{2}의 · {2}도 · {2}에게 · {2} 가")).toBe("서강물의 · 서강물도 · 서강물에게 · 서강물 가");
    expect(fill("{1}과도 · {2}와는")).toBe("류나무와도 · 서강물과는");
  });

  it("영문 · 숫자 · 목장 · 모르는 이름", () => {
    expect(fill("{6}가 · {7}이 · {8}으로")).toBe("John이 · Mark가 · Paul로");
    expect(fill("{9}가 · {10}이")).toBe("민수7이 · 하나2가");
    expect(fillNames(`{{g:${G1}}}가 · {{g:${G2}}}는`, people, groups)).toBe("솔빛 목장이 · (목장)은");
    expect(fillNames(`{{p:${P(9)}}}가`, people, groups)).toBe("(이름 없음)이");
  });

  it("받침 셈", () => {
    expect([codaOf("나무"), codaOf("강물"), codaOf("달님"), codaOf("Young"), codaOf("ㅋㅋ"), codaOf("")]).toEqual(["none", "rieul", "other", "other", null, null]);
    expect(josaFor("ㅋㅋ", "가")).toBe("가");
    expect(josaFor("나무", "의")).toBe("의");
  });
});

describe("이름만 쓴 경우 가리기 (2026-11-07)", async () => {
  const { COMMON_WORD_NAMES, givenNameOf } = await import("@/lib/ai/names");
  const Q = (n: number) => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, "0")}`;
  const people: DigestSource["persons"] = [
    { id: Q(1), name: "고은결", excluded: true, groupId: G1 }, // 뺀 사람
    { id: Q(2), name: "정재희", excluded: true, groupId: G2 }, // 뺀 사람
    { id: Q(3), name: "남다솜", excluded: false, groupId: G1 },
    { id: Q(4), name: "한은혜", excluded: false, groupId: G1 }, // 흔한 낱말 이름
    { id: Q(5), name: "서이레", excluded: true, groupId: G2 }, // 흔한 낱말 이름 + 뺀 사람
    { id: Q(6), name: "강하람", excluded: false, groupId: G1 }, // 같은 이름 둘 — 목장이 다르다
    { id: Q(7), name: "윤하람", excluded: false, groupId: G2 },
    { id: Q(8), name: "백도윤", excluded: false, groupId: G2 }, // 같은 이름 둘 — 같은 목장
    { id: Q(9), name: "조도윤", excluded: false, groupId: G2 },
    { id: Q(10), name: "글쓴이", excluded: false, groupId: G1 },
    { id: Q(11), name: "남궁가온", excluded: false, groupId: G1 },
  ];
  /** 글쓴이(G1 이면 가온 목장, G2 면 나래 목장)의 메모 한 줄을 가명으로 바꾼 것 */
  const memo = (note: string, group = G1) => {
    const ps = pseudonymize({ weekKey: "2026-10-04", groups: base().groups, persons: people, records: [{ ...base().records[3], id: R(9), personId: Q(10), groupId: group, note }], notes: [] })!;
    const line = ps.body.split("\n").find((l) => l.includes("메모:"))!;
    const tok = (id: string) => [...ps.person].find(([, v]) => v === id)?.[0];
    return { text: line.replace(/^\s*메모: /, ""), tok };
  };

  it("성을 뺀 이름 — 세 글자는 둘째부터, 두 글자 성은 셋째부터, 두 글자 이름은 다루지 않는다", () => {
    expect([givenNameOf("고은결"), givenNameOf("남궁가온"), givenNameOf("김하"), givenNameOf("Kim Lee")]).toEqual(["은결", "가온", null, null]);
    expect(COMMON_WORD_NAMES.has("은혜")).toBe(true);
  });

  it("뺀 사람 — 성 포함 · 이름만 · 이름+이 · 아 · 야, 어디에 나오든 (이름 생략)", () => {
    expect(memo("고은결 자매 집에 갔다").text).toBe("(이름 생략) 자매 집에 갔다");
    expect(memo("은결 자매가 지쳐 보인다").text).toBe("(이름 생략) 자매가 지쳐 보인다");
    expect(memo("은결이가 많이 울었다").text).toBe("(이름 생략)가 많이 울었다");
    expect(memo("은결아 힘내").text).toBe("(이름 생략) 힘내");
    expect(memo("재희야 고마워").text).toBe("(이름 생략) 고마워");
    expect(memo("어제 은결 생각이 났다").text).toBe("어제 (이름 생략) 생각이 났다");
    expect(memo("재희랑 밥 먹었다").text).toBe("(이름 생략)랑 밥 먹었다");
  });

  it("나머지 사람 — 호칭 · '이' 가 붙을 때만 기호, 없으면 그대로", () => {
    const a = memo("다솜 자매랑 산책했다");
    expect(a.text).toBe(`${a.tok(Q(3))} 자매랑 산책했다`);
    const b = memo("다솜이랑 산책했다");
    expect(b.text).toBe(`${b.tok(Q(3))}랑 산책했다`);
    const c = memo("다솜님 · 다솜씨 · 가온 형제");
    expect(c.text).toBe(`${c.tok(Q(3))}님 · ${c.tok(Q(3))}씨 · ${c.tok(Q(11))} 형제`);
    expect(memo("다솜 생일이라 케이크를 먹었다").text).toBe("다솜 생일이라 케이크를 먹었다");
    expect(memo("다솜 형편이 어렵다").text).toBe("다솜 형편이 어렵다");
  });

  it("흔한 낱말 이름 — '은혜받았다' 는 그대로, '은혜 자매' · '은혜야' 는 바뀐다(뺀 사람도 같다)", () => {
    expect(memo("말씀으로 은혜받았다").text).toBe("말씀으로 은혜받았다");
    const a = memo("은혜 자매가 찬양을 맡았다");
    expect(a.text).toBe(`${a.tok(Q(4))} 자매가 찬양을 맡았다`);
    const b = memo("은혜야 생일 축하해");
    expect(b.text).toBe(`${b.tok(Q(4))} 생일 축하해`);
    expect(memo("여호와 이레를 고백했다").text).toBe("여호와 이레를 고백했다");
    expect(memo("이레 자매가 새로 왔다").text).toBe("(이름 생략) 자매가 새로 왔다");
  });

  it("같은 이름 둘 — 글 쓴 목장에 한 명뿐이면 그 사람, 아니면 (이름 생략)", () => {
    const inG1 = memo("하람 형제가 밥을 샀다", G1);
    expect(inG1.text).toBe(`${inG1.tok(Q(6))} 형제가 밥을 샀다`);
    const inG2 = memo("하람 형제가 밥을 샀다", G2);
    expect(inG2.text).toBe(`${inG2.tok(Q(7))} 형제가 밥을 샀다`);
    expect(memo("도윤 형제가 왔다", G2).text).toBe("(이름 생략) 형제가 왔다"); // 같은 목장에 둘
    expect(memo("도윤 형제가 왔다", G1).text).toBe("(이름 생략) 형제가 왔다"); // 글 쓴 목장에 없다
  });
});

describe("두 글자 이름인 뺀 사람 (2026-11-07)", async () => {
  const { excludedNameLeaks, shortGivenNameOf } = await import("@/lib/ai/names");
  const S = (n: number) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, "0")}`;
  const people: DigestSource["persons"] = [
    { id: S(1), name: "이준", excluded: true, groupId: G1 }, // 뺀 사람 · 두 글자
    { id: S(2), name: "김솔", excluded: false, groupId: G1 }, // 나머지 · 두 글자 — 다루지 않는다
    { id: S(3), name: "글쓴이", excluded: false, groupId: G1 },
  ];
  const memo = (note: string) => {
    const ps = pseudonymize({ weekKey: "2026-10-04", groups: base().groups, persons: people, records: [{ ...base().records[3], id: R(9), personId: S(3), groupId: G1, note }], notes: [] })!;
    return ps.body.split("\n").find((l) => l.includes("메모:"))!.replace(/^\s*메모: /, "");
  };

  it("성을 뺀 한 글자", () => {
    expect([shortGivenNameOf("이준"), shortGivenNameOf("고은결"), shortGivenNameOf("J")]).toEqual(["준", null, null]);
  });

  it("'준이가' · '준아' · '준 형제' 는 가린다", () => {
    expect(memo("준이가 연락이 안 된다")).toBe("(이름 생략)가 연락이 안 된다");
    expect(memo("준아 힘내")).toBe("(이름 생략) 힘내");
    expect(memo("어제 준 형제를 만났다")).toBe("어제 (이름 생략) 형제를 만났다");
    expect(memo("모임 끝나고, 준이랑 밥을 먹었다")).toBe("모임 끝나고, (이름 생략)랑 밥을 먹었다");
    expect(memo("이준 형제가 왔다")).toBe("(이름 생략) 형제가 왔다"); // 성까지 쓴 것
  });

  it("'준비' · '기준이' · '수준' 은 그대로", () => {
    expect(memo("시험 준비를 한다")).toBe("시험 준비를 한다");
    expect(memo("기준이 높다")).toBe("기준이 높다");
    expect(memo("수준이 올라갔다")).toBe("수준이 올라갔다");
    expect(memo("준 것을 돌려받았다")).toBe("준 것을 돌려받았다");
  });

  it("나머지 사람의 두 글자 이름은 다루지 않는다", () => {
    expect(memo("솔 자매가 왔다")).toBe("솔 자매가 왔다");
  });

  it("평가 검사도 같은 규칙 — 남은 것만 찾는다", () => {
    expect(excludedNameLeaks(people, "준이가 왔다")).toEqual(["준이"]);
    expect(excludedNameLeaks(people, "시험 준비 · 기준이 · 수준")).toEqual([]);
    expect(excludedNameLeaks([{ id: S(4), name: "고은결", excluded: true }], "은결 생각")).toEqual(["은결"]);
  });
});

describe("정리 기준 한 줄 (2026-11-08)", async () => {
  const { basisLine } = await import("@/lib/ai/digest-core");
  it("목장 수 · 보고서 수 · KST 요일과 시각", () => {
    // 2026-11-04 수요일 08:12 KST = 11-03 23:12 UTC
    expect(basisLine({ generatedAt: "2026-11-03T23:12:00.000Z", reportCount: 9, groupCount: 12 })).toBe("12개 목장 중 9개 기준 · 수요일 08:12");
  });
  it("수를 모르면 시각만, 만든 때를 모르면 없음", () => {
    expect(basisLine({ generatedAt: "2026-11-03T23:12:00.000Z", reportCount: null, groupCount: null })).toBe("수요일 08:12");
    expect(basisLine({ generatedAt: null, reportCount: 9, groupCount: 12 })).toBeNull();
  });
});
