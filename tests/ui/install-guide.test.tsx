import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InstallGuide } from "@/components/install-guide/install-guide";
import { detectInstallEnv, installSteps, type InstallEnv } from "@/lib/install-env";

/**
 * 웹앱 설치 안내(2026-11-11)
 *   · 브라우저 알아보기 — 카카오톡 · 다른 앱 · 삼성 인터넷 · 크롬 · 사파리(버전)
 *   · 단계 순서 — 아이폰 사파리 26 은 ⋯ → 공유, 그 전은 공유부터. 바깥 브라우저로 옮기는 단계는 그 하나로 끝
 *   · 갤럭시는 설치 창이 있으면 단추 하나, 없으면 브라우저 메뉴 따라가기
 *   · 화면 — 기종을 먼저 묻고, '다음' 으로 한 장씩, '이전' 으로 돌아간다
 */

const UA = {
  safari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  safari17: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  crios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  kakaoIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
  instaIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
  chrome: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  kakaoAnd: "Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 KAKAOTALK 10.8.0",
  naverAnd: "Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0)",
};

describe("detectInstallEnv", () => {
  it("브라우저를 알아본다 ★", () => {
    expect(detectInstallEnv(UA.safari26)).toEqual({ os: "ios", browser: "safari", safari: 26 });
    expect(detectInstallEnv(UA.safari17)).toEqual({ os: "ios", browser: "safari", safari: 17 });
    expect(detectInstallEnv(UA.crios).browser).toBe("other");
    expect(detectInstallEnv(UA.kakaoIos).browser).toBe("kakao");
    expect(detectInstallEnv(UA.instaIos).browser).toBe("inapp");
    expect(detectInstallEnv(UA.samsung)).toEqual({ os: "android", browser: "samsung", safari: 0 });
    expect(detectInstallEnv(UA.chrome).browser).toBe("chrome");
    expect(detectInstallEnv(UA.kakaoAnd).browser).toBe("kakao");
    expect(detectInstallEnv(UA.naverAnd).browser).toBe("inapp");
  });
  it("아이패드(데스크톱처럼 보고하는)도 아이폰 쪽", () => {
    expect(detectInstallEnv("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", "MacIntel", 5).os).toBe("ios");
  });
});

