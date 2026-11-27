import { afterAll, beforeAll, expect, it, vi } from "vitest";

// 정해진 시간 대신 가짜 시계로 걸린 타이머(기록 이동 · popstate · 덫 덮기)를 끝까지 돌린다 — 기계가 바빠도 흔들리지 않게(2026-11-10)
const idle = () => vi.runAllTimersAsync();
beforeAll(() => {
  vi.useFakeTimers();
});
afterAll(() => {
  vi.useRealTimers();
});

/** 아이폰 · 홈에서 처음 연 앱 — 홈 뒤에 아무 기록도 두지 않는다. 밀어도 갈 곳이 없어 아예 반응하지 않는다 */
it("아이폰: 처음 연 홈에는 덫 칸이 없다", async () => {
  Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15", configurable: true });
  document.body.setAttribute("data-home-ready", "");
  history.replaceState({ __NA: true }, "", "/");
  const before = history.length;
  const nav = await import("@/lib/nav-history");
  const router = {
    push: (h: string) => { history.pushState({ __NA: true }, "", h); nav.settle(); },
    replace: (h: string) => { history.replaceState({ __NA: true }, "", h); nav.settle(); },
    refresh: () => {},
  };
  nav.installNav(router);
  await idle();
  expect(before).toBe(1);
  expect(history.length).toBe(1); // 기록이 늘지 않았다
  expect((history.state as { gg: { d: number; trap: boolean } }).gg).toMatchObject({ d: 0, trap: true });
});

it("아이폰: 목장에 갔다가 뒤로 돌아오면 다시 밀어 목장으로 갈 수 없다", async () => {
  const nav = await import("@/lib/nav-history");
  nav.goTab("/groups");
  expect(location.pathname).toBe("/groups");
  history.back();
  await idle();
  expect(location.pathname).toBe("/");
  history.forward();
  await idle();
  expect(location.pathname).toBe("/");
});
