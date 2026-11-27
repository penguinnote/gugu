import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { benchHref, benchKeyOf, isTypingTarget, nextUnchecked, stepSubmitted, type BenchGroup } from "@/lib/pastor-review";

/**
 * 넓은 화면 제출 현황(2026-11-27, 목사님 주간 검토 작업대)
 *   · '남기고 다음 목장' · 건너뛰기 — 지금 목장 다음의 미확인 목장(끝이면 처음부터), 없으면 그 자리
 *   · J · K — 제출된 목장 사이 한 칸, 끝에서 멈춘다
 *   · 단축키는 입력칸 안에서 쉬고, ⌘ · Ctrl · Alt 를 함께 누르면 무시. 한글 자판(ㅓ · ㅏ · ㄴ)도 같다
 *   · 고른 목장 · 주는 주소 쿼리(?week · ?g)에 남는다
 *   · 오른쪽 칸 — 남기고 다음 목장은 한마디 저장 → 다음 미확인으로(도장은 찍지 않는다 — 휴대폰도 한마디와 도장이 따로), 미확인이 없으면 머물며 '모두 확인'
 *   · 도장은 '기도하겠습니다' 단추와 S 로만
 */
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));
vi.mock("@/app/(tabs)/pastor/actions", () => ({ setStamp: vi.fn(), setNote: vi.fn() }));

const { ReviewPanel } = await import("@/app/(tabs)/pastor/review-panel");

const G = (name: string, state: BenchGroup["state"]): BenchGroup => ({ name, state });
const GROUPS: BenchGroup[] = [G("가온", "unchecked"), G("나래", "checked"), G("다솜", "unchecked"), G("라온", "missing"), G("마루", "unchecked")];

describe("다음 미확인 목장", () => {
  it("지금 목장 다음의 미확인 — 확인됨 · 미제출은 건너뛴다", () => {
    expect(nextUnchecked(GROUPS, "가온")).toBe("다솜");
    expect(nextUnchecked(GROUPS, "다솜")).toBe("마루");
  });
  it("끝이면 처음부터, 지금 목장은 빼고", () => {
    expect(nextUnchecked(GROUPS, "마루")).toBe("가온");
  });
  it("고른 목장이 없으면 첫 미확인", () => {
    expect(nextUnchecked(GROUPS, null)).toBe("가온");
  });
  it("미확인이 지금 목장뿐이거나 없으면 null(그 자리에 머문다)", () => {
    expect(nextUnchecked([G("가온", "unchecked"), G("나래", "checked")], "가온")).toBeNull();
    expect(nextUnchecked([G("가온", "checked"), G("나래", "missing")], "가온")).toBeNull();
  });
});

describe("J · K — 제출된 목장 사이", () => {
  it("미제출은 건너뛰고 한 칸씩, 끝에서 멈춘다", () => {
    expect(stepSubmitted(GROUPS, "다솜", 1)).toBe("마루");
    expect(stepSubmitted(GROUPS, "마루", 1)).toBeNull();
    expect(stepSubmitted(GROUPS, "가온", -1)).toBeNull();
    expect(stepSubmitted(GROUPS, "나래", -1)).toBe("가온");
  });
  it("고른 목장이 없으면 J 는 첫 제출 목장, 미제출을 골랐으면 가장 가까운 제출 목장", () => {
    expect(stepSubmitted(GROUPS, null, 1)).toBe("가온");
    expect(stepSubmitted(GROUPS, "라온", 1)).toBe("마루");
    expect(stepSubmitted(GROUPS, "라온", -1)).toBe("다솜");
  });
});

describe("단축키", () => {
  const body = document.createElement("div");
  const input = document.createElement("input");
  const area = document.createElement("textarea");
  const select = document.createElement("select");
  it("J 다음 · K 이전 · S 도장 — 한글 자판도 같은 자리", () => {
    expect(benchKeyOf({ key: "j", target: body })).toBe("next");
    expect(benchKeyOf({ key: "K", target: body })).toBe("prev");
    expect(benchKeyOf({ key: "s", target: body })).toBe("stamp");
    expect(benchKeyOf({ key: "ㅓ", target: body })).toBe("next");
    expect(benchKeyOf({ key: "ㅏ", target: body })).toBe("prev");
    expect(benchKeyOf({ key: "ㄴ", target: body })).toBe("stamp");
    expect(benchKeyOf({ key: "x", target: body })).toBeNull();
  });
  it("입력칸(글 칸 · 고르는 칸 · 고칠 수 있는 글) 안에서는 쉰다", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    for (const t of [input, area, select, editable]) {
      expect(isTypingTarget(t)).toBe(true);
      expect(benchKeyOf({ key: "j", target: t })).toBeNull();
      expect(benchKeyOf({ key: "s", target: t })).toBeNull();
    }
    expect(isTypingTarget(body)).toBe(false);
  });
  it("⌘ · Ctrl · Alt 를 함께 누르면 무시(복사 · 저장 같은 브라우저 단축키)", () => {
    expect(benchKeyOf({ key: "s", metaKey: true, target: body })).toBeNull();
    expect(benchKeyOf({ key: "j", ctrlKey: true, target: body })).toBeNull();
    expect(benchKeyOf({ key: "k", altKey: true, target: body })).toBeNull();
  });
});

