import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 첫 접속 동의(2026-11-13) — 두 가지 모두 체크해야 시작 단추가 켜진다 · 처리방침 링크 · 거절하면 로그아웃
 */
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/app/(tabs)/me/push-actions", () => ({ removePushSubscription: vi.fn() }));
const { TermsForm } = await import("@/app/terms/terms-form");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;

describe("TermsForm", () => {
  it("둘 다 체크해야 단추가 켜지고, 누르면 동의를 부른다 ★", async () => {
    const agree = vi.fn(async () => ({ ok: false as const, message: "저장하지 못했습니다." }));
    act(() => root.render(<TermsForm agree={agree} />));
    const btn = q<HTMLButtonElement>("[data-testid=terms-agree]");
    expect(btn.disabled).toBe(true);
    act(() => q<HTMLInputElement>("[data-testid=terms-mine]").click());
    expect(btn.disabled).toBe(true);
    act(() => q<HTMLInputElement>("[data-testid=terms-keep]").click());
    expect(btn.disabled).toBe(false);
    await act(async () => btn.click());
    expect(agree).toHaveBeenCalledOnce();
    expect(agree).toHaveBeenCalledWith(null);
    expect(host.textContent).toContain("저장하지 못했습니다.");
  });

  it("처리방침 링크와 거절(로그아웃) 단추", () => {
    act(() => root.render(<TermsForm agree={vi.fn()} />));
    expect(q("a[href='/privacy']").textContent).toBe("개인정보 처리방침 보기");
    expect(q("form[action='/auth/signout']").textContent).toContain("동의하지 않고 나가기");
  });

  it("명단과 연결된 계정이면 AI 선택 항목 — 지금 상태로 채우고, 체크하지 않아도 시작할 수 있다 ★", async () => {
    const agree = vi.fn(async () => ({ ok: false as const, message: "x" }));
    act(() => root.render(<TermsForm agree={agree} ai={false} />));
    const ai = q<HTMLInputElement>("[data-testid=terms-ai]");
    expect(ai.checked).toBe(false);
    act(() => q<HTMLInputElement>("[data-testid=terms-mine]").click());
    act(() => q<HTMLInputElement>("[data-testid=terms-keep]").click());
    expect(q<HTMLButtonElement>("[data-testid=terms-agree]").disabled).toBe(false);
    act(() => ai.click());
    await act(async () => q<HTMLButtonElement>("[data-testid=terms-agree]").click());
    expect(agree).toHaveBeenCalledWith(true);
  });

  it("이미 동의한 사람은 체크된 채로, 연결 안 된 계정은 항목이 없다", () => {
    act(() => root.render(<TermsForm agree={vi.fn()} ai={true} />));
    expect(q<HTMLInputElement>("[data-testid=terms-ai]").checked).toBe(true);
    act(() => root.render(<TermsForm agree={vi.fn()} ai={null} />));
    expect(host.querySelector("[data-testid=terms-ai]")).toBeNull();
  });
});
