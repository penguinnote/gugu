"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { currentDisplayMode } from "@/lib/display-mode";
import { SAMSUNG_BARS_KEY } from "@/lib/samsung-bars";
import { VIEWPORT_FIT_KEY, withViewportFit, type ViewportFit } from "@/lib/viewport-fit";
import { lockLandscape, unlockOrientation } from "@/lib/world-fullscreen";

type Row = [string, string];

/** env() 값을 잰다 — 없는 이름이면 대신 값(-1)이 나온다 */
function envPx(probe: HTMLDivElement, name: string): string {
  probe.style.height = `env(${name}, 9999px)`;
  const h = probe.getBoundingClientRect().height;
  return h >= 9999 ? "지원 안 함" : `${Math.round(h * 10) / 10}px`;
}

/** 변수(--nn-safe-*)가 지금 계산된 값 */
function varPx(probe: HTMLDivElement, name: string): string {
  probe.style.height = `var(${name})`;
  return `${Math.round(probe.getBoundingClientRect().height * 10) / 10}px`;
}


function viewportContent(): string {
  return document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
}

/**
 * 진단 값 · 맨 아래 빨간 막대 · viewport-fit 바꿔 보기 · 값 복사. 빨간 막대가 내비게이션 바에 가리면 화면이 막대 밑까지 그려지고 있는 것이다.
 */
