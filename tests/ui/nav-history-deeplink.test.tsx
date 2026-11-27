// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

/** 처음 연 곳이 홈이 아닐 때(알림 · 링크) — 밑에 홈 칸을 깔아, 뒤로 하면 앱 밖이 아니라 홈으로 간다 */
it("알림으로 보고서를 바로 열어도 뒤로 = 홈", async () => {
  vi.useFakeTimers(); // 정해진 시간(30ms) 대신 걸린 타이머를 끝까지 돌린다 — 기계가 바빠도 흔들리지 않게(2026-11-10)
  history.replaceState({ __NA: true }, "", "/reports/2026-10-11");
  const nav = await import("@/lib/nav-history");
  nav.installNav({ push: () => {}, replace: () => {}, refresh: () => {} });
  expect(location.pathname).toBe("/reports/2026-10-11");
  expect((history.state as { gg: { d: number } }).gg.d).toBe(1);
  history.back();
  await vi.runAllTimersAsync();
  expect(location.pathname).toBe("/");
  vi.useRealTimers();
});
