import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 하단 탭바 — 1단계 골격.
 *   · /login 에서는 그려지지 않고, / 에서는 4개 링크가 그려진다
 *   · 링크 href 는 / · /groups · /shop · /info
 *   · 현재 탭에 aria-current="page"
 */

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { TabBar } = await import("@/components/tab-bar");
const { setFromAll } = await import("@/lib/tab-origin");

let container: HTMLDivElement;
let root: Root;

async function render(path: string) {
  pathname = path;
  await act(async () => {
    root.render(<TabBar />);
  });
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  setFromAll(false);
  await act(async () => root.unmount());
  container.remove();
});

describe("하단 탭바", () => {
  it("/login 에서는 그려지지 않는다", async () => {
    await render("/login");
    expect(container.querySelector("nav")).toBeNull();
    await render("/apply");
    expect(container.querySelector("nav")).toBeNull();
  });

  it("/ 에서 4개 링크가 순서대로 그려진다 — 홈 / 목장 / 기록 / 전체(2026-11-10 상점 · 정보 대신)", async () => {
    await render("/");
    const links = [...container.querySelectorAll("nav a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/groups", "/records", "/all"]);
    expect(links.map((a) => a.textContent?.trim())).toEqual(["홈", "목장", "기록", "전체"]);
  });

  it("목장이 없는 역할(목사님 · 운영자 · 임원진)은 목장 탭 없이 세 칸, 명단 화면은 아무 탭도 칠하지 않는다", async () => {
    pathname = "/groups/roster";
    await act(async () => {
      root.render(<TabBar groups={false} />);
    });
    const links = [...container.querySelectorAll("nav a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/records", "/all"]);
    expect(links.find((a) => a.getAttribute("aria-current") === "page")).toBeUndefined();
  });

  it("현재 탭만 aria-current 다 — /reports·/pastor 는 홈, 전체는 '전체' 화면만(상점 · 내 정보 · 승인 · 운영은 아무 탭도 아님, 2026-11-12)", async () => {
    const current = () => [...container.querySelectorAll("nav a")].find((a) => a.getAttribute("aria-current") === "page")?.textContent?.trim();
    await render("/");
    expect(current()).toBe("홈");
    await render("/reports?week=2026-09-27");
    expect(current()).toBe("홈");
    await render("/pastor/reports/새싹");
    expect(current()).toBe("홈");
    await render("/groups");
    expect(current()).toBe("목장");
    await render("/shop");
    expect(current()).toBeUndefined();
    await render("/all");
    expect(current()).toBe("전체");
    await render("/records");
    expect(current()).toBe("기록");
    await render("/me");
    expect(current()).toBeUndefined();
    await render("/approvals");
    expect(current()).toBeUndefined();
    await render("/admin/people");
    expect(current()).toBeUndefined();
  });

  it("'전체' 에서 들어간 화면은 아무 탭도 칠하지 않고, 탭 첫 화면에 닿으면 원래대로 ★", async () => {
    const current = () => [...container.querySelectorAll("nav a")].find((a) => a.getAttribute("aria-current") === "page")?.textContent?.trim();
    await render("/groups/roster");
    expect(current()).toBe("목장"); // 목장 탭에서 들어간 것과 구분이 없으면 목장
    await act(async () => setFromAll(true));
    expect(current()).toBeUndefined();
    await render("/groups/people/p1");
    expect(current()).toBeUndefined(); // 그 안쪽도
    await render("/all");
    expect(current()).toBe("전체"); // 전체로 돌아오면 표시가 지워진다
    await render("/groups/roster");
    expect(current()).toBe("목장");
  });

  it("탭을 누르면 표시가 지워진다", async () => {
    await render("/groups/roster");
    await act(async () => setFromAll(true));
    expect([...container.querySelectorAll("nav a")].some((a) => a.getAttribute("aria-current"))).toBe(false);
    const groups = [...container.querySelectorAll("nav a")].find((a) => a.textContent?.trim() === "목장") as HTMLAnchorElement;
    await act(async () => groups.click());
    expect([...container.querySelectorAll("nav a")].find((a) => a.getAttribute("aria-current") === "page")?.textContent?.trim()).toBe("목장");
  });
});
