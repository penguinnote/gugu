"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Gugu } from "@/components/gugu";
import { detectInstallEnv, installSteps, INSTALL_SKIP_KEY, type Device, type InstallEnv, type IosBar, type Step } from "@/lib/install-env";

import * as M from "./mocks";

/**
 * 웹앱 설치 안내(2026-11-11 사용자 요청) — 휴대폰 브라우저로 링크를 열면 앱 대신 이 화면이 뜬다(layout.tsx 의 머리 스크립트가 <html data-install>).
 *   1) 어떤 휴대폰인지 묻는다(아이폰 · 갤럭시)
 *   2) 고른 기종 · 지금 브라우저에 맞는 단계를 한 장씩 — 그림에서 눌러야 할 곳이 라임으로 숨 쉰다, 아래 '다음'
 *   3) 끝 — 홈 화면의 구구를 눌러 연다
 * 갤럭시에서 브라우저가 설치 창을 주면(beforeinstallprompt) '설치하기' 단추 하나로 끝낸다.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type W = Window & { __ggInstall?: InstallPromptEvent };

const NEXT = "gg-btn gg-btn-sky w-full";
const SUB = "gg-btn gg-btn-white w-full";
const HL = "text-[var(--gg-sky-ink)]";

export function InstallGuide({ env: forcedEnv, canPrompt: forcedPrompt }: { env?: InstallEnv; canPrompt?: boolean } = {}) {
  const [env, setEnv] = useState<InstallEnv>(forcedEnv ?? { os: "other", browser: "other", safari: 0 });
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [manual, setManual] = useState(false);
  const [bar, setBar] = useState<IosBar | null>(null);
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (forcedEnv) return;
    // 브라우저는 붙은 뒤에만 안다 — 서버 그림은 첫 질문(기종)만이라 어긋나지 않는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv(detectInstallEnv(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    const w = window as W;
    if (w.__ggInstall) setPrompt(w.__ggInstall);
    const ready = () => setPrompt(w.__ggInstall ?? null);
    const installed = () => setIdx(Number.MAX_SAFE_INTEGER);
    addEventListener("gg-install-ready", ready);
    addEventListener("appinstalled", installed);
    return () => {
      removeEventListener("gg-install-ready", ready);
      removeEventListener("appinstalled", installed);
    };
  }, [forcedEnv]);

  const canPrompt = (forcedPrompt ?? Boolean(prompt)) && !manual;
  const steps = device ? installSteps(device, env, canPrompt, bar) : [];
  const at = Math.min(idx, steps.length - 1);
  const step = steps[at];
  const flags = { more: bar === "more", ios26: env.os !== "ios" || env.safari === 0 || env.safari >= 26 };

  const pick = (d: Device) => {
    setDevice(d);
    setIdx(0);
    setManual(false);
    setBar(null);
  };
  const pickBar = (b: IosBar) => {
    setBar(b);
    setIdx(at + 1);
  };
  const back = () => (at > 0 ? setIdx(at - 1) : setDevice(null));
  const next = () => setIdx(at + 1);
  const skip = () => {
    try {
      sessionStorage.setItem(INSTALL_SKIP_KEY, "1");
    } catch {}
    document.documentElement.removeAttribute("data-install");
  };
  const openOut = () => {
    const url = location.href;
    if (step === "kakao-out") location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    else {
      const u = new URL(url);
      location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin);
      setCopied(true);
    } catch {}
  };
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt().catch(() => {});
    const r = await prompt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (r.outcome === "accepted") next();
  };

  if (!device) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col items-center justify-center gap-7 pb-6 text-center">
          <div className="gg-bob">
            <Gugu mood="wave" size={132} title="손을 흔드는 구구" />
          </div>
          <div className="space-y-2">
            <h1 className="gg-display text-[30px] leading-tight text-[var(--gg-sky-ink)]">구구를 앱으로 설치해요</h1>
            <p className="text-[16px] font-semibold text-[var(--gg-section)]">어떤 휴대폰을 쓰세요?</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3">
            <Choice label="아이폰" onClick={() => pick("ios")} testId="install-ios">
              <PhoneArt kind="ios" />
            </Choice>
            <Choice label="갤럭시" onClick={() => pick("android")} testId="install-android">
              <PhoneArt kind="android" />
            </Choice>
          </div>
        </div>
        <button type="button" onClick={skip} className="mx-auto py-2 text-[14px] text-muted" data-testid="install-skip">
          웹에서 그냥 볼게요
        </button>
      </Frame>
    );
  }

  const s = STEP[step];
  const last = step === "done";
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label="이전" className="-ml-2 grid size-10 place-items-center rounded-full text-[var(--gg-section)]" data-testid="install-back">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex flex-1 justify-center gap-1.5 pr-8" aria-label={`${at + 1} / ${steps.length}단계`}>
          {steps.map((x, i) => (
            <span key={x} className={`h-2 rounded-full transition-all ${i === at ? "w-6 bg-[var(--gg-sky)]" : i < at ? "w-2 bg-[var(--gg-sky)]" : "w-2 bg-[var(--gg-line)]"}`} />
          ))}
        </div>
      </div>

      <div key={step} className={`gg-fade-in flex flex-1 gap-6 pt-5 ${step === "ios-pick" ? "flex-col-reverse justify-end" : "flex-col"}`} data-testid={`install-step-${step}`}>
        {step === "ios-pick" ? (
          // 묻는 단계는 질문이 위, 막대 그림 두 개가 아래(flex-col-reverse)
          <div className="flex flex-col gap-3">
            <BarChoice onClick={() => pickBar("share")} testId="install-bar-share" label="공유 단추가 있는 막대 선택">
              <M.IosBarShare />
            </BarChoice>
            <BarChoice onClick={() => pickBar("more")} testId="install-bar-more" label="⋯ 단추가 있는 막대 선택">
              <M.IosBarMore />
            </BarChoice>
          </div>
        ) : (
          s.mock(flags)
        )}
        <div className="space-y-1.5 px-1">
          <h2 className="text-[23px] leading-snug font-extrabold tracking-[-0.02em] break-keep">{s.title(HL)}</h2>
          {s.hint ? <p className="text-[15px] leading-snug text-muted break-keep">{s.hint}</p> : null}
        </div>
      </div>

      <div className="space-y-2 pt-4">
        {step === "kakao-out" ? (
          <button type="button" onClick={openOut} className={NEXT}>
            {device === "ios" ? "Safari로 열기" : "인터넷 앱으로 열기"}
          </button>
        ) : step === "and-chrome-open" ? (
          <button type="button" onClick={openOut} className={NEXT}>
            크롬으로 열기
          </button>
        ) : step === "ios-safari" ? (
          <button type="button" onClick={copy} className={NEXT}>
            {copied ? "복사했어요" : "링크 복사"}
          </button>
        ) : step === "ios-inapp" || step === "ios-pick" ? null : step === "and-prompt" ? (
          <>
            <button type="button" onClick={install} className={NEXT} data-testid="install-prompt">
              설치하기
            </button>
            <button type="button" onClick={() => setManual(true)} className={SUB}>
              직접 할게요
            </button>
          </>
        ) : last ? (
          <button type="button" onClick={() => setDevice(null)} className={SUB}>
            처음으로
          </button>
        ) : (
          <button type="button" onClick={next} className={NEXT} data-testid="install-next">
            다음
          </button>
        )}
      </div>
    </Frame>
  );
}

/** 화면 틀 — 앱 바닥색 위 가운데 한 줄(최대 384px), 시계 · 아래 막대 자리만큼 띄운다 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col px-6 pt-[calc(var(--nn-safe-top)+12px)] pb-[calc(var(--nn-safe-bottom)+20px)]" data-testid="install-guide">
      {children}
    </div>
  );
}

/** 사파리 막대 고르기 칸(2026-11-12 — 단추처럼 보이게) — 막대 그림 아래 라임 알약 '선택'(2026-11-12 사용자 요청), 테두리 · 누르면 회색 */
function BarChoice({ onClick, children, testId, label }: { onClick: () => void; children: ReactNode; testId: string; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="gg-card w-full overflow-hidden text-left ring-2 ring-[var(--gg-line)] ring-inset" data-testid={testId}>
      <span className="flex px-4 pt-5 pb-4">{children}</span>
      <span className="mx-3 mb-3 flex items-center justify-center rounded-full bg-[var(--gg-sky)] py-3 text-[16px] font-bold text-[var(--gg-on-sky)]">선택</span>
    </button>
  );
}

