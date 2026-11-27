import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reminderMessage, stampedMessage, submittedMessage } from "@/lib/push/messages";
import { detectIOS, pushSupport, urlBase64ToUint8Array } from "@/lib/push/platform";

/**
 * Step 7 웹 푸시 — 문구 · 기기 판정 · 내 정보의 알림 안내.
 *   · 잠금 화면에 뜨는 문구라 목장 이름·할 일만, 누르면 그 주 보고서로
 *   · 아이폰은 홈 화면 앱으로 열어야만 켤 수 있다 — 안내만 하고 막지 않는다
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

vi.mock("@/app/(tabs)/me/push-actions", () => ({
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
}));

describe("알림 문구", () => {
  it("월요일 미제출 — 목장 이름과 마감, 누르면 그 주 작성 화면 ★", () => {
    const m = reminderMessage("토브", "2026-10-04");
    expect(m.title).toBe("토브 목장보고서");
    expect(m.body).toBe("10월 4일 목장보고서가 아직 제출되지 않았습니다. 마감은 내일(화) 밤 11시 59분입니다.");
    expect(m.url).toBe("/reports/2026-10-04");
  });
  it("제출 완료 — 누가 냈는지", () => {
    expect(submittedMessage("윤다솜", "토브", "2026-10-04").body).toBe("윤다솜 리더가 10월 4일 목장보고서를 제출했습니다.");
  });
  it("목사님 스탬프 — 스탬프 문구", () => {
    expect(stampedMessage("토브", "2026-10-04", "pray").body).toBe('목사님이 10월 4일 목장보고서를 확인하셨습니다 · "기도하겠습니다"');
  });
});

describe("기기 판정", () => {
  const base = { supported: true, isIOS: false, standalone: false, permission: "default" as const, hasKey: true };
  it("아이폰인데 홈 화면 앱이 아니면 설치 안내가 먼저 ★", () => {
    expect(pushSupport({ ...base, isIOS: true, standalone: false })).toBe("ios-install");
    expect(pushSupport({ ...base, isIOS: true, standalone: true })).toBe("ready");
  });
  it("미지원 · 키 없음 · 차단 · 준비", () => {
    expect(pushSupport({ ...base, supported: false })).toBe("unsupported");
    expect(pushSupport({ ...base, hasKey: false })).toBe("no-key");
    expect(pushSupport({ ...base, permission: "denied" })).toBe("denied");
    expect(pushSupport(base)).toBe("ready");
  });
  it("iPadOS 는 맥처럼 보고해도 터치로 구분한다", () => {
    expect(detectIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
    expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
  });
  it("VAPID 공개 키(base64url)를 바이트로", () => {
    expect([...urlBase64ToUint8Array("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  // 인스턴스에 덮어쓴 userAgent 를 지우면 프로토타입의 jsdom 값으로 돌아간다
  delete (window.navigator as unknown as { userAgent?: string }).userAgent;
});

describe("PushSettings", () => {
  it("아이폰 사파리(홈 화면 앱 아님)에서는 홈 화면 추가 안내 ★", async () => {
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", configurable: true });
    const { PushSettings } = await import("@/components/push-settings");
    await act(async () => root.render(<PushSettings />));
    expect(container.querySelector('[data-testid="ios-guide"]')?.textContent).toContain("홈 화면에 추가");
    expect(container.querySelector("button")).toBeNull();
  });

  it("서비스 워커가 없는 브라우저는 미지원 안내", async () => {
    const { PushSettings } = await import("@/components/push-settings");
    await act(async () => root.render(<PushSettings />));
    expect(container.textContent).toContain("이 브라우저에서는 알림을 받을 수 없습니다");
  });
});

describe("홈의 알림 켜기 팝업 (2026-10-29)", () => {
  it("'나중에' 는 3일 동안 다시 묻지 않는다", async () => {
    const { ASK_AGAIN_MS, canAskAgain } = await import("@/app/(tabs)/home/push-prompt");
    const now = 10 * ASK_AGAIN_MS;
    expect(canAskAgain(now, null)).toBe(true);
    expect(canAskAgain(now, "엉뚱한 값")).toBe(true);
    expect(canAskAgain(now, String(now - 1000))).toBe(false);
    expect(canAskAgain(now, String(now - ASK_AGAIN_MS))).toBe(true);
  });

  it("켤 수 있는 기기 — 구구와 '알림 켜기', 나중에를 누르면 닫히고 그때를 적어 둔다 ★", async () => {
    localStorage.removeItem("gg-push-ask");
    const { PushPrompt } = await import("@/app/(tabs)/home/push-prompt");
    await act(async () => root.render(<PushPrompt preview="push" />));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("알림을 켜 둘까요?");
    expect(container.querySelector('[data-testid="push-prompt-on"]')?.textContent).toBe("알림 켜기");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="push-prompt-later"]')!.click());
    expect(container.querySelector('[data-testid="push-prompt"]')).toBeNull();
    expect(Number(localStorage.getItem("gg-push-ask"))).toBeGreaterThan(0);
  });

  it("알림을 못 켜는 브라우저(서비스 워커 없음)에서는 띄우지 않는다", async () => {
    localStorage.removeItem("gg-push-ask");
    const { PushPrompt } = await import("@/app/(tabs)/home/push-prompt");
    await act(async () => root.render(<PushPrompt />));
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    expect(container.querySelector('[data-testid="push-prompt"]')).toBeNull();
  });

  it("아이폰 사파리 — 홈 화면에 추가하는 법을 띄운다", async () => {
    localStorage.removeItem("gg-push-ask");
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", configurable: true });
    const { PushPrompt } = await import("@/app/(tabs)/home/push-prompt");
    await act(async () => root.render(<PushPrompt />));
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("홈 화면에 추가");
  });
});


describe("받는 알림 목록(2026-11-11)", () => {
  it("역할마다 오는 알림과 때", async () => {
    const { pushKinds } = await import("@/components/push-settings");
    expect(pushKinds({ role: "leader", leadsGroup: true }).map(([w]) => w)).toEqual(["목장보고서를 아직 안 냈을 때", "목장 리더가 목장보고서를 냈을 때", "목사님이 확인하거나 한마디를 남겼을 때", "목장 이동 신청이 오거나 처리됐을 때", "우리 목장에 새가족이 들어왔을 때"]);
    expect(pushKinds({ role: "pastor", leadsGroup: false })).toEqual([["지난주 목장보고서 정리", "수요일 아침 7시"], ["목장이 목장보고서를 냈을 때", "바로"], ["앱 쓰는 리더가 없는 목장의 목장 이동 신청", "바로"], ["목장에 새가족이 들어왔을 때", "바로"]]);
    expect(pushKinds({ role: "admin", leadsGroup: true }).length).toBe(7);
    expect(pushKinds({ role: "officer", leadsGroup: false })).toEqual([]);
  });
});
