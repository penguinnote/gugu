import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notedMessage } from "@/lib/push/messages";

/**
 * 목사님 한마디(2026-11-10)
 *   · 리더 홈 카드 — 한마디가 있으면 그 글이 크게, 없으면 도장 · 확인 문구. 회색 머리 줄은 없다(2026-11-15)
 *   · 알림 문구에는 한마디 글을 싣지 않는다(잠금 화면)
 */
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
const { LeaderHero } = await import("@/app/(tabs)/home/leader-status");

const WEEK = "2026-11-08";
const AT = `${WEEK}T11:00:00.000Z`;
const week = (review: { stamp: "pray" | null; note?: string | null } | null) => ({
  skipped: null,
  report: { id: "r1", submitted_at: AT, is_late: false },
  review: review ? { report_id: "r1", first_read_at: AT, ...review } : null,
  streak: { streak: 2, currentIncluded: true, everOnTime: true, broken: false },
  pushOff: false,
});

describe("리더 홈 — 목사님 확인 · 한마디", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async (review: Parameters<typeof week>[0]) =>
    act(async () => root.render(<LeaderHero weekKey={WEEK} week={week(review) as never} offer={null} serverNow={new Date(AT)} />));
  const box = () => container.querySelector("[data-testid=pastor-review]");

  it("한마디가 있으면 그 글만 크게(💬) — 회색 머리 줄(목사님 · 요일 · 도장)은 없다(2026-11-15)", async () => {
    await render({ stamp: "pray", note: "수고 많았어요!" });
    expect(container.querySelector("[data-testid=pastor-note]")?.textContent).toBe("수고 많았어요!");
    expect(box()?.textContent).toBe("수고 많았어요!");
    expect(box()?.querySelector("img")?.getAttribute("src")).toBe("/icons/tossface/u1F4AC.svg");
  });

  it("한마디가 없으면 도장(🙏) 또는 확인(📖) 문구", async () => {
    await render({ stamp: "pray", note: null });
    expect(container.querySelector("[data-testid=pastor-note]")).toBeNull();
    expect(box()?.textContent).toContain("“기도하겠습니다”");
    await render({ stamp: null });
    expect(box()?.textContent).toBe("목장보고서를 확인하셨어요");
    expect(box()?.querySelector("img")?.getAttribute("src")).toBe("/icons/tossface/u1F4D6.svg");
  });

  it("목사님이 아직 안 읽었으면 칸이 없다", async () => {
    await render(null);
    expect(box()).toBeNull();
  });
});

describe("한마디 알림", () => {
  it("잠금 화면 문구에 한마디 글을 싣지 않는다 · 누르면 홈", () => {
    const m = notedMessage("토브", "2026-11-08");
    expect(m.body).toBe("목사님이 11월 8일 목장보고서에 한마디를 남기셨어요.");
    expect(m.url).toBe("/");
  });
});

describe("리더 홈 — 챙김이 필요한 양 · 출석부 줄(2026-11-15)", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async (extra: Record<string, unknown>) =>
    act(async () => root.render(<LeaderHero weekKey={WEEK} week={{ ...week(null), ...extra } as never} offer={null} serverNow={new Date(AT)} />));
  // 가짜 Link 는 href 만 넘긴다 — 줄은 주소로 찾는다
  const HREF: Record<string, string> = { "home-care": "/groups/care", "home-attendance": "/attendance" };
  const row = (id: string) => container.querySelector<HTMLAnchorElement>(`[data-testid=home-info] a[href="${HREF[id]}"]`);

  it("챙김이 필요한 양 수 → 그 화면, 출석부 줄은 숫자 없이(2026-11-18) ★", async () => {
    await render({ care: 2 });
    expect(row("home-care")?.textContent).toBe("챙김이 필요한 양2명");
    expect(row("home-care")?.getAttribute("href")).toBe("/groups/care");
    expect(row("home-attendance")?.textContent).toBe("출석부");
    expect(container.querySelector('[data-testid=home-info] a[href="/groups"]')).toBeNull();
  });

  it("0명이어도 두 줄은 있다", async () => {
    await render({ care: 0 });
    expect(row("home-care")?.textContent).toBe("챙김이 필요한 양0명");
    expect(row("home-attendance")?.textContent).toBe("출석부");
  });

  it("챙김이 필요한 양 수를 못 읽었으면(null) 그 줄만 없다 — 출석부 줄은 그대로", async () => {
    await render({ care: null });
    expect(row("home-care")).toBeNull();
    expect(row("home-attendance")?.textContent).toBe("출석부");
  });
});
