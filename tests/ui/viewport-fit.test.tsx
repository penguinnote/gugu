import { afterEach, describe, expect, it } from "vitest";

import { VIEWPORT_FIT_KEY, VIEWPORT_FIT_SCRIPT, viewportFitFor, withViewportFit } from "@/lib/viewport-fit";

/**
 * 화면을 어디까지 그리나(2026-11-23) — 아이폰은 cover, 안드로이드는 auto(갤럭시 아래 내비게이션 바가 화면을 가렸다).
 * 머리 스크립트는 viewport meta 의 viewport-fit 만 바꾼다.
 */
const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  desktopChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
const CONTENT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content";

function runHead(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  document.head.innerHTML = `<meta name="viewport" content="${CONTENT}">`;
  new Function(VIEWPORT_FIT_SCRIPT)();
  return document.querySelector('meta[name="viewport"]')!.getAttribute("content")!;
}

afterEach(() => {
  sessionStorage.clear();
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-vfit");
});

describe("viewport-fit — 아이폰 cover · 안드로이드 auto", () => {
  it("판단 함수 — 안드로이드 크롬 · 삼성 인터넷은 auto, 아이폰 · 아이패드 · 데스크톱 크롬은 cover ★", () => {
    expect(viewportFitFor(UA.androidChrome)).toBe("auto");
    expect(viewportFitFor(UA.androidSamsung)).toBe("auto");
    expect(viewportFitFor(UA.iphoneSafari)).toBe("cover");
    expect(viewportFitFor(UA.ipad)).toBe("cover");
    expect(viewportFitFor(UA.desktopChrome)).toBe("cover");
  });

  it("viewport-fit 만 바꾸고 나머지 값은 그대로", () => {
    expect(withViewportFit(CONTENT, "auto")).toBe(CONTENT.replace("viewport-fit=cover", "viewport-fit=auto"));
    expect(withViewportFit("width=device-width", "auto")).toBe("width=device-width, viewport-fit=auto");
  });

  it("머리 스크립트 — 안드로이드 사용자 에이전트면 meta 가 viewport-fit=auto, 아이폰이면 cover 그대로 ★", () => {
    const and = runHead(UA.androidChrome);
    expect(and).toContain("viewport-fit=auto");
    expect(and).toContain("interactive-widget=overlays-content");
    expect(and).toContain("user-scalable=no");
    expect(document.documentElement.getAttribute("data-vfit")).toBe("auto");
    expect(runHead(UA.androidSamsung)).toContain("viewport-fit=auto");
    expect(runHead(UA.iphoneSafari)).toBe(CONTENT);
    expect(runHead(UA.desktopChrome)).toBe(CONTENT);
  });

  it("머리 스크립트와 판단 함수가 같은 답을 낸다", () => {
    for (const ua of Object.values(UA)) expect(runHead(ua)).toContain(`viewport-fit=${viewportFitFor(ua)}`);
  });

  it("진단 화면이 고른 값(sessionStorage)이 있으면 그것을 따른다", () => {
    sessionStorage.setItem(VIEWPORT_FIT_KEY, "cover");
    expect(runHead(UA.androidChrome)).toContain("viewport-fit=cover");
    sessionStorage.setItem(VIEWPORT_FIT_KEY, "auto");
    expect(runHead(UA.iphoneSafari)).toContain("viewport-fit=auto");
  });
});
