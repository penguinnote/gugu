import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShownDigest } from "@/lib/ai/digest";

/**
 * AI 정리 칸 허점 고치기(2026-11-08) — 이름은 모두 지어낸 것.
 *   위에 아직 안 연 보고서 수 · 기준 한 줄 · 항목마다 근거 보고서 링크(함께 기도할 제목도) · 아래 안내 한 줄
 *   새로 들어온 보고서가 있으면 다시 만들기(남은 횟수가 있을 때만) — 새 정리면 바꿔 그리고, 실패면 앞의 것 그대로 + 알림
 *   도움 됨 / 아님(다시 누르면 지움) · 틀린 내용(켜고 끔) — 저장 실패면 되돌린다
 * 운영 카드 — 상태 · 까닭 · 수만
 */

const makeDigest = vi.fn();
const regenDigest = vi.fn();
const digestFeedback = vi.fn();
vi.mock("@/app/(tabs)/pastor/digest-actions", () => ({ makeDigest, regenDigest, digestFeedback }));

const { AiDigestSection } = await import("@/components/ai-digest");

const WEEK = "2026-11-01";
const src = (name: string) => ({ href: `/pastor/reports/${encodeURIComponent(name)}?week=${WEEK}`, label: `${name} 목장` });
const digest = (over: Partial<ShownDigest> = {}): ShownDigest => ({
  weekKey: WEEK,
  highlights: [{ key: "h:0", text: "김하늘이 취업 면접을 앞두고 있다", source: src("가온") }],
  thanks: [{ key: "t:0", text: "이바다의 어머니 수술이 잘 끝났다", source: src("나래") }],
  groups: [{ key: "g:00000000-0000-4000-8000-0000000000a1", text: "면접 준비 소식이 있다", source: src("가온") }],
  intercession: [{ key: "i:0", text: "김하늘 — 면접 가운데 평안하도록", source: src("가온") }],
  empty: false,
  feedback: {},
  basis: "12개 목장 중 9개 기준 · 수요일 08:12",
  generatedAt: "2026-11-04T23:12:00.000Z",
  regenLeft: 3,
  lastFail: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  makeDigest.mockReset();
  regenDigest.mockReset();
  digestFeedback.mockReset().mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const buttonIn = (el: Element, label: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === label)!;
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("읽음 지키기 · 기준 · 안내", () => {
  it("아직 열지 않은 보고서 수를 AI 칸 위에 — 0이면 없다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={3} fresh={0} />);
    const line = q("ai-unread")!;
    expect(line.textContent).toContain("아직 열지 않은 목장보고서 3개");
    expect(line.compareDocumentPosition(q("ai-digest")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    expect(q("ai-unread")).toBeNull();
  });

  it("기다리는 동안에도 아직 열지 않은 보고서 수는 보인다", async () => {
    makeDigest.mockReturnValue(new Promise(() => {}));
    await render(<AiDigestSection weekKey={WEEK} initial={null} canMake unread={2} fresh={0} />);
    await click(buttonIn(q("ai-digest-make")!, "AI 정리 만들기"));
    expect(q("ai-digest-wait")).not.toBeNull();
    expect(q("ai-unread")!.textContent).toContain("2개");
  });

  it("기준 한 줄 · 아래 안내 한 줄", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    expect(q("ai-digest")!.textContent).toContain("12개 목장 중 9개 기준 · 수요일 08:12");
    expect(q("ai-disclaimer")!.textContent).toBe("AI가 만든 정리라 틀리거나 빠진 것이 있을 수 있어요. 원본 목장보고서를 확인해 주세요.");
  });

  it("모든 항목에 근거 보고서 링크 — 함께 기도할 제목도, 미리 읽지 않는다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    for (const id of ["ai-highlights", "ai-thanks", "ai-groups", "ai-intercession"]) {
      const links = [...q(id)!.querySelectorAll<HTMLAnchorElement>('a[data-testid="ai-source"]')];
      expect(links.length, id).toBe(1);
      expect(links[0].getAttribute("href")).toMatch(/^\/pastor\/reports\/.+\?week=2026-11-01$/);
    }
  });
});

