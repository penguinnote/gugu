import { afterEach, describe, expect, it, vi } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { SAMSUNG_BARS_KEY, SAMSUNG_BARS_SCRIPT, samsungBarsFor } from "@/lib/samsung-bars";

/**
 * 삼성 인터넷 홈 화면 앱의 시스템 막대 대체값(2026-11-23) — 갤럭시 화면 진단에서 safe-area 가 cover · auto 모두 0 이었다.
 * 홈 화면 앱(standalone)일 때만 html[data-sbar] 를 붙이고, 화면들은 env() 대신 --nn-safe-top · --nn-safe-bottom 만 쓴다.
 */
const UA = {
  samsung: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/31.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
};

function runHead(ua: string, standalone: boolean) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q === "(display-mode: standalone)" }));
  document.documentElement.removeAttribute("data-sbar");
  new Function(SAMSUNG_BARS_SCRIPT)();
  return document.documentElement.hasAttribute("data-sbar");
}

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-sbar");
});

describe("삼성 인터넷 대체값 — 판단", () => {
  it("삼성 인터넷 홈 화면 앱만 켜짐, 삼성 인터넷 탭 · 크롬 홈 화면 앱 · 아이폰은 꺼짐 ★", () => {
    expect(samsungBarsFor(UA.samsung, true)).toBe(true);
    expect(samsungBarsFor(UA.samsung, false)).toBe(false);
    expect(samsungBarsFor(UA.androidChrome, true)).toBe(false);
    expect(samsungBarsFor(UA.iphoneSafari, true)).toBe(false);
    expect(samsungBarsFor(UA.iphoneSafari, false)).toBe(false);
  });

  it("머리 스크립트와 판단 함수가 같은 답을 낸다", () => {
    for (const ua of Object.values(UA)) for (const sa of [true, false]) expect(runHead(ua, sa)).toBe(samsungBarsFor(ua, sa));
  });

  it("진단 화면이 고른 값(sessionStorage)이 있으면 그것을 따른다", () => {
    sessionStorage.setItem(SAMSUNG_BARS_KEY, "on");
    expect(runHead(UA.iphoneSafari, false)).toBe(true);
    sessionStorage.setItem(SAMSUNG_BARS_KEY, "off");
    expect(runHead(UA.samsung, true)).toBe(false);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe("safe-area 는 변수 하나로", () => {
  const SRC = join(__dirname, "../../src");
  const GLOBALS = join(SRC, "app/globals.css");

  it("src 안에 env(safe-area-inset-top · bottom) 이 globals.css 의 변수 정의 말고는 없다 ★", () => {
    const left: string[] = [];
    for (const f of walk(SRC)) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/env\(\s*safe-area-inset-(top|bottom)/.test(line)) return;
          if (f === GLOBALS && /^\s*--nn-safe-(top|bottom):/.test(line)) return;
          left.push(`${f.slice(SRC.length + 1)}:${i + 1}`);
        });
    }
    expect(left).toEqual([]);
  });

  it("globals.css — :root 에 기본값, html[data-sbar] 에 32px · 48px 대체값(max 로 진짜 값이 이긴다)과 탭 막대 간격", () => {
    const css = readFileSync(GLOBALS, "utf8");
    expect(css).toContain("--nn-safe-top: env(safe-area-inset-top, 0px);");
    expect(css).toContain("--nn-safe-bottom: env(safe-area-inset-bottom, 0px);");
    const sbar = /html\[data-sbar\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(sbar).toContain("--nn-safe-top: max(env(safe-area-inset-top, 0px), 32px);");
    expect(sbar).toContain("--nn-safe-bottom: max(env(safe-area-inset-bottom, 0px), 48px);");
    expect(sbar).toContain("--nn-tabbar-gap: calc(var(--nn-safe-bottom) + 10px);");
    // 아이폰 값은 그대로
    expect(css).toContain("--nn-tabbar-gap: max(10px, calc(var(--nn-safe-bottom) - 6px));");
  });
});
