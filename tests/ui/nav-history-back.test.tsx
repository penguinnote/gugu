import { expect, it, vi } from "vitest";

/** 안쪽 화면 머리의 ‹(2026-11-11) — 들어온 곳이 있으면 뒤로, 바로 열었으면 fallback 으로 갈아 끼운다 */
it("‹ — 들어온 곳으로, 없으면 fallback", async () => {
  vi.useFakeTimers();
  document.body.setAttribute("data-home-ready", "");
  history.replaceState({ __NA: true }, "", "/");
  const nav = await import("@/lib/nav-history");
  const replace = vi.fn((h: string) => { history.replaceState({ __NA: true }, "", h); nav.settle(); });
  const router = { push: (h: string) => { history.pushState({ __NA: true }, "", h); nav.settle(); }, replace, refresh: () => {} };
  nav.installNav(router);
  await vi.waitFor(() => expect((history.state as { gg: { trap?: boolean } }).gg.trap).toBe(true));

  router.push("/all");
  router.push("/groups/roster");
  nav.goBack("/all", router);
  await vi.waitFor(() => expect(location.pathname).toBe("/all")); // 들어온 곳(전체)으로 뒤로
  expect(replace).not.toHaveBeenCalled();
  vi.useRealTimers();
});
