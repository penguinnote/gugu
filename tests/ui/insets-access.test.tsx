import { act, isValidElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allMenuFor } from "@/lib/all-menu";

/**
 * 화면 진단(/dev/insets, 2026-11-23) — 갤럭시 확인이 끝나 운영자에게만 둔다.
 *   · 전체 메뉴 맨 아래 '화면 진단' 줄은 운영자에게만
 *   · 진단 화면은 운영자가 아니면 404
 */
type Role = "leader" | "admin" | "pastor" | "officer";
let role: Role = "leader";

// 승인 대기 수는 lib/menu-badges(서버 전용 — 넓은 화면 왼쪽 메뉴와 같이 쓴다, 2026-11-27). jsdom 시험이라 모듈째 흉내 낸다
vi.mock("@/lib/menu-badges", () => ({ loadMenuPending: async () => 0 }));
vi.mock("@/lib/ai/digest", () => ({ aiDigestEnabled: () => false }));
vi.mock("@/lib/ai/gugu-ai", () => ({ guguAiEnabled: () => false }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} />
  ),
}));
vi.mock("@/lib/auth/session", () => {
  const me = () => ({ role, leadsGroup: role === "leader", displayName: "김가온" });
  return {
    requireAppUser: vi.fn(async () => me()),
    requireUser: vi.fn(async () => me()),
    requireRole: vi.fn(async (...roles: Role[]) => {
      if (!roles.includes(role)) throw new Error("NEXT_NOT_FOUND");
      return me();
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: async () => ({ count: 0 }) }) }),
    rpc: async () => ({ data: 0 }),
  }),
}));

const { AllMenu } = await import("@/app/(tabs)/all/all-menu");
const AllPage = (await import("@/app/(tabs)/all/page")).default;
const InsetsPage = (await import("@/app/(tabs)/dev/insets/page")).default;

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

async function renderAll(r: Role) {
  role = r;
  const el = (await AllPage()) as ReactElement;
  expect(isValidElement(el)).toBe(true);
  await act(async () => root.render(el));
  return container.querySelector("[data-testid=all-insets]");
}

describe("화면 진단 — 운영자만", () => {
  it("리더 계정의 전체 메뉴에는 '화면 진단' 줄이 없다 ★", async () => {
    expect(await renderAll("leader")).toBeNull();
  });

  it("목사님 · 임원진에게도 없다", async () => {
    expect(await renderAll("pastor")).toBeNull();
    expect(await renderAll("officer")).toBeNull();
  });

  it("운영자 계정에는 '화면 진단' 줄이 있고(임시 글자 없음) /dev/insets 로 간다 ★", async () => {
    const a = await renderAll("admin");
    expect(a?.textContent).toBe("화면 진단");
    expect(a?.getAttribute("href")).toBe("/dev/insets");
  });

  it("AllMenu 기본값은 줄 없음", async () => {
    await act(async () => root.render(<AllMenu name="김가온" sections={allMenuFor({ role: "admin", leadsGroup: false })} />));
    expect(container.querySelector("[data-testid=all-insets]")).toBeNull();
  });

  it("리더가 /dev/insets 로 들어가면 막힌다(404), 운영자는 열린다 ★", async () => {
    role = "leader";
    await expect(InsetsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    role = "admin";
    await expect(InsetsPage()).resolves.toBeTruthy();
  });
});
