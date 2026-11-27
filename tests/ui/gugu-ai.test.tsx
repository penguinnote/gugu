import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeAnon } from "@/lib/ai/anon";
import { flowLines, scrubBareGiven, tokenStreamer } from "@/lib/ai/gugu-text";
import { allMenuFor } from "@/lib/all-menu";

/**
 * 구구 AI(2026-11-12) — 흐름 요약 · 보고서 받아쓰기 · 구구 챗봇
 *   · 이름은 AI 에 가지 않는다(기호) · 뺀 사람은 '(이름 생략)' · 답의 기호는 이름으로(조사 맞춤)
 *   · 흘려보내는 답에서 조각 사이에 걸린 기호도 이름으로
 *   · 받아쓰기는 고른 것만 채운다 · 챗봇은 대화를 폰에만 남긴다
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => "/" }));

const PEOPLE = [
  { id: "a", name: "김하늘", excluded: false, groupId: "g" },
  { id: "b", name: "이서준", excluded: false, groupId: "g" },
  { id: "c", name: "박은결", excluded: true, groupId: "g" },
];

describe("이름 가리기 · 되돌리기", () => {
  it("성까지 쓴 이름 · 호칭 붙은 이름은 기호로, 뺀 사람은 '(이름 생략)' ★", () => {
    const anon = makeAnon(PEOPLE);
    const out = anon.scrub("김하늘이 서준이랑 같이 왔고 박은결은 결석", "g");
    expect(out).not.toMatch(/김하늘|서준|은결/);
    expect(out).toContain("(이름 생략)");
    expect(anon.personOf("P01")).toBe("a");
  });

  it("답의 기호는 이름으로 — 조사를 받침에 맞춘다", () => {
    const anon = makeAnon(PEOPLE);
    anon.token("a");
    anon.token("b");
    expect(anon.fill("P01가 왔고 P02는 쉬었어요")).toBe("김하늘이 왔고 이서준은 쉬었어요");
    expect(anon.fill("P09는 모르는 기호")).toBe("(이름 없음)은 모르는 기호");
  });

  it("뺀 사람은 기호를 주지 않는다", () => {
    expect(makeAnon(PEOPLE).token("c")).toBeNull();
  });

  it("메모의 성 뺀 이름만 쓴 것도 기호로 — 다른 낱말에 붙은 것 · 흔한 낱말 이름(하늘)은 그대로 ★", () => {
    const anon = makeAnon(PEOPLE);
    const out = scrubBareGiven("서준 - 시험 / 서준이가 이사 / 서준비 / 하늘 - 쉼", PEOPLE.filter((p) => !p.excluded), anon);
    expect(out).toBe("P01 - 시험 / P01가 이사 / 서준비 / 하늘 - 쉼");
  });
});

describe("흘려보내는 답", () => {
  it("조각 사이에 걸린 기호도 이름으로 · 조사까지 ★", () => {
    const anon = makeAnon(PEOPLE);
    anon.token("a");
    const got: string[] = [];
    const s = tokenStreamer(anon, (t) => got.push(t));
    for (const d of ["요즘 P", "0", "1는 ", "잘 지내요"]) s.push(d);
    s.flush();
    expect(got.join("")).toBe("요즘 김하늘은 잘 지내요");
  });
});

describe("주별 기록 줄", () => {
  it("기록 · 휴주 · 기록 없음, 기도제목 속 이름은 기호로", () => {
    const anon = makeAnon(PEOPLE);
    const lines = flowLines(
      [{ week_key: "2026-11-08", worship_attended: true, worship_online: true, group_meeting_attended: false, one_on_one_contacted: true, prayer_request: "김하늘 언니와 화해", group_id_at_write: "g" }],
      ["2026-11-08", "2026-11-01", "2026-10-25"],
      new Set(["2026-11-01"]),
      anon.scrub,
    );
    expect(lines[0]).toContain("온라인 예배 · 목장 불참 · 개별 연락으로 교제 있음 · 기도제목: P01 언니와 화해");
    expect(lines[1]).toContain("휴주");
    expect(lines[2]).toContain("기록 없음");
  });
});

describe("전체 메뉴 — 구구에게 물어보기", () => {
  it("구구 AI 가 켜져 있으면 리더 · 목사님 맨 위에, 운영자 · 임원진은 없다", () => {
    expect(allMenuFor({ role: "leader", leadsGroup: true }, { ai: true })[0].items[0].href).toBe("/gugu");
    expect(allMenuFor({ role: "pastor", leadsGroup: false }, { ai: true })[0].items[0].href).toBe("/gugu");
    expect(allMenuFor({ role: "admin", leadsGroup: false }, { ai: true }).some((s) => s.items.some((i) => i.href === "/gugu"))).toBe(false);
    expect(allMenuFor({ role: "leader", leadsGroup: true }, { ai: false }).some((s) => s.items.some((i) => i.href === "/gugu"))).toBe(false);
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const q = (sel: string) => container.querySelector(sel);
const qa = (sel: string) => [...container.querySelectorAll(sel)];
const click = async (el: Element | null | undefined) => {
  await act(async () => (el as HTMLElement).click());
};
const type = async (el: Element | null, value: string) => {
  await act(async () => {
    const t = el as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, value);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("보고서 받아쓰기 화면", () => {
  it("붙여 넣고 나눠 보면 사람별로 보이고, 고른 것만 채운다 ★", async () => {
    const { MemoFill } = await import("@/components/ai/memo-fill");
    const action = vi.fn(async () => ({ ok: true as const, prayers: [{ personId: "a", prayer: "시험 잘 보도록" }, { personId: "b", prayer: "이사 잘 하도록" }], note: "카페에서 모임" }));
    const onApply = vi.fn();
    await act(async () =>
      root.render(
        <MemoFill
          persons={[
            { id: "a", name: "김하늘", prayer: "" },
            { id: "b", name: "이서준", prayer: "이미 쓴 것" },
          ]}
          note=""
          action={action}
          onApply={onApply}
        />,
      ),
    );
    await click(q('[data-testid="memo-fill-open"]'));
    await type(q('[data-testid="memo-fill-text"]'), "하늘 시험, 서준 이사, 카페");
    await click(q('[data-testid="memo-fill-split"]'));
    expect(action).toHaveBeenCalledWith(["a", "b"], "하늘 시험, 서준 이사, 카페");
    expect(qa('[data-testid="memo-fill-item"]')).toHaveLength(3);
    expect(container.textContent).toContain("바꿈"); // 이미 쓴 칸
    await click(qa('[data-testid="memo-fill-item"]')[1]); // 이서준 빼기
    expect(q('[data-testid="memo-fill-apply"]')?.textContent).toBe("2개 채우기");
    await click(q('[data-testid="memo-fill-apply"]'));
    expect(onApply).toHaveBeenCalledWith([{ personId: "a", prayer: "시험 잘 보도록" }], "카페에서 모임");
    expect(q('[data-testid="memo-fill"]')).toBeNull();
  });

  it("실패하면 문구를 보이고 메모는 그대로", async () => {
    const { MemoFill } = await import("@/components/ai/memo-fill");
    await act(async () => root.render(<MemoFill persons={[{ id: "a", name: "김하늘", prayer: "" }]} note="" action={async () => ({ ok: false, message: "지금은 AI를 쓸 수 없어요." })} onApply={() => {}} />));
    await click(q('[data-testid="memo-fill-open"]'));
    await type(q('[data-testid="memo-fill-text"]'), "메모");
    await click(q('[data-testid="memo-fill-split"]'));
    expect(q('[role="alert"]')?.textContent).toBe("지금은 AI를 쓸 수 없어요.");
    expect((q('[data-testid="memo-fill-text"]') as HTMLTextAreaElement).value).toBe("메모");
  });
});

describe("보고서 받아쓰기 — AI 없이", () => {
  it("AI 가 없으면 '기도제목 붙여넣기' — 이름으로 시작하는 줄을 그 사람 것으로", async () => {
    const { MemoFill } = await import("@/components/ai/memo-fill");
    const onApply = vi.fn();
    await act(async () => root.render(<MemoFill persons={[{ id: "a", name: "김하늘", prayer: "" }, { id: "b", name: "이나래", prayer: "" }]} note="" action={null} onApply={onApply} />));
    expect(q('[data-testid="memo-fill-open"]')?.textContent).toBe("기도제목 붙여넣기");
    await click(q('[data-testid="memo-fill-open"]'));
    await type(q('[data-testid="memo-fill-text"]'), "김하늘 - 시험\n나래는 이사 준비");
    await click(q('[data-testid="memo-fill-split"]'));
    await click(q('[data-testid="memo-fill-apply"]'));
    expect(onApply).toHaveBeenCalledWith([{ personId: "a", prayer: "시험" }, { personId: "b", prayer: "이사 준비" }], null);
  });

  it("AI 결과에 없는 사람은 이름으로 나눈 것으로 메우고, AI 가 못 해도 나눈 것을 보인다", async () => {
    const { MemoFill } = await import("@/components/ai/memo-fill");
    const persons = [{ id: "a", name: "김하늘", prayer: "" }, { id: "b", name: "이나래", prayer: "" }];
    const onApply = vi.fn();
    await act(async () => root.render(<MemoFill persons={persons} note="" action={async () => ({ ok: true, prayers: [{ personId: "a", prayer: "시험을 잘 보도록" }], note: "" })} onApply={onApply} />));
    await click(q('[data-testid="memo-fill-open"]'));
    await type(q('[data-testid="memo-fill-text"]'), "김하늘 - 시험\n나래는 이사 준비");
    await click(q('[data-testid="memo-fill-split"]'));
    await click(q('[data-testid="memo-fill-apply"]'));
    expect(onApply).toHaveBeenCalledWith([{ personId: "a", prayer: "시험을 잘 보도록" }, { personId: "b", prayer: "이사 준비" }], null);

    const onApply2 = vi.fn();
    await act(async () => root.render(<MemoFill key="2" persons={persons} note="" action={async () => ({ ok: false, message: "채울 수 있는 사람이 없어요." })} onApply={onApply2} />));
    await click(q('[data-testid="memo-fill-open"]'));
    await type(q('[data-testid="memo-fill-text"]'), "나래 - 이사 준비");
    await click(q('[data-testid="memo-fill-split"]'));
    expect(q('[role="alert"]')).toBeNull();
    await click(q('[data-testid="memo-fill-apply"]'));
    expect(onApply2).toHaveBeenCalledWith([{ personId: "b", prayer: "이사 준비" }], null);
  });
});

describe("구구 챗봇 화면", () => {
  it("물어볼 거리를 누르면 묻고, 흘려온 답을 말풍선으로 · 폰에 남는다 ★", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    const send = vi.fn(async (_t: unknown, on: (e: { t: "d" | "s" | "e" | "end"; v?: string }) => void) => {
      on({ t: "s", v: "기록을 찾는 중…" });
      on({ t: "d", v: "두 명 " });
      on({ t: "d", v: "있어요." });
      on({ t: "end" });
    });
    await act(async () => root.render(<GuguChat storageKey="k" suggestions={["챙김이 필요한 양 알려 줘"]} send={send as never} />));
    await click(q('[data-testid="gugu-suggest"]'));
    expect(send.mock.calls[0][0]).toEqual([{ role: "user", text: "챙김이 필요한 양 알려 줘" }]);
    expect(q('[data-testid="gugu-mine"]')?.textContent).toBe("챙김이 필요한 양 알려 줘");
    expect(q('[data-testid="gugu-theirs"]')?.textContent).toBe("두 명 있어요.");
    expect(JSON.parse(localStorage.getItem("k")!)).toHaveLength(2);
    await click(q('[data-testid="gugu-reset"]'));
    expect(q('[data-testid="gugu-mine"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem("k")!)).toEqual([]);
  });

  it("실패 문구는 대화 아래에, 묻던 말은 남는다", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    await act(async () => root.render(<GuguChat storageKey="k2" suggestions={["마감?"]} send={async (_t, on) => on({ t: "e", v: "AI가 바빠요." })} />));
    await click(q('[data-testid="gugu-suggest"]'));
    expect(q('[data-testid="gugu-error"]')?.textContent).toBe("AI가 바빠요.");
    expect(q('[data-testid="gugu-mine"]')?.textContent).toBe("마감?");
  });
});

describe("사람별 흐름 요약 카드", () => {
  it("누르면 만들고, 글을 보인다", async () => {
    const { PersonFlowCard } = await import("@/components/ai/person-flow-card");
    const action = vi.fn(async () => ({ ok: true as const, text: "꾸준히 나왔어요." }));
    await act(async () => root.render(<PersonFlowCard personId="a" action={action} />));
    expect(q('[data-testid="person-flow-text"]')).toBeNull(); // 열기만 하면 만들지 않는다
    await click(q('[data-testid="person-flow-run"]'));
    expect(action).toHaveBeenCalledWith("a");
    expect(q('[data-testid="person-flow-text"]')?.textContent).toBe("꾸준히 나왔어요.");
  });
});

describe("구구 챗봇 — 질문 횟수(리더)", () => {
  const base = { unlimited: false, canAuto: true, hasPending: false, lastStatus: null } as const;

  it("입력 칸 위에 '쓴 횟수/한도', 답을 받아 센 숫자로 바뀐다 ★", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    const send = vi.fn(async (_t: unknown, on: (e: never) => void) => {
      on({ t: "d", v: "네." } as never);
      on({ t: "q", used: 13, quota: 20 } as never);
      on({ t: "end" } as never);
    });
    await act(async () => root.render(<GuguChat storageKey="q1" suggestions={["마감?"]} send={send as never} quota={{ ...base, used: 12, quota: 20 }} />));
    expect(q('[data-testid="gugu-quota"]')?.textContent).toBe("12/20");
    await click(q('[data-testid="gugu-suggest"]'));
    expect(q('[data-testid="gugu-quota"]')?.textContent).toBe("13/20");
  });

  it("목사님(unlimited)은 숫자가 없다", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    await act(async () => root.render(<GuguChat storageKey="q2" suggestions={[]} quota={{ ...base, unlimited: true, used: 0, quota: 0 }} />));
    expect(q('[data-testid="gugu-quota"]')).toBeNull();
    expect(q('[data-testid="gugu-out"]')).toBeNull();
  });

  it("다 쓰면 입력 칸 대신 '이번 달 질문을 다 썼어요' — 첫 신청은 바로 +5 로 입력 칸이 돌아온다 ★", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    const more = vi.fn(async () => ({ ok: true as const, quota: { ...base, canAuto: false, used: 20, quota: 25, lastStatus: "auto" as const } }));
    await act(async () => root.render(<GuguChat storageKey="q3" suggestions={[]} quota={{ ...base, used: 20, quota: 20 }} requestMore={more} />));
    expect(q('[data-testid="gugu-input"]')).toBeNull();
    expect(q('[data-testid="gugu-out"]')?.textContent).toContain("이번 달 질문을 다 썼어요");
    await click(q('[data-testid="gugu-more"]'));
    expect(more).toHaveBeenCalledWith(null);
    expect(q('[data-testid="gugu-input"]')).not.toBeNull();
    expect(q('[data-testid="gugu-quota"]')?.textContent).toBe("20/25");
  });

  it("두 번째부터는 사유(선택)를 받아 신청하고 '신청됨' ★", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    const more = vi.fn(async () => ({ ok: true as const, quota: { ...base, canAuto: false, hasPending: true, used: 25, quota: 25, lastStatus: "pending" as const } }));
    await act(async () => root.render(<GuguChat storageKey="q4" suggestions={[]} quota={{ ...base, canAuto: false, used: 25, quota: 25 }} requestMore={more} />));
    await click(q('[data-testid="gugu-more"]'));
    expect(container.textContent).toContain("목장원 이름이나 기도제목은 적지 말아 주세요");
    await act(async () => {
      const el = q('[data-testid="gugu-more-reason"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "행사 준비");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(q('[data-testid="gugu-more-send"]'));
    expect(more).toHaveBeenCalledWith("행사 준비");
    expect(q('[data-testid="gugu-more-pending"]')?.textContent).toBe("신청됨");
  });

  it("서버가 '다 씀'(x)을 돌려주면 말풍선을 거두고 쓴 글을 입력 칸에 돌려 둔다", async () => {
    const { GuguChat } = await import("@/components/ai/gugu-chat");
    const send = vi.fn(async (_t: unknown, on: (e: never) => void) => on({ t: "x", used: 20, quota: 20 } as never));
    await act(async () => root.render(<GuguChat storageKey="q5" suggestions={["마감?"]} send={send as never} quota={{ ...base, used: 19, quota: 20 }} requestMore={async () => ({ ok: false, message: "x" })} />));
    await click(q('[data-testid="gugu-suggest"]'));
    expect(q('[data-testid="gugu-mine"]')).toBeNull();
    expect(q('[data-testid="gugu-out"]')).not.toBeNull();
  });
});