describe("installSteps", () => {
  const env = (ua: string) => detectInstallEnv(ua);
  it("아이폰 사파리 26 은 막대 모양부터 묻는다 — ⋯ 막대면 ⋯ → 공유, 공유 막대면 공유부터. 그 전 사파리는 묻지 않고 공유부터 ★", () => {
    expect(installSteps("ios", env(UA.safari26), false)).toEqual(["ios-pick", "ios-share", "ios-scroll", "ios-add", "ios-confirm", "done"]);
    expect(installSteps("ios", env(UA.safari26), false, "more")).toEqual(["ios-pick", "ios-more", "ios-share", "ios-scroll", "ios-add", "ios-confirm", "done"]);
    expect(installSteps("ios", env(UA.safari26), false, "share")).toEqual(["ios-pick", "ios-share", "ios-scroll", "ios-add", "ios-confirm", "done"]);
    expect(installSteps("ios", env(UA.safari17), false)).toEqual(["ios-share", "ios-scroll", "ios-add", "ios-confirm", "done"]);
  });
  it("바깥 브라우저로 옮기는 단계는 그 하나 — 카카오톡 · 다른 앱 · 다른 브라우저", () => {
    expect(installSteps("ios", env(UA.kakaoIos), false)).toEqual(["kakao-out"]);
    expect(installSteps("ios", env(UA.instaIos), false)).toEqual(["ios-inapp"]);
    expect(installSteps("ios", env(UA.crios), false)).toEqual(["ios-safari"]);
    expect(installSteps("android", env(UA.kakaoAnd), false)).toEqual(["kakao-out"]);
    expect(installSteps("android", env(UA.naverAnd), false)).toEqual(["and-chrome-open"]);
  });
  it("갤럭시 — 설치 창이 있으면 단추 하나, 없으면 삼성 인터넷 · 크롬 메뉴 ★", () => {
    expect(installSteps("android", env(UA.samsung), true)).toEqual(["and-prompt", "done"]);
    expect(installSteps("android", env(UA.samsung), false)).toEqual(["sam-menu", "sam-add", "sam-home", "sam-confirm", "done"]);
    expect(installSteps("android", env(UA.chrome), false)).toEqual(["chr-menu", "chr-add", "chr-confirm", "done"]);
  });
  it("고른 기종이 실제 기기와 다르면 그 기종의 기본 순서", () => {
    expect(installSteps("ios", env(UA.chrome), true)[0]).toBe("ios-pick");
    expect(installSteps("android", env(UA.safari26), false)[0]).toBe("sam-menu");
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const q = (sel: string) => container.querySelector(sel);
const click = async (sel: string) => {
  await act(async () => (q(sel) as HTMLElement).click());
};
const render = async (env: InstallEnv, canPrompt = false) => {
  await act(async () => root.render(<InstallGuide env={env} canPrompt={canPrompt} />));
};

describe("InstallGuide", () => {
  it("기종을 먼저 묻고, 고르면 첫 단계 — '다음' 으로 끝까지, '이전' 으로 돌아간다 ★", async () => {
    await render({ os: "ios", browser: "safari", safari: 26 });
    expect(container.textContent).toContain("어떤 휴대폰을 쓰세요?");
    await click('[data-testid="install-ios"]');
    expect(q('[data-testid="install-step-ios-pick"]')).not.toBeNull();
    await click('[data-testid="install-bar-more"]');
    expect(q('[data-testid="install-step-ios-more"]')).not.toBeNull();
    await click('[data-testid="install-next"]');
    expect(q('[data-testid="install-step-ios-share"]')).not.toBeNull();
    await click('[data-testid="install-back"]');
    expect(q('[data-testid="install-step-ios-more"]')).not.toBeNull();
    for (let i = 0; i < 5; i++) await click('[data-testid="install-next"]');
    expect(q('[data-testid="install-step-done"]')).not.toBeNull();
    expect(container.textContent).toContain("홈 화면의 구구를 눌러 열어요");
    expect(q('[data-testid="install-next"]')).toBeNull();
  });

  it("공유 단추가 있는 막대를 고르면 바로 '공유' — 그림도 아래 막대 가운데 공유 ★", async () => {
    await render({ os: "ios", browser: "safari", safari: 26 });
    await click('[data-testid="install-ios"]');
    await click('[data-testid="install-bar-share"]');
    expect(q('[data-testid="install-step-ios-share"]')).not.toBeNull();
    expect(container.textContent).not.toContain("즐겨찾기에 추가");
  });

  it("아이폰은 공유 다음에 '공유 창을 위로 쓸어 올려요' — 그다음 '홈 화면에 추가' ★", async () => {
    await render({ os: "ios", browser: "safari", safari: 26 });
    await click('[data-testid="install-ios"]');
    await click('[data-testid="install-bar-share"]');
    await click('[data-testid="install-next"]');
    expect(q('[data-testid="install-step-ios-scroll"]')).not.toBeNull();
    expect(container.textContent).toContain("공유 창을 위로 쓸어 올려요");
    await click('[data-testid="install-next"]');
    expect(q('[data-testid="install-step-ios-add"]')?.textContent).toContain("홈 화면에 추가");
  });

  it("첫 단계에서 '이전' 이면 기종 고르기로", async () => {
    await render({ os: "android", browser: "samsung", safari: 0 });
    await click('[data-testid="install-android"]');
    expect(q('[data-testid="install-step-sam-menu"]')).not.toBeNull();
    await click('[data-testid="install-back"]');
    expect(q('[data-testid="install-ios"]')).not.toBeNull();
  });

  it("설치 창이 있으면 '설치하기', '직접 할게요' 면 메뉴 따라가기", async () => {
    await render({ os: "android", browser: "chrome", safari: 0 }, true);
    await click('[data-testid="install-android"]');
    expect(q('[data-testid="install-prompt"]')).not.toBeNull();
    const manual = [...container.querySelectorAll("button")].find((b) => b.textContent === "직접 할게요")!;
    await act(async () => manual.click());
    expect(q('[data-testid="install-step-chr-menu"]')).not.toBeNull();
  });

  it("단계마다 눌러야 할 곳이 그림에 표시된다", async () => {
    await render({ os: "android", browser: "samsung", safari: 0 });
    await click('[data-testid="install-android"]');
    for (let i = 0; i < 4; i++) {
      expect(q('[data-testid="install-hot"]')).not.toBeNull();
      await click('[data-testid="install-next"]');
    }
  });
});
