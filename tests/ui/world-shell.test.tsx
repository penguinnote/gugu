import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /world 껍데기(World 1) — 불러오기 화면과 월드(iframe) 사이의 약속.
 *   · 처음엔 불러오기 화면이 덮여 있고, 월드 iframe 은 시안 페이지(?embed)를 연다
 *   · 진행 값이 오면 한 줄이 바뀌고, '준비' 가 오면 잠시 뒤 불러오기 화면이 걷힌다
 *   · '나가기' → 홈, '보고서' → reportHref(없으면 무시)
 *   · 다른 출처의 메시지는 무시한다
 *   · 제한 시간 안에 준비가 안 오면 실패 화면(다시 시도)
 */
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: () => {}, prefetch: () => {} }) }));
// 서버 액션은 흉내 — 껍데기는 부탁을 넘기고 답을 돌려주는 일만 한다(판정은 DB 함수, tests/rls/world.test.mjs)
const worldBuy = vi.fn(async (item: string) =>
  item === "pine"
    ? { ok: true, state: { items: [], villages: [{ group_id: "g2", fence: "wood", slots: [null, null, null, null, null, null, null] }], mine: { group_id: "g2", berries: 45, owned: { pine: 2 } }, look: null } }
    : { ok: false, message: "열매가 모자랍니다." },
);
// 아바타 사진 저장 — 끝나는 때를 테스트가 정한다(떠나기가 저장을 기다리는지 본다)
let shotDone: () => void = () => {};
const worldSaveAvatarShot = vi.fn((image: string) => new Promise<{ ok: boolean }>((r) => (shotDone = () => r({ ok: image.length > 0 }))));
vi.mock("@/app/world/actions", () => ({ worldBuy: (i: string) => worldBuy(i), worldSetVillage: vi.fn(), worldSaveLook: vi.fn(), worldSaveAvatarShot: (i: string) => worldSaveAvatarShot(i) }));

const { WorldShell, WORLD_SRC, WORLD_TIMEOUT_MS } = await import("@/app/world/world-shell");

let container: HTMLDivElement;
let root: Root;

async function render(reportHref: string | null) {
  await act(async () => {
    root.render(<WorldShell reportHref={reportHref} />);
  });
}

async function send(data: unknown, origin = window.location.origin) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data, origin }));
  });
}

