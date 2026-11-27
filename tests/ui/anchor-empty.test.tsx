import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 전체 메뉴 → /pastor#prayers 처럼 칸으로 바로 왔는데 그 칸이 비었을 때(2026-11-13)
 *   · 주소의 # 가 그 칸일 때만 빈 카드가 보인다 — 평소 홈에는 없다
 *   · 지난주 같은 칸으로 가는 단추
 */
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
const { AnchorEmpty } = await import("@/components/anchor-empty");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  host.id = "prayers";
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});

const draw = () =>
  act(() =>
    root.render(<AnchorEmpty anchor="prayers" icon="/i.svg" title="기도제목" line="이번 주는 아직 모인 기도제목이 없어요." prevHref="/pastor?week=2026-11-01#prayers" />),
  );

describe("AnchorEmpty", () => {
  it("주소에 #prayers 가 없으면 아무것도 그리지 않는다", () => {
    window.history.replaceState(null, "", "/pastor");
    draw();
    expect(host.querySelector('[data-testid="anchor-empty-prayers"]')).toBeNull();
  });

  it("#prayers 로 왔으면 빈 카드와 지난주 단추", () => {
    window.history.replaceState(null, "", "/pastor#prayers");
    draw();
    const card = host.querySelector('[data-testid="anchor-empty-prayers"]');
    expect(card?.textContent).toContain("이번 주는 아직 모인 기도제목이 없어요.");
    expect(card?.querySelector("a")?.getAttribute("href")).toBe("/pastor?week=2026-11-01#prayers");
  });

  it("다른 칸(#care)으로 왔으면 보이지 않는다", () => {
    window.history.replaceState(null, "", "/pastor#care");
    draw();
    expect(host.querySelector('[data-testid="anchor-empty-prayers"]')).toBeNull();
  });
});
