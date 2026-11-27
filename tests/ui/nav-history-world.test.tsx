import { expect, it, vi } from "vitest";

/**
 * 월드는 기록 맨 아래 칸(2026-11-10) — 뒤로 · 밀기로 홈에 가지 않고 '홈으로' 로만 나간다.
 *   들어가기   홈 위에서 월드 링크 → 맨 아래 칸까지 되돌아가 그 칸을 월드로, 다 뜨면 같은 주소 덫
 *   갤럭시 뒤로 '한 번 더 누르면 앱이 닫혀요' — 2초 동안 덫을 덮지 않는다(그 사이 또 누르면 맨 아래에서 뒤로 = 앱 닫힘), 그 뒤 다시 덮는다
 *   나가기     맨 아래 칸을 홈으로 되돌리고 홈 덫을 덮는다
 */
it("갤럭시: 월드에서 뒤로는 홈으로 가지 않고, 홈으로 단추로만 나간다", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36", configurable: true });
  document.body.setAttribute("data-home-ready", "");
  history.replaceState({ __NA: true }, "", "/");
  const nav = await import("@/lib/nav-history");
  // Next 라우터 흉내 — 주소만 바꾸고(감싼 history 를 거친다) 화면이 바뀌면 NavKeeper 처럼 settle 을 부른다
  const router = {
    push: (h: string) => { history.pushState({ __NA: true }, "", h); nav.settle(); },
    replace: (h: string) => { history.replaceState({ __NA: true }, "", h); nav.settle(); },
    refresh: () => {},
  };
  nav.installNav(router);
  const gg = () => (history.state as { gg: { d: number; trap?: boolean; world?: boolean } }).gg;
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true }));
  const before = history.length;

  // 홈 '들어가기' — 링크를 누르면 맨 아래 칸이 월드가 된다
  const a = document.createElement("a");
  a.href = "/world";
  document.body.appendChild(a);
  a.click();
  await vi.waitFor(() => expect(location.pathname).toBe("/world"));
  expect(gg()).toMatchObject({ d: -1, world: true });
  document.body.setAttribute("data-world-ready", "");
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true, world: true }));
  expect(history.length).toBe(before); // 쌓이지 않았다 — 바닥(월드) · 덫 두 칸 그대로

  // 뒤로 — 월드 그대로, 안내, 2초 동안은 덫 없음(또 누르면 앱이 닫힌다)
  history.back();
  await vi.waitFor(() => expect(document.body.textContent).toContain("한 번 더 누르면 앱이 닫혀요"));
  expect(location.pathname).toBe("/world");
  expect(gg()).toMatchObject({ d: -1, world: true });
  vi.advanceTimersByTime(1500);
  expect(gg().trap).toBeFalsy();
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true, world: true })); // 2초 뒤 다시 덮였다

  // 홈으로 — 맨 아래 칸이 다시 홈, 홈 덫
  nav.leaveWorld(null, router);
  await vi.waitFor(() => expect(location.pathname).toBe("/"));
  await vi.waitFor(() => expect(gg()).toMatchObject({ d: 0, trap: true }));
  expect(gg().world).toBeFalsy();
  vi.useRealTimers();
});