describe("주소 쿼리로 선택 유지", () => {
  it("이번 주면 주를 빼고, 고른 목장은 ?g=", () => {
    expect(benchHref("/pastor", "2026-11-22", "2026-11-22", "가온")).toBe(`/pastor?g=${encodeURIComponent("가온")}`);
    expect(benchHref("/pastor", "2026-11-15", "2026-11-22", "나래")).toBe(`/pastor?week=2026-11-15&g=${encodeURIComponent("나래")}`);
    expect(benchHref("/pastor", "2026-11-22", "2026-11-22", null)).toBe("/pastor");
  });
  it("주소에 이미 쿼리가 있으면 & 로 잇는다", () => {
    expect(benchHref("/dev/design?screen=pastor-wide", "2026-11-22", "2026-11-22", "가온")).toBe(`/dev/design?screen=pastor-wide&g=${encodeURIComponent("가온")}`);
  });
  it("주소에서 다시 읽으면 같은 목장 · 같은 주", () => {
    const u = new URL(benchHref("/pastor", "2026-11-15", "2026-11-22", "초록 마을"), "http://x");
    expect(u.searchParams.get("g")).toBe("초록 마을");
    expect(u.searchParams.get("week")).toBe("2026-11-15");
  });
});

describe("오른쪽 칸 — 도장과 한마디", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    replace.mockClear();
    refresh.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const actions = () => ({
    stamp: vi.fn(async (_id: string, stamp: "pray") => ({ ok: true as const, stamp })),
    note: vi.fn(async (_id: string, note: string) => ({ ok: true as const, note: note.trim() || null })),
  });
  const typeNote = async (text: string) => {
    const area = container.querySelector<HTMLTextAreaElement>("[data-testid=review-note]")!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(area, text);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const click = async (id: string) => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)!.click();
    });
  };

  it("남기고 다음 목장 — 한마디만 저장하고 다음 미확인으로, 도장은 찍지 않는다(휴대폰과 같다)", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp={null} initialNote={null} next="/pastor?g=b" prev={null} unchecked="/pastor?g=c" actions={a} />));
    await typeNote("수고했어요");
    await click("review-leave");
    expect(a.note).toHaveBeenCalledWith("r1", "수고했어요");
    expect(a.stamp).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/pastor?g=c", { scroll: false });
  });

  it("이미 도장이 있고 한마디도 그대로면 저장 없이 넘어간다(도장은 그대로)", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp="pray" initialNote="좋아요" next={null} prev={null} unchecked="/pastor?g=c" actions={a} />));
    await click("review-leave");
    expect(a.note).not.toHaveBeenCalled();
    expect(a.stamp).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/pastor?g=c", { scroll: false });
  });

  it("미확인 목장이 더 없으면 그 자리에 머물고 '모두 확인했어요'", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp={null} initialNote={null} next={null} prev={null} unchecked={null} actions={a} />));
    await click("review-leave");
    expect(a.stamp).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=review-all-done]")?.textContent).toContain("모두 확인");
  });

  it("도장 단추는 찍고 끄기만 — 그 자리에 머문다", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp={null} initialNote={null} next={null} prev={null} unchecked="/pastor?g=c" actions={a} />));
    await click("review-stamp");
    expect(a.stamp).toHaveBeenCalledWith("r1", "pray");
    expect(container.querySelector("[data-testid=review-stamp]")?.getAttribute("aria-pressed")).toBe("true");
    expect(replace).not.toHaveBeenCalled();
  });

  it("건너뛰기는 저장하지 않고 다음 미확인으로", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp={null} initialNote={null} next={null} prev={null} unchecked="/pastor?g=c" actions={a} />));
    await typeNote("쓰다 만 글");
    await click("review-skip");
    expect(a.note).not.toHaveBeenCalled();
    expect(a.stamp).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/pastor?g=c", { scroll: false });
  });

  it("한마디가 200자를 넘으면 저장하지 않고 알린다", async () => {
    const a = actions();
    await act(async () => root.render(<ReviewPanel reportId="r1" initialStamp={null} initialNote={null} next={null} prev={null} unchecked="/pastor?g=c" actions={a} />));
    await typeNote("가".repeat(205));
    await click("review-leave");
    expect(a.note).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("200자");
  });
});
