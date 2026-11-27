import { expect, it, vi } from "vitest";

/** 갤럭시 · 홈에서 뒤로 — 한 번은 그대로('한 번 더 누르면 앱이 닫혀요'), 2초 안에 또 누르면 앱 밖으로(덫을 다시 덮지 않는다) */
it("갤럭시: 한 번은 막고, 두 번이면 보내 준다", async () => {
  // 시계는 가짜 — vi.waitFor 가 확인할 때마다 가짜 시계를 밀어 준다. '2초 안에 두 번' 이 기계 속도에 따라 흔들리지 않는다(2026-11-10)
  vi.useFakeTimers();
  Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36", configurable: true });
  document.body.setAttribute("data-home-ready", "");
  history.replaceState({ __NA: true }, "", "/");
  const nav = await import("@/lib/nav-history");
  nav.installNav({ push: () => {}, replace: () => {}, refresh: () => {} });
  // 정해진 시간만큼 기다리지 않고 기대한 상태가 될 때까지 기다린다 — 여러 시험이 함께 돌아 느려져도 흔들리지 않게
  const gg = () => (history.state as { gg: { d: number; trap?: boolean } }).gg;
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true }));
  history.back(); // 첫 번째
  await vi.waitFor(() => expect(document.body.textContent).toContain("한 번 더 누르면 앱이 닫혀요"));
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true })); // 다시 덮였다 — 그대로
  history.back(); // 2초 안에 두 번째
  await vi.waitFor(() => expect(gg().d).toBe(-1)); // 덮지 않고 아래 칸에서 한 번 더 뒤로(앱 밖) — 시험 환경에선 더 갈 곳이 없어 아래 칸에 머문다
  vi.useRealTimers();
});
