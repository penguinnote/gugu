import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BAR_BG, STATUS_SKY, statusBarColor, underShade } from "@/lib/system-bar";
import { META_ID, StatusTop, ThemeColor } from "@/components/theme-color";
import manifest from "@/app/manifest";

/**
 * 안드로이드 시스템 막대 색(2026-11-09).
 *   · 순수 함수 — 화면 머리 색으로 상태바 색을 고른다(어두운 모드는 2026-11-10 뺐다)
 *   · ThemeColor — 맨 앞 <meta name="theme-color"> 를 머리 색에 맞춰 바꾼다
 *   · 매니페스트 theme_color(내비게이션 바)는 바닥색
 */

describe("상태바 색 고르기", () => {
  it("머리 색이 없으면 바닥색, 있으면 그 색", () => {
    expect(statusBarColor(null)).toBe(BAR_BG);
    expect(statusBarColor(STATUS_SKY)).toBe(STATUS_SKY);
  });

  it("그림 맨 위 색에 검은 그늘을 덮는다", () => {
    expect(underShade([136, 195, 244], 0.28)).toBe("#628cb0");
    expect(underShade([255, 255, 255], 0)).toBe("#ffffff");
    expect(underShade([255, 255, 255], 1)).toBe("#000000");
  });

  it("매니페스트 theme_color(내비게이션 바)는 바닥색", () => {
    expect(manifest().theme_color).toBe(BAR_BG);
  });

  it("어두운 모드가 없다 — 바닥색은 globals.css --background 하나, 어두운 색 묶음 · dark 변형이 없다", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(`--background: ${BAR_BG};`);
    expect(css).not.toMatch(/prefers-color-scheme|data-theme|@custom-variant dark/);
    expect(css).toContain("color-scheme: only light");
  });
});

describe("ThemeColor — meta theme-color", () => {
  let container: HTMLDivElement;
  let root: Root;

  const meta = () => document.getElementById(META_ID) as HTMLMetaElement | null;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // layout 이 그리는 자바스크립트 전 한 장 — 맨 앞의 한 장이 이것을 이겨야 한다
    document.head.innerHTML = '<meta name="theme-color" content="#f3f4f6">';
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals(); // 확인이 실패해도 다음 시험에 가짜 matchMedia 가 남지 않게
  });

  it("head 맨 앞에 한 장을 두고 바닥색으로 칠한다", async () => {
    await act(async () => root.render(<ThemeColor />));
    expect(document.head.firstElementChild).toBe(meta());
    expect(meta()?.getAttribute("name")).toBe("theme-color");
    expect(meta()?.hasAttribute("media")).toBe(false);
    expect(meta()?.content).toBe(BAR_BG);
  });

  it("기기가 다크 모드여도 바닥색 그대로", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })));
    await act(async () => root.render(<ThemeColor />));
    expect(meta()?.content).toBe(BAR_BG);
  });

  it("화면이 머리 색을 알리면 그 색, 화면이 사라지면 바닥색", async () => {
    await act(async () =>
      root.render(
        <>
          <ThemeColor />
          <StatusTop color={STATUS_SKY} />
        </>,
      ),
    );
    expect(meta()?.content).toBe(STATUS_SKY);
    await act(async () => root.render(<ThemeColor />));
    expect(meta()?.content).toBe(BAR_BG);
  });
});