export function InsetsProbe() {
  const probe = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState(false);
  // 가로 고정 시도 결과 — 성공 · 오류 이름
  const [lockResult, setLockResult] = useState("시도 안 함");

  const measure = useCallback(() => {
    const p = probe.current;
    if (!p) return;
    const fit = /viewport-fit\s*=\s*([a-z-]+)/.exec(viewportContent())?.[1] ?? "(없음)";
    let override = "";
    try {
      override = sessionStorage.getItem(VIEWPORT_FIT_KEY) ?? "";
    } catch {}
    let sbarPick = "";
    try {
      sbarPick = sessionStorage.getItem(SAMSUNG_BARS_KEY) ?? "";
    } catch {}
    const sbar = document.documentElement.hasAttribute("data-sbar");
    setRows([
      ["display-mode", currentDisplayMode()],
      ["fullscreenEnabled", String(document.fullscreenEnabled === true)],
      ["전체 화면", document.fullscreenElement ? "켜짐" : "꺼짐"],
      ["screen.orientation.type", screen.orientation?.type ?? "없음"],
      ["가로 고정", lockResult],
      ["viewport-fit", `${fit}${override ? ` (직접 고름: ${override})` : ""}`],
      ["data-sbar", `${sbar ? "켜짐" : "꺼짐"}${sbarPick ? ` (직접 고름: ${sbarPick})` : ""}`],
      ["--nn-safe-top", varPx(p, "--nn-safe-top")],
      ["--nn-safe-bottom", varPx(p, "--nn-safe-bottom")],
      ["safe-area-inset-top", envPx(p, "safe-area-inset-top")],
      ["safe-area-inset-bottom", envPx(p, "safe-area-inset-bottom")],
      ["safe-area-max-inset-bottom", envPx(p, "safe-area-max-inset-bottom")],
      ["innerHeight", `${innerHeight}px`],
      ["visualViewport.height", visualViewport ? `${Math.round(visualViewport.height * 10) / 10}px` : "없음"],
      ["screen.width", `${screen.width}px`],
      ["screen.height", `${screen.height}px`],
      ["screen.availHeight", `${screen.availHeight}px`],
      ["outerHeight", `${outerHeight}px`],
      ["devicePixelRatio", String(devicePixelRatio)],
      ["userAgent", navigator.userAgent],
      ["viewport meta", viewportContent()],
    ]);
  }, [lockResult]);

  useEffect(() => {
    measure();
    const on = () => setTimeout(measure, 150);
    addEventListener("resize", on);
    visualViewport?.addEventListener("resize", on);
    document.addEventListener("fullscreenchange", on);
    screen.orientation?.addEventListener?.("change", on);
    return () => {
      removeEventListener("resize", on);
      visualViewport?.removeEventListener("resize", on);
      document.removeEventListener("fullscreenchange", on);
      screen.orientation?.removeEventListener?.("change", on);
    };
  }, [measure]);

  const setFit = (fit: ViewportFit | null) => {
    try {
      if (fit) sessionStorage.setItem(VIEWPORT_FIT_KEY, fit);
      else sessionStorage.removeItem(VIEWPORT_FIT_KEY);
    } catch {}
    if (!fit) {
      location.reload(); // 원래 값(기기에 맞춘 것)은 머리 스크립트가 다시 정한다
      return;
    }
    const m = document.querySelector('meta[name="viewport"]');
    if (m) m.setAttribute("content", withViewportFit(m.getAttribute("content") ?? "", fit));
    document.documentElement.setAttribute("data-vfit", fit);
    setTimeout(measure, 300);
  };

  /** 삼성 인터넷 대체값 켜고 끄기 — null 이면 기기대로(머리 스크립트가 다시 정한다) */
  const setSbar = (on: boolean | null) => {
    try {
      if (on === null) sessionStorage.removeItem(SAMSUNG_BARS_KEY);
      else sessionStorage.setItem(SAMSUNG_BARS_KEY, on ? "on" : "off");
    } catch {}
    if (on === null) {
      location.reload();
      return;
    }
    if (on) document.documentElement.setAttribute("data-sbar", "");
    else document.documentElement.removeAttribute("data-sbar");
    setTimeout(measure, 100);
  };

  /** 전체 화면 켜기 · 끄기 — 누른 손길 안에서 부른다 */
  const setFullscreen = (on: boolean) => {
    const p = on ? document.documentElement.requestFullscreen?.({ navigationUI: "hide" }) : document.fullscreenElement ? document.exitFullscreen() : undefined;
    void p?.catch((e: unknown) => setLockResult(`전체 화면 실패: ${e instanceof Error ? e.name : "Error"}`));
  };
  const tryLock = async () => {
    const err = await lockLandscape();
    setLockResult(err ? `실패: ${err}` : "성공");
  };

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.getElementById("insets-text") as HTMLTextAreaElement | null;
      ta?.select();
    }
  };

  return (
    <>
      <div ref={probe} aria-hidden className="pointer-events-none invisible fixed top-0 left-0 w-px" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-2xl bg-[var(--gg-card)] p-4 text-[13px] shadow-[var(--gg-card-shadow)]" data-testid="insets-values">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-muted">{k}</dt>
            <dd className="min-w-0 break-all tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setFit("cover")}>
          cover
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setFit("auto")}>
          auto
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setFit(null)}>
          기기대로
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2" data-testid="insets-sbar">
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setSbar(true)}>
          대체값 켜기
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setSbar(false)}>
          대체값 끄기
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setSbar(null)}>
          기기대로
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2" data-testid="insets-fullscreen">
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setFullscreen(true)}>
          전체 화면 켜기
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => setFullscreen(false)}>
          전체 화면 끄기
        </button>
        <button type="button" className="gg-btn gg-btn-white gg-btn-sm !h-11" onClick={() => void tryLock()}>
          가로 고정 시도
        </button>
        <button
          type="button"
          className="gg-btn gg-btn-white gg-btn-sm !h-11"
          onClick={() => {
            unlockOrientation();
            setLockResult("풀었음");
          }}
        >
          가로 고정 풀기
        </button>
      </div>
      <button type="button" className="gg-btn gg-btn-sky gg-btn-sm !h-11" onClick={copy} data-testid="insets-copy">
        {copied ? "복사했어요" : "값 모두 복사"}
      </button>
      <textarea id="insets-text" readOnly value={text} rows={4} className="gg-field !text-[12px]" aria-label="진단 값" />
      {/* 화면 맨 아래에 붙은 빨간 막대 — 탭 막대보다 위에 그린다 */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] h-3 bg-[#ff2d2d]" data-testid="insets-bar" />
    </>
  );
}
