// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 뒤로가기 구조(lib/nav-history.ts, 2026-10-15)
 *   · 홈은 바닥 — 뒤로 해도 홈 그대로(같은 주소의 덫 칸을 다시 덮는다)
 *   · 탭 첫 화면은 늘 홈 바로 위 — 탭끼리 옮겨도 기록이 쌓이지 않고, 뒤로 = 홈
 *   · 안쪽 화면은 뒤로 = 들어온 곳, '‹ 돌아가기' 는 들어온 곳이면 뒤로
 * Next 라우터 대신 같은 일을 하는 가짜(push = pushState, replace = replaceState)로 시험한다 — NavKeeper 가 화면이 바뀔 때 settle() 을 부르듯 여기서도 부른다.
 *
 * 시계는 가짜다(2026-11-10). 뒤로 한 번이 jsdom 의 기록 이동(setTimeout) → popstate → 층 맞추기(setTimeout) → 덫 덮기
 * (requestAnimationFrame 두세 번)로 이어지는데, 정해진 시간(120ms)만 기다리면 기계가 바쁠 때(pre-push) 사슬이 덜 끝나
 * 가끔 실패했다. 가짜 시계로 걸린 타이머를 끝까지 돌리면(idle) 사슬이 다 끝난 뒤에 확인한다 — '아무 일도 없어야 한다' 도 확실해진다.
 */
const idle = () => vi.runAllTimersAsync();
type Nav = typeof import("@/lib/nav-history");
let nav: Nav;
const router = {
  push: (h: string) => { history.pushState({ __NA: true }, "", h); nav.settle(); },
  replace: (h: string) => { history.replaceState({ __NA: true }, "", h); nav.settle(); },
  refresh: () => {},
};
const where = () => location.pathname + location.search;
const gg = () => (history.state as { gg?: { d: number; trap?: boolean } } | null)?.gg;

beforeAll(async () => {
  vi.useFakeTimers();
  document.body.setAttribute("data-home-ready", ""); // 홈이 다 그려졌다는 표시 — 덫 칸은 이때 덮는다
  history.replaceState({ __NA: true }, "", "/");
  nav = await import("@/lib/nav-history");
  nav.installNav(router);
  await idle();
});

afterAll(() => {
  vi.useRealTimers();
});

describe("뒤로가기 구조", () => {
  it("홈은 덫 칸 위에 선다 — 뒤로 해도 홈", async () => {
    expect(where()).toBe("/");
    expect(gg()).toMatchObject({ d: 0, trap: true });
    history.back();
    await idle();
    expect(where()).toBe("/");
    expect(gg()).toMatchObject({ d: 0, trap: true }); // 아래 칸에 닿자마자 다시 덮었다
  });

  it("탭끼리 옮겨도 쌓이지 않고, 탭 첫 화면에서 뒤로 = 홈", async () => {
    nav.goTab("/groups");
    expect(where()).toBe("/groups");
    expect(nav.navDepth()).toBe(1);
    const len = history.length;
    nav.goTab("/shop");
    nav.goTab("/records");
    expect(where()).toBe("/records");
    expect(history.length).toBe(len); // 갈아 끼웠다
    history.back();
    await idle();
    expect(where()).toBe("/");
    expect(gg()?.trap).toBe(true);
  });

  it("안쪽 화면에서 다른 탭을 누르면 홈 바로 위로 정리한 뒤 갈아 끼운다", async () => {
    nav.goTab("/records");
    router.push("/admin");
    router.push("/admin/people");
    expect(nav.navDepth()).toBe(3);
    nav.goTab("/shop");
    await idle();
    expect(where()).toBe("/shop");
    expect(nav.navDepth()).toBe(1);
    history.back();
    await idle();
    expect(where()).toBe("/"); // 운영 · 명단으로 돌아가지 않는다
  });

  it("'‹ 돌아가기' — 들어온 곳이면 뒤로, 홈 탭을 누르면 바닥까지", async () => {
    nav.goTab("/groups");
    router.push("/groups/roster");
    expect(nav.backIfCameFrom("/groups")).toBe(true);
    await idle();
    expect(where()).toBe("/groups");
    expect(nav.backIfCameFrom("/admin")).toBe(false); // 들어온 곳이 아니다 — 링크가 갈아 끼운다
    router.push("/groups/roster");
    router.push("/groups/people/x");
    nav.goTab("/");
    await idle();
    expect(where()).toBe("/");
    expect(gg()?.trap).toBe(true);
  });

  it("앞으로 가기는 막힌다 — 홈으로 돌아오면 앞 기록이 지워지고, 다른 화면에선 넘어가도 곧바로 되돌린다", async () => {
    nav.goTab("/groups");
    expect(where()).toBe("/groups");
    history.back();
    await idle();
    expect(where()).toBe("/");
    history.forward(); // 목장으로 다시 밀기
    await idle();
    expect(where()).toBe("/"); // 갈 곳이 없다
    nav.goTab("/groups");
    router.push("/groups/roster");
    history.back();
    await idle();
    expect(where()).toBe("/groups");
    history.forward(); // 명단으로 다시 밀기
    await idle();
    expect(where()).toBe("/groups"); // 넘어갔다가 곧바로 되돌아왔다
    nav.goTab("/");
    await idle();
  });

  it("월드 → 보고서: 뒤로 하면 홈", async () => {
    router.push("/world");
    nav.freshFromHome("/reports/2026-10-11");
    expect(where()).toBe("/reports/2026-10-11");
    history.back();
    await idle();
    expect(where()).toBe("/");
  });
});