function Choice({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} className="gg-card flex flex-col items-center gap-3 px-3 pt-6 pb-5" data-testid={testId}>
      {children}
      <span className="text-[18px] font-bold">{label}</span>
    </button>
  );
}

/** 기종 고르기 그림 — 아이폰은 위 가운데 알약(다이내믹 아일랜드), 갤럭시는 동그란 카메라 구멍 */
function PhoneArt({ kind }: { kind: Device }) {
  return (
    <span aria-hidden className="relative block h-[92px] w-[50px] rounded-[14px] border-[3px] border-[var(--foreground)] bg-[var(--gg-sky-soft)]">
      {kind === "ios" ? (
        <span className="absolute top-[5px] left-1/2 h-[6px] w-[16px] -translate-x-1/2 rounded-full bg-[var(--foreground)]" />
      ) : (
        <span className="absolute top-[5px] left-1/2 size-[6px] -translate-x-1/2 rounded-full bg-[var(--foreground)]" />
      )}
    </span>
  );
}

const q = (hl: string, t: string) => <b className={hl}>&apos;{t}&apos;</b>;

const STEP: Record<Step, { title: (hl: string) => ReactNode; hint?: string; mock: (o: { more: boolean; ios26: boolean }) => ReactNode }> = {
  "kakao-out": { title: () => "카카오톡 안에서는 설치할 수 없어요", hint: "아래 단추로 열면 거기서 다시 안내해요", mock: () => <M.AppCard /> },
  "ios-inapp": { title: (hl) => <>오른쪽 위 ⋯ 를 누르고 {q(hl, "Safari로 열기")}를 눌러요</>, hint: "Safari에서 다시 안내해요", mock: () => <M.IosInApp /> },
  "ios-safari": { title: () => "Safari에서 열어야 설치할 수 있어요", hint: "링크를 복사해서 Safari 주소창에 붙여 넣어요", mock: () => <M.IosSafari /> },
  "ios-pick": { title: () => "Safari 아래쪽이 어떻게 보여요?", hint: "같은 모양을 골라 주세요", mock: () => null },
  "ios-more": { title: (hl) => <>아래 오른쪽 {q(hl, "⋯")} 를 눌러요</>, mock: () => <M.IosMore /> },
  "ios-share": {
    title: (hl) => <>{q(hl, "공유")}를 눌러요</>,
    mock: ({ more }) => <M.IosShare modern={more} />,
  },
  "ios-scroll": { title: () => "공유 창을 위로 쓸어 올려요", mock: () => <M.IosScroll /> },
  "ios-add": { title: (hl) => <>{q(hl, "홈 화면에 추가")}를 눌러요</>, mock: () => <M.IosAdd /> },
  "ios-confirm": { title: (hl) => <>오른쪽 위 {q(hl, "추가")}를 눌러요</>, mock: ({ ios26 }) => <M.IosConfirm ios26={ios26} /> },
  "and-chrome-open": { title: () => "크롬에서 열어야 설치할 수 있어요", hint: "크롬에서 다시 안내해요", mock: () => <M.AppCard /> },
  "and-prompt": { title: (hl) => <>{q(hl, "설치하기")}를 누르고 {q(hl, "설치")}를 눌러요</>, mock: () => <M.AppCard /> },
  "sam-menu": { title: (hl) => <>아래 오른쪽 {q(hl, "≡")} 를 눌러요</>, mock: () => <M.SamMenu /> },
  "sam-add": { title: (hl) => <>{q(hl, "현재 페이지 추가")}를 눌러요</>, mock: () => <M.SamAdd /> },
  "sam-home": { title: (hl) => <>{q(hl, "홈 화면")}을 눌러요</>, mock: () => <M.SamHome /> },
  "sam-confirm": { title: (hl) => <>{q(hl, "추가")}를 눌러요</>, mock: () => <M.SamConfirm /> },
  "chr-menu": { title: (hl) => <>오른쪽 위 {q(hl, "⋮")} 를 눌러요</>, mock: () => <M.ChrMenu /> },
  "chr-add": { title: (hl) => <>{q(hl, "홈 화면에 추가")}를 눌러요</>, hint: "'앱 설치'로 보이면 그걸 눌러요", mock: () => <M.ChrAdd /> },
  "chr-confirm": { title: (hl) => <>{q(hl, "설치")}를 눌러요</>, mock: () => <M.ChrConfirm /> },
  done: { title: () => "홈 화면의 구구를 눌러 열어요", mock: () => <M.HomeScreen /> },
};
