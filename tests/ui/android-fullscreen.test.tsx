import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import manifest from "@/app/manifest";
import { currentDisplayMode, isHomeScreenApp, type DisplayMode } from "@/lib/display-mode";
import { VIEWPORT_FIT_SCRIPT, viewportFitFor } from "@/lib/viewport-fit";
import { enterWorldFullscreen, isWorldHref, leaveWorldFullscreen, lockLandscape, worldFullscreenWanted, worldLockWanted } from "@/lib/world-fullscreen";

/**
 * 안드로이드 홈 화면 앱 전체 화면 · 로뎀 월드 가로 고정(2026-11-25).
 *   · 매니페스트 display "standalone" + display_override ["fullscreen", "standalone"] — 아이폰은 override 를 읽지 않는다
 *   · 홈 화면 앱 판정은 standalone · fullscreen · minimal-ui (알림 켜기도 같은 규칙)
 *   · viewport-fit — 안드로이드 fullscreen 만 cover
 *   · 월드 Fullscreen API 는 안드로이드 standalone 에서만, 떠날 때 exitFullscreen · unlock
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: () => {}, prefetch: () => {} }) }));
vi.mock("@/app/(tabs)/me/push-actions", () => ({ savePushSubscription: vi.fn(), removePushSubscription: vi.fn() }));
vi.mock("@/app/world/actions", () => ({ worldBuy: vi.fn(), worldSetVillage: vi.fn(), worldSaveLook: vi.fn(), worldSaveAvatarShot: vi.fn(async () => ({ ok: true })) }));

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/31.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const setUA = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
const mmFor = (mode: DisplayMode) => (q: string) => ({ matches: q === `(display-mode: ${mode})`, addEventListener() {}, removeEventListener() {} });

afterEach(() => {
  vi.unstubAllGlobals();
  setUA(UA.desktop);
});

describe("매니페스트", () => {
  it('display "standalone" 그대로에 display_override ["fullscreen", "standalone"] ★', () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.display_override).toEqual(["fullscreen", "standalone"]);
  });
});

describe("홈 화면 앱 판정", () => {
  it("standalone · fullscreen · minimal-ui 는 앱, browser 는 앱이 아님 ★", () => {
    expect(isHomeScreenApp("standalone")).toBe(true);
    expect(isHomeScreenApp("fullscreen")).toBe(true);
    expect(isHomeScreenApp("minimal-ui")).toBe(true);
    expect(isHomeScreenApp("browser")).toBe(false);
  });

  it("지금의 display-mode 를 읽는다 — matchMedia 가 없으면 browser", () => {
    for (const m of ["fullscreen", "standalone", "minimal-ui", "browser"] as const) expect(currentDisplayMode(mmFor(m))).toBe(m);
    expect(currentDisplayMode(undefined)).toBe("browser");
  });

  it("알림 쪽 판정 — fullscreen 에서도 홈 화면 앱으로 본다(아이폰 설치 안내가 뜨지 않는다) ★", async () => {
    const { detectPush } = await import("@/lib/push/client");
    setUA(UA.iphone);
    vi.stubGlobal("matchMedia", mmFor("fullscreen"));
    expect((await detectPush()).support).not.toBe("ios-install");
    vi.stubGlobal("matchMedia", mmFor("browser"));
    expect((await detectPush()).support).toBe("ios-install");
  });
});

describe("viewport-fit", () => {
  it("안드로이드 fullscreen 은 cover, 안드로이드 standalone · 브라우저는 auto, 아이폰은 cover ★", () => {
    expect(viewportFitFor(UA.android, "fullscreen")).toBe("cover");
    expect(viewportFitFor(UA.samsung, "fullscreen")).toBe("cover");
    expect(viewportFitFor(UA.android, "standalone")).toBe("auto");
    expect(viewportFitFor(UA.android, "browser")).toBe("auto");
    expect(viewportFitFor(UA.android)).toBe("auto");
    expect(viewportFitFor(UA.iphone, "standalone")).toBe("cover");
    expect(viewportFitFor(UA.iphone, "browser")).toBe("cover");
  });

  it("머리 스크립트도 같은 규칙 — display-mode 가 fullscreen 이면 안드로이드도 cover", () => {
    const run = (ua: string, mode: DisplayMode) => {
      setUA(ua);
      vi.stubGlobal("matchMedia", mmFor(mode));
      document.head.innerHTML = '<meta name="viewport" content="width=device-width, viewport-fit=cover">';
      new Function(VIEWPORT_FIT_SCRIPT)();
      return /viewport-fit=([a-z]+)/.exec(document.querySelector('meta[name="viewport"]')!.getAttribute("content")!)?.[1];
    };
    for (const ua of Object.values(UA)) for (const mode of ["fullscreen", "standalone", "browser"] as const) expect(run(ua, mode)).toBe(viewportFitFor(ua, mode));
    document.head.innerHTML = "";
  });
});

describe("로뎀 월드 — 판단", () => {
  it("Fullscreen API 는 안드로이드 standalone 만 시도, 안드로이드 fullscreen · 아이폰 · 데스크톱은 안 함 ★", () => {
    expect(worldFullscreenWanted(UA.android, "standalone")).toBe(true);
    expect(worldFullscreenWanted(UA.samsung, "standalone")).toBe(true);
    expect(worldFullscreenWanted(UA.android, "fullscreen")).toBe(false);
    expect(worldFullscreenWanted(UA.android, "browser")).toBe(false);
    expect(worldFullscreenWanted(UA.iphone, "standalone")).toBe(false);
    expect(worldFullscreenWanted(UA.desktop, "standalone")).toBe(false);
  });

  it("가로 고정은 안드로이드만", () => {
    expect(worldLockWanted(UA.android)).toBe(true);
    expect(worldLockWanted(UA.iphone)).toBe(false);
    expect(worldLockWanted(UA.desktop)).toBe(false);
  });

  it("월드 주소 — /world · /world?open=dress 는 맞고, 다른 화면 · 다른 출처는 아니다", () => {
    const o = "https://example.test";
    expect(isWorldHref("/world", o)).toBe(true);
    expect(isWorldHref("/world?try=strawhat", o)).toBe(true);
    expect(isWorldHref("/worlds", o)).toBe(false);
    expect(isWorldHref("/shop", o)).toBe(false);
    expect(isWorldHref("https://other.test/world", o)).toBe(false);
  });

  it("가로 고정 결과 — 성공은 null, 실패는 오류 이름, 없으면 NotSupported", async () => {
    expect(await lockLandscape({ lock: async () => {} })).toBeNull();
    expect(await lockLandscape({ lock: async () => Promise.reject(Object.assign(new Error("x"), { name: "NotSupportedError" })) })).toBe("NotSupportedError");
    expect(await lockLandscape({})).toBe("NotSupported");
  });

  it("들어가기 — 전체 화면이 되면 가로 고정까지, 이미 전체 화면이거나 안 되면 부르지 않는다", async () => {
    const lock = vi.fn(async () => {});
    const req = vi.fn(async () => {});
    expect(await enterWorldFullscreen({ fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: req } }, { lock })).toBe(true);
    expect(req).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("landscape");
    lock.mockClear();
    expect(await enterWorldFullscreen({ fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: async () => Promise.reject(new Error("no")) } }, { lock })).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(await enterWorldFullscreen({ fullscreenEnabled: false, documentElement: { requestFullscreen: req } }, { lock })).toBe(false);
  });

  it("떠나기 — 전체 화면이면 exitFullscreen, 가로 고정은 늘 푼다", () => {
    const exit = vi.fn(async () => {});
    const unlock = vi.fn();
    leaveWorldFullscreen({ fullscreenElement: document.documentElement, documentElement: {}, exitFullscreen: exit }, { unlock });
    expect(exit).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledTimes(1);
    leaveWorldFullscreen({ fullscreenElement: null, documentElement: {}, exitFullscreen: exit }, { unlock });
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe("globals.css", () => {
  it("html[data-sbar]:fullscreen 에서는 --nn-safe-* 를 env 값으로 되돌린다", () => {
    const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
    const block = /html\[data-sbar\]:fullscreen\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("--nn-safe-top: env(safe-area-inset-top, 0px);");
    expect(block).toContain("--nn-safe-bottom: env(safe-area-inset-bottom, 0px);");
  });
});

describe("로뎀 월드 껍데기 — 안드로이드 전체 화면", () => {
  let container: HTMLDivElement;
  let root: Root;
  const lock = vi.fn(async () => {});
  const unlock = vi.fn();
  const exitFullscreen = vi.fn(async () => {});
  const requestFullscreen = vi.fn(async () => {});
  let fsEl: Element | null = null;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    [lock, unlock, exitFullscreen, requestFullscreen].forEach((f) => f.mockClear());
    setUA(UA.android);
    vi.stubGlobal("matchMedia", mmFor("standalone"));
    Object.defineProperty(screen, "orientation", { value: { lock, unlock, type: "portrait-primary", addEventListener() {}, removeEventListener() {} }, configurable: true });
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { get: () => fsEl, configurable: true });
    Object.defineProperty(document, "exitFullscreen", { value: exitFullscreen, configurable: true });
    Object.defineProperty(document.documentElement, "requestFullscreen", { value: requestFullscreen, configurable: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    fsEl = null;
    vi.useRealTimers();
  });

  const send = async (data: unknown) =>
    act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin }));
    });

  async function renderShell() {
    const { WorldShell } = await import("@/app/world/world-shell");
    await act(async () => root.render(<WorldShell reportHref={null} />));
  }

  it("들어오면 가로 고정을 시도한다", async () => {
    await renderShell();
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("'홈으로' 를 누르면 전체 화면일 때 exitFullscreen 과 unlock 을 부른다 ★", async () => {
    await renderShell();
    fsEl = document.documentElement;
    await send({ source: "rodem-world", event: "exit" });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalled();
  });

  it("월드 안 '전체 화면' 단추 — 앱에 알리면 막대를 숨기고(navigationUI hide) 가로 고정을 시도한다", async () => {
    await renderShell();
    lock.mockClear();
    await send({ source: "rodem-world", event: "fullscreen" });
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("월드에 '전체 화면' 단추를 보이라고 알린다 — 지금 전체 화면이 아닐 때만", async () => {
    await renderShell();
    const frame = container.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    await send({ source: "rodem-world", event: "boot" });
    expect(post).toHaveBeenCalledWith({ source: "ninetynine", event: "fsButton", show: true }, window.location.origin);
    fsEl = document.documentElement;
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(post).toHaveBeenLastCalledWith({ source: "ninetynine", event: "fsButton", show: false }, window.location.origin);
  });

  it("월드로 가는 링크를 누르면 이동 전에 막대를 숨긴다 — 다른 링크 · 아이폰은 그대로", async () => {
    const { WorldEntryFullscreen } = await import("@/components/world-entry-fullscreen");
    await act(async () =>
      root.render(
        <>
          <WorldEntryFullscreen />
          <a href="/world?open=dress" onClick={(e) => e.preventDefault()}>
            <span id="to-world">들어가기</span>
          </a>
          <a href="/shop" id="to-shop" onClick={(e) => e.preventDefault()}>
            상점
          </a>
        </>,
      ),
    );
    await act(async () => container.querySelector<HTMLElement>("#to-shop")!.click());
    expect(requestFullscreen).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLElement>("#to-world")!.click());
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    requestFullscreen.mockClear();
    setUA(UA.iphone);
    await act(async () => container.querySelector<HTMLElement>("#to-world")!.click());
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("아이폰이면 가로 고정 · 전체 화면을 부르지 않고 단추도 숨김", async () => {
    setUA(UA.iphone);
    await renderShell();
    const post = vi.spyOn(container.querySelector("iframe")!.contentWindow!, "postMessage");
    await send({ source: "rodem-world", event: "boot" });
    expect(post).toHaveBeenCalledWith({ source: "ninetynine", event: "fsButton", show: false }, window.location.origin);
    await send({ source: "rodem-world", event: "fullscreen" });
    fsEl = document.documentElement;
    await send({ source: "rodem-world", event: "exit" });
    expect(lock).not.toHaveBeenCalled();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