const loading = () => container.querySelector('[data-testid="world-loading"]');

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  push.mockReset();
  replace.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("로뎀 월드 껍데기", () => {
  it("처음엔 불러오기 화면이 덮여 있고, iframe 은 끼워 여는 시안 페이지다", async () => {
    await render(null);
    expect(loading()).not.toBeNull();
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(WORLD_SRC);
    expect(WORLD_SRC).toContain("embed");
  });

  it("진행 값이 오면 한 줄이 바뀌고, 준비가 오면 잠시 뒤 걷힌다", async () => {
    await render(null);
    expect(container.textContent).toContain("숲에 나무를 심고 있어요");
    await send({ source: "rodem-world", event: "progress", value: 0.75 });
    expect(container.textContent).toContain("양들을 깨우고 있어요");
    await send({ source: "rodem-world", event: "ready" });
    expect(loading()).not.toBeNull(); // 바로 사라지지 않는다(최소 표시 시간 + 페이드)
    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });
    expect(loading()).toBeNull();
  });

  it("나가기는 홈으로(기록을 쌓지 않고), 보고서는 reportHref 로", async () => {
    history.replaceState(null, "", "/world");
    await render("/reports/2026-10-04");
    await send({ source: "rodem-world", event: "exit" });
    expect(replace).toHaveBeenLastCalledWith("/"); // 홈 기록이 없을 때(바로 연 월드)는 홈으로 갈아 끼운다 — 있으면 홈까지 되돌아간다(lib/nav-history)
    expect(container.querySelector('[data-testid="world-departing"]')?.textContent).toContain("홈으로 돌아가는 중"); // 다음 화면까지 덮개
    await send({ source: "rodem-world", event: "report" });
    expect(push).toHaveBeenLastCalledWith("/reports/2026-10-04");
  });

  it("떠날 때 — 덮개부터 씌우고, 막 찍은 아바타 사진은 저장이 끝난 뒤에 옮긴다(정보 탭이 새 모습을 읽게)", async () => {
    history.replaceState(null, "", "/world");
    await render("/reports/2026-10-04");
    await send({ source: "rodem-world", event: "leaving", to: "exit" });
    expect(container.querySelector('[data-testid="world-departing"]')?.textContent).toContain("홈으로 돌아가는 중");
    await send({ source: "rodem-world", event: "exit", image: "data:image/webp;base64,AAAA" });
    expect(worldSaveAvatarShot).toHaveBeenCalledWith("data:image/webp;base64,AAAA");
    expect(replace).not.toHaveBeenCalled(); // 저장이 끝나기 전에는 그대로
    await act(async () => shotDone());
    expect(replace).toHaveBeenLastCalledWith("/");
  });

  it("?stats 를 넘기면 월드에도 무게 표를 켠다", async () => {
    await act(async () => {
      root.render(<WorldShell reportHref={null} stats />);
    });
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(`${WORLD_SRC}&stats=1`);
  });

  it("월드가 시작을 알리면 실제 목장 정보를 같은 출처로 넘긴다", async () => {
    const init = { groups: ["하나", "둘"], mine: 1, week: { submitted: true, skipped: false }, world: null };
    await act(async () => {
      root.render(<WorldShell reportHref={null} init={init} />);
    });
    const frame = container.querySelector("iframe")!;
    const spy = vi.spyOn(frame.contentWindow!, "postMessage");
    await send({ source: "rodem-world", event: "boot" });
    expect(spy).toHaveBeenCalledWith({ source: "ninetynine", event: "init", ...init }, window.location.origin);
    // 노치·홈 막대 자리(safe-area)도 같이 — iframe 안에서는 잴 수 없어서 앱이 재서 넘긴다(디자인 2)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ source: "ninetynine", event: "insets", top: expect.any(Number), right: expect.any(Number), bottom: expect.any(Number), left: expect.any(Number) }),
      window.location.origin,
    );
    const calls = spy.mock.calls.length;
    await send({ source: "rodem-world", event: "boot" }, "https://example.com"); // 다른 출처의 요청엔 답하지 않는다
    expect(spy).toHaveBeenCalledTimes(calls);
  });

  it("월드는 화면 끝까지 — 바깥 틀에 safe-area 여백을 두지 않는다(디자인 2)", async () => {
    await render(null);
    const frame = container.querySelector('[data-testid="world-frame"]')!;
    expect(frame.parentElement!.className).not.toMatch(/safe-area/);
  });

  it("세로로 든 휴대폰이면 월드 판을 가로로 돌려 그리고, 노치 · 홈 막대 여백도 돌린 방향으로 넘긴다(2026-10-18)", async () => {
    const mm = vi.fn((q: string) => ({ matches: q.includes("portrait"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("matchMedia", mm);
    Object.assign(window, { innerWidth: 390, innerHeight: 844 });
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) =>
      el.getAttribute("aria-hidden") === "true" && el.className.includes("safe-area")
        ? ({ paddingTop: "47px", paddingRight: "0px", paddingBottom: "34px", paddingLeft: "0px" } as CSSStyleDeclaration)
        : real(el),
    );
    try {
      await render(null);
      const stage = container.querySelector<HTMLElement>('[data-testid="world-stage"]')!;
      expect(stage.dataset.turned).toBe("true");
      expect(stage.style.width).toBe("844px");
      expect(stage.style.height).toBe("390px");
      expect(stage.style.transform).toBe("translateX(390px) rotate(90deg)");
      const spy = vi.spyOn(container.querySelector("iframe")!.contentWindow!, "postMessage");
      await send({ source: "rodem-world", event: "boot" });
      const ins = spy.mock.calls.map(([m]) => m as { event?: string }).find((m) => m.event === "insets");
      expect(ins).toMatchObject({ top: 0, right: 34, bottom: 0, left: 47 }); // 월드의 왼쪽 = 화면 위(노치), 오른쪽 = 화면 아래(홈 막대)
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("월드의 사기 부탁은 서버 액션으로 넘기고, 같은 번호로 결과(목장 번호 순 상태)를 돌려준다", async () => {
    await act(async () => {
      root.render(<WorldShell reportHref={null} init={null} groupIds={["g1", "g2"]} />);
    });
    const spy = vi.spyOn(container.querySelector("iframe")!.contentWindow!, "postMessage");
    await send({ source: "rodem-world", event: "buy", req: 7, item: "pine" });
    await act(async () => {});
    expect(worldBuy).toHaveBeenCalledWith("pine");
    const [msg, origin] = spy.mock.calls.at(-1)!;
    expect(origin).toBe(window.location.origin);
    expect(msg).toMatchObject({ source: "ninetynine", event: "result", req: 7, ok: true, world: { berries: 45, owned: { pine: 2 }, villages: [null, { fence: "wood" }] } });
    await send({ source: "rodem-world", event: "buy", req: 8, item: "castle" });
    await act(async () => {});
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ req: 8, ok: false, message: "열매가 모자랍니다." });
  });

  it("reportHref 가 없으면 보고서 신호는 무시한다", async () => {
    await render(null);
    await send({ source: "rodem-world", event: "report" });
    expect(push).not.toHaveBeenCalled();
  });

  it("다른 출처·다른 모양의 메시지는 무시한다", async () => {
    await render("/reports/2026-10-04");
    await send({ source: "rodem-world", event: "exit" }, "https://example.com");
    await send({ event: "exit" });
    await send("exit");
    expect(push).not.toHaveBeenCalled();
    await send({ source: "rodem-world", event: "ready" }, "https://example.com");
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(loading()).not.toBeNull();
  });

  it("제한 시간 안에 준비가 안 오면 실패 화면 — 다시 시도하면 불러오기로 돌아간다", async () => {
    await render(null);
    await act(async () => {
      vi.advanceTimersByTime(WORLD_TIMEOUT_MS + 100);
    });
    expect(container.textContent).toContain("월드를 불러오지 못했어요");
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "다시 시도")!;
    await act(async () => {
      retry.click();
    });
    expect(container.textContent).toContain("로뎀 월드로 가는 중");
  });
});