describe("요청할 때만 만들기 (2026-11-08)", () => {
  it("열기만 해서는 만들지 않는다 — 단추만 보인다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={null} canMake unread={0} fresh={0} />);
    expect(makeDigest).not.toHaveBeenCalled();
    expect(q("ai-digest-make")).not.toBeNull();
    expect(q("ai-digest")).toBeNull();
  });

  it("만들 수 없으면(정리 없음 · 보고서 없음) 칸이 없다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={null} canMake={false} unread={0} fresh={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("누르면 만들고 정리를 그린다", async () => {
    makeDigest.mockResolvedValue(digest());
    await render(<AiDigestSection weekKey={WEEK} initial={null} canMake unread={0} fresh={0} />);
    await click(buttonIn(q("ai-digest-make")!, "AI 정리 만들기"));
    expect(makeDigest).toHaveBeenCalledWith(WEEK);
    expect(q("ai-highlights")!.textContent).toContain("김하늘이 취업 면접을 앞두고 있다");
    expect(q("ai-digest-make")).toBeNull();
  });

  it("실패하면 알리고 단추를 그대로 둔다", async () => {
    makeDigest.mockResolvedValue(null);
    await render(<AiDigestSection weekKey={WEEK} initial={null} canMake unread={0} fresh={0} />);
    await click(buttonIn(q("ai-digest-make")!, "AI 정리 만들기"));
    expect(q("ai-make-failed")!.textContent).toContain("만들지 못했어요");
    expect(buttonIn(q("ai-digest-make")!, "AI 정리 만들기")).toBeTruthy();
  });

  it("보낼 글이 없던 주는 그렇다고 쓰고, 새 보고서가 오면 다시 만들 수 있다", async () => {
    await render(
      <AiDigestSection weekKey={WEEK} initial={digest({ highlights: [], thanks: [], groups: [], intercession: [], empty: true })} canMake={false} unread={0} fresh={1} />,
    );
    expect(q("ai-empty")!.textContent).toBe("정리할 글이 없어요");
    expect(buttonIn(q("ai-fresh")!, "다시 만들기")).toBeTruthy();
  });
});

describe("다시 만들기", () => {
  it("새로 들어온 보고서가 없으면 줄이 없다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    expect(q("ai-fresh")).toBeNull();
  });

  it("남은 횟수가 없으면 수만 보이고 단추는 없다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest({ regenLeft: 0 })} canMake={false} unread={0} fresh={2} />);
    expect(q("ai-fresh")!.textContent).toBe("새로 들어온 목장보고서 2개");
    expect(q("ai-fresh")!.querySelector("button")).toBeNull();
  });

  it("누르면 새 정리로 바꾸고 줄이 사라진다", async () => {
    regenDigest.mockResolvedValue(
      digest({ highlights: [{ key: "h:0", text: "새로 만든 항목", source: src("다온") }], generatedAt: "2026-11-05T01:00:00.000Z", basis: "12개 목장 중 12개 기준 · 목요일 10:00", regenLeft: 2 }),
    );
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={3} />);
    expect(q("ai-fresh")!.textContent).toContain("새로 들어온 목장보고서 3개");
    await click(buttonIn(q("ai-fresh")!, "다시 만들기"));
    expect(regenDigest).toHaveBeenCalledWith(WEEK);
    expect(q("ai-highlights")!.textContent).toContain("새로 만든 항목");
    expect(q("ai-digest")!.textContent).toContain("12개 목장 중 12개 기준");
    expect(q("ai-fresh")).toBeNull();
    expect(q("ai-regen-failed")).toBeNull();
  });

  it("실패하면 앞의 정리 그대로 · 알림", async () => {
    regenDigest.mockResolvedValue(digest({ lastFail: "refusal", regenLeft: 2 }));
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={1} />);
    await click(buttonIn(q("ai-fresh")!, "다시 만들기"));
    expect(q("ai-regen-failed")!.textContent).toBe("다시 만들지 못했어요");
    expect(q("ai-highlights")!.textContent).toContain("김하늘이 취업 면접을 앞두고 있다");
    expect(q("ai-fresh")).not.toBeNull();
  });
});

describe("도움 됨 · 아님 · 틀린 내용", () => {
  it("틀린 내용은 켜고 끈다", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    const wrong = buttonIn(q("ai-highlights")!, "틀린 내용");
    await click(wrong);
    expect(digestFeedback).toHaveBeenLastCalledWith(WEEK, "h:0", { wrong: true });
    expect(wrong.getAttribute("aria-pressed")).toBe("true");
    await click(wrong);
    expect(digestFeedback).toHaveBeenLastCalledWith(WEEK, "h:0", { wrong: false });
    expect(wrong.getAttribute("aria-pressed")).toBe("false");
  });

  it("도움 됨을 다시 누르면 지운다 · 틀린 내용과 따로", async () => {
    await render(<AiDigestSection weekKey={WEEK} initial={digest({ feedback: { "t:0": { helpful: null, wrong: true } } })} canMake={false} unread={0} fresh={0} />);
    const box = q("ai-thanks")!;
    expect(buttonIn(box, "틀린 내용").getAttribute("aria-pressed")).toBe("true");
    await click(buttonIn(box, "도움 됨"));
    expect(digestFeedback).toHaveBeenLastCalledWith(WEEK, "t:0", { helpful: true });
    await click(buttonIn(box, "도움 됨"));
    expect(digestFeedback).toHaveBeenLastCalledWith(WEEK, "t:0", { helpful: null });
    expect(buttonIn(box, "도움 됨").getAttribute("aria-pressed")).toBe("false");
    expect(buttonIn(box, "틀린 내용").getAttribute("aria-pressed")).toBe("true");
  });

  it("저장이 실패하면 되돌린다", async () => {
    digestFeedback.mockResolvedValue({ ok: false });
    await render(<AiDigestSection weekKey={WEEK} initial={digest()} canMake={false} unread={0} fresh={0} />);
    const wrong = buttonIn(q("ai-intercession")!, "틀린 내용");
    await click(wrong);
    expect(wrong.getAttribute("aria-pressed")).toBe("false");
  });
});

