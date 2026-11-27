"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Gugu } from "@/components/gugu";
import { useStatusTop } from "@/components/theme-color";
import { currentDisplayMode } from "@/lib/display-mode";
import { WORLD_SKY } from "@/lib/system-bar";
import { toPayload, type WorldPayload } from "@/lib/world-state";

import { worldBuy, worldSaveAvatarShot, worldSaveLook, worldSaveRoomShot, worldSetRoom, worldSetVillage, type WorldActionResult } from "./actions";
import { leaveWorld } from "@/lib/nav-history";
import { enterWorldFullscreen, leaveWorldFullscreen, lockLandscape, worldFullscreenWanted, worldLockWanted } from "@/lib/world-fullscreen";

import { startWorldLive, toLivePos, type LiveRole, type WorldLive } from "./world-live";

/** 월드 본체 — 같은 출처의 시안 페이지. ?embed 면 자기 불러오기 화면을 숨기고 진행·준비·나가기를 알려 온다. */
export const WORLD_SRC = "/rodem-world/index.html?embed=1";
/** 이만큼 지나도 준비가 안 오면 실패 화면(다시 시도 · 홈으로). */
export const WORLD_TIMEOUT_MS = 25_000;
/** 떠날 때 막 찍은 아바타 사진 저장을 이만큼까지 기다린다 — 그 뒤 정보 탭을 열면 새 모습이 보이게 */
const LEAVE_SAVE_MS = 4_000;
/** 불러오기 화면을 최소한 이만큼은 보여준다 — 순식간에 깜빡 지나가면 오히려 어색하다. */
const MIN_SHOW_MS = 1_400;

type WorldMessage = {
  source: "rodem-world";
  event: "boot" | "progress" | "ready" | "exit" | "report" | "buy" | "setVillage" | "setRoom" | "saveLook" | "live" | "look" | "me" | "act" | "roomShot" | "avatarShot" | "leaving" | "fullscreen";
  k?: unknown; // act — 몸짓 종류(하이파이브)
  to?: unknown; // act — 받는 사람 · leaving — 떠나는 곳(exit · report)
  i?: unknown; // act — 놀아 준 동물 번호
  on?: boolean; // live — 함께 보기 켜기 · 끄기
  value?: number;
  req?: number; // 부탁(buy·setVillage·saveLook) 번호 — 답에 그대로 붙여 돌려준다
  item?: unknown;
  fence?: unknown;
  slots?: unknown;
  house?: unknown; // setRoom — 마을 자리 번호
  image?: unknown; // roomShot · avatarShot — 우리 목장 집 안 · 내 아바타 사진(WebP data URL). exit · report 에도 막 찍은 아바타 사진이 붙어 올 수 있다
  // leaving — 떠나는 곳(exit · report). 월드가 생김새를 마저 저장하는 동안 덮개부터 씌운다
  look?: unknown;
};

/**
 * 월드에 넘기는 실제 정보 — 목장 이름(번호 순), 내 목장 자리(없으면 -1), 이번 주 우리 목장 보고서 상태,
 * 그리고 DB 상태(열매·가진 물건·모든 마을 꾸밈·내 생김새, World 4)
 */
export type WorldInit = {
  groups: string[];
  mine: number;
  week: { submitted: boolean; skipped: boolean } | null;
  world: WorldPayload | null;
  /** 목장 탭 배경(집 안 사진)이 아직 없으면 "need" — 월드가 자리 잡은 뒤 한 장 찍어 보낸다 */
  roomShot?: "need" | null;
  /** 정보 탭 배경(내 아바타 사진)이 아직 없으면 "need" */
  avatarShot?: "need" | null;
  /** 들어오자마자 꾸미기 창을 연다(정보 탭 배경 · 상점 '입어 보기') */
  open?: "dress" | null;
  /** 꾸미기에서 바로 입혀 볼 소품 */
  tryOn?: string | null;
};

function isWorldMessage(e: MessageEvent): e is MessageEvent<WorldMessage> {
  return e.origin === window.location.origin && typeof e.data === "object" && e.data !== null && e.data.source === "rodem-world";
}

/** 불러오는 동안 바뀌는 한 줄 — 진행에 따라. */
export function stageText(p: number): string {
  if (p < 0.3) return "숲에 나무를 심고 있어요";
  if (p < 0.6) return "목장들을 짓고 있어요";
  if (p < 0.92) return "양들을 깨우고 있어요";
  return "거의 다 왔어요";
}

/**
 * /world 의 껍데기 — 전체 화면 iframe 위에 불러오기 화면을 덮어 두었다가, 월드가 '준비' 를 알리면 걷어낸다.
 *   진행    월드가 보내는 값(키트 둘을 받을 때마다)과, 그 전의 느린 자체 진행 중 큰 쪽. 구구가 로뎀나무로 날아오고 나무에 꽃이 핀다
 *   나가기  월드의 '‹ 홈으로' → 홈(/)
 *   보고서  월드의 '보고서 쓰기' → 진짜 작성 화면(reportHref). 없으면(운영자) 무시
 *   실패    WORLD_TIMEOUT_MS 안에 준비가 안 오면 다시 시도 · 홈으로
 * 메시지는 같은 출처에서 온 것만 받는다.
 */
export function WorldShell({
  reportHref,
  stats = false,
  props = false,
  init = null,
  groupIds = [],
  live = null,
}: {
  reportHref: string | null;
  stats?: boolean;
  /** 소품 시험(?props) — 월드에 그대로 넘긴다 */
  props?: boolean;
  init?: WorldInit | null;
  groupIds?: string[];
  /** 함께 걷기 — 내 계정 id · 역할(없으면 채널에 들어가지 않는다) */
  live?: { userId: string; role: LiveRole; name?: string | null } | null;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // 안드로이드 상태바 — 월드는 밝기와 상관없이 낮이라 하늘색 하나(2026-11-09)
  useStatusTop(WORLD_SKY);
  // 노치 · 홈 막대 · 둥근 모서리 자리(safe-area) 재는 막대 — iframe 안에서는 env(safe-area-inset-*) 가 0 이라 여기서 재서 넘긴다
  const probeRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [real, setReal] = useState(0);
  const [creep, setCreep] = useState(0.04);
  const [phase, setPhase] = useState<"loading" | "leaving" | "ready" | "failed">("loading");
  // 월드를 떠나는 중 — 다음 화면이 그려질 때까지 하늘 덮개를 씌운다(그 사이 월드가 하얗게 멈춰 보이지 않게)
  const [departing, setDeparting] = useState<string | null>(null);
  // 메시지 처리기는 시도(attempt)마다 한 번만 건다 — 라우터·링크가 바뀌어도 준비 타이머가 끊기지 않게 ref 로 읽는다
  const nav = useRef({ router, reportHref, init, groupIds, live });
  useEffect(() => {
    nav.current = { router, reportHref, init, groupIds, live };
  }, [router, reportHref, init, groupIds, live]);
  // 월드는 늘 가로(2026-10-18) — 세로로 든 휴대폰이면 월드 판을 돌려 그린다. 여백(insets)도 돌린 방향으로 넘긴다
  const turn = useForcedLandscape();
  const turnRef = useRef(turn);
  const resendInsets = useRef<() => void>(() => {});
  useEffect(() => {
    turnRef.current = turn;
    resendInsets.current();
  }, [turn]);

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  // 안드로이드 — 들어오면 가로 고정을 시도하고(성공하면 판을 돌려 그리지 않는다), 떠나면 전체 화면 · 가로 고정을 푼다(lib/world-fullscreen, 2026-11-25)
  useEffect(() => {
    if (!worldLockWanted(navigator.userAgent)) return;
    void lockLandscape();
    return () => leaveWorldFullscreen();
  }, []);

  useEffect(() => {
    const started = performance.now();
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => setCreep((c) => c + (0.82 - c) * 0.025), 120);
    const timeout = setTimeout(() => setPhase((p) => (p === "loading" ? "failed" : p)), WORLD_TIMEOUT_MS);

    // 월드가 '시작'(boot)이나 '준비'(ready)를 알리면 실제 정보를 같은 출처로만 넘긴다(둘 다 보내도 월드는 같은 값을 다시 적용할 뿐)
    const sendInit = () => {
      const d = nav.current.init;
      if (d) frameRef.current?.contentWindow?.postMessage({ source: "ninetynine", event: "init", ...d }, window.location.origin);
      sendInsets();
      sendFs();
    };
    // 월드 안 '전체 화면' 단추 — 전체 화면이 적용되지 않은 안드로이드 홈 화면 앱(standalone)에서, 지금 전체 화면이 아닐 때만 보인다
    // (새로고침 · 쓸어 넘기기 · 뒤로로 풀린 경우). 아이폰 · 데스크톱은 늘 숨김
    const fsWanted = () => worldFullscreenWanted(navigator.userAgent, currentDisplayMode());
    const sendFs = () => {
      const show = fsWanted() && document.fullscreenEnabled === true && !document.fullscreenElement;
      frameRef.current?.contentWindow?.postMessage({ source: "ninetynine", event: "fsButton", show }, window.location.origin);
    };
    // 월드는 화면 끝까지 그리고, 단추·탭·패널만 이 값만큼 안쪽으로 둔다(디자인 2). 회전·크기가 바뀌면 다시 보낸다
    const sendInsets = () => {
      const el = probeRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const px = (v: string) => Math.max(0, Math.round(parseFloat(v) || 0));
      const [t, r, b, l] = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
      // 돌려 그릴 때(시계 방향 90°) 월드의 왼쪽은 화면 위(노치), 오른쪽은 화면 아래(홈 막대), 위는 화면 오른쪽, 아래는 화면 왼쪽
      const ins = turnRef.current ? { top: r, right: b, bottom: l, left: t } : { top: t, right: r, bottom: b, left: l };
      frameRef.current?.contentWindow?.postMessage({ source: "ninetynine", event: "insets", ...ins }, window.location.origin);
    };
    resendInsets.current = sendInsets;
    const onResize = () => setTimeout(sendInsets, 120); // 회전 직후에는 safe-area 값이 한 박자 늦게 바뀐다
    // 전체 화면이 켜지고 꺼지면 막대 자리(html[data-sbar]:fullscreen)가 바뀐다 — 다시 재서 넘기고 단추도 고친다
    const onFullscreen = () => {
      sendFs();
      setTimeout(sendInsets, 120);
    };
    const reply = (req: number, r: WorldActionResult) => {
      const world = r.ok && r.state ? toPayload(r.state, nav.current.groupIds) : null;
      frameRef.current?.contentWindow?.postMessage(
        { source: "ninetynine", event: "result", req, ok: r.ok, message: r.ok ? null : r.message, world },
        window.location.origin,
      );
    };
    // 월드의 부탁 — 사기 · 꾸미기 · 생김새 저장. 판정은 서버 액션 → DB 함수가 한다
    const ask = (m: WorldMessage) => {
      if (typeof m.req !== "number") return;
      const req = m.req;
      const call =
        m.event === "buy"
          ? worldBuy(String(m.item))
          : m.event === "setVillage"
            ? worldSetVillage(String(m.fence), Array.isArray(m.slots) ? (m.slots as (string | null)[]) : [])
            : m.event === "setRoom"
              ? worldSetRoom(Number(m.house), Array.isArray(m.slots) ? (m.slots as (string | null)[]) : [])
              : worldSaveLook(m.look);
      call.then((r) => reply(req, r)).catch(() => reply(req, { ok: false, message: "연결이 끊겼어요. 잠시 뒤 다시 해 보세요." }));
    };
    // 함께 걷기(2026-10-14) — 월드가 '켜기' 를 알리면 채널에 들어가고, 화면이 숨으면(앱 전환 · 잠금) 나왔다가 돌아오면 다시 들어간다
    let live: WorldLive | null = null;
    let liveWanted = false;
    let lastLook: unknown = null;
    const toWorld = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ source: "ninetynine", ...msg }, window.location.origin);
    const liveStart = () => {
      const who = nav.current.live;
      if (live || !who || document.visibilityState === "hidden") return;
      live = startWorldLive({ userId: who.userId, role: who.role, g: nav.current.init?.mine ?? -1, name: who.name ?? null }, toWorld);
      if (lastLook) live.setLook(lastLook);
    };
    const liveStop = () => {
      live?.stop();
      live = null;
    };
    const onVisible = () => (document.visibilityState === "hidden" ? liveStop() : liveWanted && liveStart());
    function onMessage(e: MessageEvent) {
      if (!isWorldMessage(e)) return;
      const m = e.data;
      if (m.event === "live") {
        liveWanted = m.on === true;
        if (liveWanted) liveStart();
        else liveStop();
        return;
      }
      if (m.event === "look") {
        lastLook = m.look ?? null;
        live?.setLook(lastLook);
        return;
      }
      if (m.event === "act") {
        // 몸짓 — 하이파이브 · 손 흔들기는 받는 사람(to), 놀아 주기는 동물 번호(i)
        if ((m.k === "five" || m.k === "wave") && typeof m.to === "string" && m.to.length < 64) live?.act(m.k, m.to);
        else if (m.k === "play" && Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < 100) live?.act("play", null, m.i as number);
        return;
      }
      if (m.event === "me") {
        const p = toLivePos(m as unknown as Record<string, unknown>);
        if (p) live?.send(p);
        return;
      }
      if (m.event === "fullscreen") {
        // 월드 안 '전체 화면' 단추 — 누른 손길이 부모 창까지 이어져(크롬) 여기서 부를 수 있다
        if (fsWanted()) void enterWorldFullscreen();
        return;
      }
      if (m.event === "roomShot" || m.event === "avatarShot") {
        // 목장 탭 · 정보 탭 배경 — 저장만 하고 월드에는 알리지 않는다
        void (m.event === "roomShot" ? worldSaveRoomShot(m.image) : worldSaveAvatarShot(m.image));
        return;
      }
      // 떠나기 — 덮개를 먼저 씌우고, 월드가 넘긴 아바타 사진이 있으면 저장을 기다렸다가(늦어도 LEAVE_SAVE_MS) 옮긴다
      const reportHref = nav.current.reportHref;
      const leaveText = m.to === "exit" || m.event === "exit" ? "홈으로 돌아가는 중" : "목장보고서로 가는 중";
      const savedShot = () =>
        typeof m.image === "string"
          ? Promise.race([worldSaveAvatarShot(m.image).catch(() => null), new Promise((r) => setTimeout(r, LEAVE_SAVE_MS))])
          : Promise.resolve();
      if (m.event === "leaving") {
        if (m.to === "exit" || (m.to === "report" && reportHref)) setDeparting(leaveText);
      } else if (m.event === "boot") sendInit();
      else if (m.event === "buy" || m.event === "setVillage" || m.event === "setRoom" || m.event === "saveLook") ask(m);
      else if (m.event === "progress" && typeof m.value === "number") setReal((r) => Math.max(r, Math.min(1, m.value!)));
      else if (m.event === "ready") {
        sendInit();
        setReal(1);
        clearTimeout(timeout);
        readyTimer = setTimeout(() => {
          setPhase("leaving");
          leaveTimer = setTimeout(() => {
            setPhase("ready");
            frameRef.current?.focus();
          }, 520);
        }, Math.max(0, MIN_SHOW_MS - (performance.now() - started)));
      } else if (m.event === "exit") {
        setDeparting(leaveText);
        if (worldLockWanted(navigator.userAgent)) leaveWorldFullscreen(); // '홈으로' — 전체 화면 · 가로 고정을 먼저 푼다
        void savedShot().then(() => leaveWorld(null, nav.current.router)); // 월드 칸(맨 아래)을 홈으로 되돌린다 — 기록을 더 쌓지 않는다(lib/nav-history)
      } else if (m.event === "report") {
        if (!reportHref) {
          void savedShot(); // 운영자 — 갈 목장보고서는 없어도 사진은 남긴다
          return;
        }
        setDeparting(leaveText);
        if (worldLockWanted(navigator.userAgent)) leaveWorldFullscreen();
        void savedShot().then(() => leaveWorld(reportHref, nav.current.router)); // 목장보고서에서 뒤로 하면 홈(월드를 다시 불러오지 않게)
      }
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      liveStop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreen);
      clearInterval(tick);
      clearTimeout(timeout);
      clearTimeout(readyTimer);
      clearTimeout(leaveTimer);
    };
  }, [attempt]);

  const progress = Math.max(real, Math.min(creep, 0.85));

  function retry() {
    setReal(0);
    setCreep(0.04);
    setPhase("loading");
    setAttempt((a) => a + 1);
  }

  return (
    // 월드는 화면 끝까지(노치·홈 막대 아래까지) 그린다. 단추·탭이 가리지 않게 safe-area 값은 재서 월드에 넘긴다(sendInsets)
    // data-world-ready — 다 뜬 뒤에 뒤로 막기 덫을 덮는다(lib/nav-history — 아이폰 밀기 미리보기에 불러오기 화면이 찍히지 않게)
    <div className="fixed inset-0 overflow-hidden bg-[var(--rw-sky-low)]" data-world-ready={phase === "ready" ? "" : undefined}>
      <div
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible fixed inset-0 pt-[var(--nn-safe-top)] pr-[env(safe-area-inset-right)] pb-[var(--nn-safe-bottom)] pl-[env(safe-area-inset-left)]"
      />
      <div
        className="absolute top-0 left-0 overflow-hidden"
        data-testid="world-stage"
        data-turned={turn ? "true" : "false"}
        style={
          turn
            ? { width: turn.h, height: turn.w, transformOrigin: "0 0", transform: `translateX(${turn.w}px) rotate(90deg)` }
            : { width: "100%", height: "100%" }
        }
      >
        <iframe
          key={attempt}
          ref={frameRef}
          src={`${WORLD_SRC}${stats ? "&stats=1" : ""}${props ? "&props=1" : ""}`}
          title="로뎀 월드"
          className="block h-full w-full border-0"
          data-testid="world-frame"
        />
        {departing ? (
          <Departing text={departing} />
        ) : phase === "ready" ? null : (
          <LoadingScreen
            progress={progress}
            leaving={phase === "leaving"}
            failed={phase === "failed"}
            onRetry={retry}
            onHome={() => {
              setDeparting("홈으로 돌아가는 중");
              if (worldLockWanted(navigator.userAgent)) leaveWorldFullscreen();
              leaveWorld(null, router);
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 세로로 든 휴대폰(손가락으로 쓰는 화면)이면 화면 크기를 돌려준다 — 월드 판을 이 크기의 가로로 돌려 그린다.
 * 휴대폰을 왼쪽으로 눕히면 바로 보인다. 회전 잠금을 꺼 둔 휴대폰이 실제로 가로가 되면 null(이미 가로라 돌리지 않는다).
 * 손가락 좌표는 브라우저가 돌린 판 기준으로 iframe 안에 넘겨주므로 월드는 그냥 가로 화면이라고 여긴다.
 */
function useForcedLandscape() {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(orientation: portrait) and (pointer: coarse)");
    const on = () => setBox(mq.matches ? { w: window.innerWidth, h: window.innerHeight } : null);
    on();
    mq.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return box;
}

/**
 * 떠나는 덮개 — 월드에서 홈 · 보고서로 갈 때, 다음 화면이 그려질 때까지(구구 테마, 2026-10-13 다듬음).
 * 만화 동산 대신 깊은 하늘빛 그라데이션 위에 부드러운 빛 번짐과 천천히 떠도는 빛 알갱이 — 차분하고 고급스럽게.
 * 가운데 구구가 날아가고(보고서로 갈 때는 부리 앞에 편지 한 통), 아래에 둥근 글씨 한 줄과 작은 설명, 점 셋.
 */
export function Departing({ text }: { text: string }) {
  const letter = text.startsWith("목장보고서");
  return (
    <div
      className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(120%_80%_at_50%_42%,#5aa9e6_0%,#2f78bd_55%,#1d4f86_100%)] text-white"
      data-testid="world-departing"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute top-1/2 left-1/2 size-[440px] -translate-x-1/2 -translate-y-[58%] rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.32)_0%,rgb(255_255_255/0)_65%)]" />
        {[
          [12, 22, 90, 0],
          [78, 16, 60, 1.2],
          [86, 64, 110, 2.1],
          [18, 74, 70, 3],
          [52, 86, 50, 1.7],
        ].map(([x, y, s, d]) => (
          <span
            key={`${x}-${y}`}
            className="gg-mote absolute rounded-full bg-white/10 blur-[2px]"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${-d}s` }}
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center gap-4">
        <div className="gg-fly-across relative">
          <div className="gg-bob relative">
            <Gugu view="fly" size={118} />
            {letter ? (
              <svg viewBox="0 0 30 22" className="absolute top-[44px] -left-[24px] h-[24px] w-[33px] -rotate-12 drop-shadow-[0_2px_3px_rgb(0_0_0/0.18)]" aria-hidden>
                <rect x="1" y="1" width="28" height="20" rx="3.5" fill="#fffdf6" stroke="#d9e2ee" strokeWidth="1.6" />
                <path d="M2.5 3 L15 12 L27.5 3" fill="none" stroke="#c8d1e4" strokeWidth="1.6" strokeLinejoin="round" />
                <circle cx="15" cy="13.5" r="3" fill="#ef5f69" />
              </svg>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="gg-display text-[26px] tracking-wide [text-shadow:0_2px_12px_rgb(10_40_80/0.35)]" role="status">
            {text}
          </p>
          <p className="text-[13px] font-medium text-white/75">{letter ? "구구가 편지를 들고 날아가요" : "구구가 집으로 데려다줘요"}</p>
          <span className="gg-dots mt-1 text-white/80" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 불러오기 화면(2026-10-25) — 월드에서 찍은 가로 한 장(마을 · 연못 · 오리, public/home/hd-world-load.webp)을 깔고,
 * 왼쪽 하늘 자리에 흰 글씨 '로뎀 월드로 가는 중' · 지금 하는 일 한 줄 · 진행 막대(구구가 막대 끝을 따라 난다).
 * 그림은 다른 탭 머리와 같은 결 — 월드를 크게 그려 줄인 원본을 그대로(unoptimized), 글씨 쪽만 살짝 어둡게.
 * 가로(돌려 그린 판 포함)에서는 글을 노치 · 둥근 모서리 자리만큼 더 안쪽에서 시작한다(돌린 판의 왼쪽 = 화면 위).
 */
export function LoadingScreen({
  progress,
  leaving,
  failed,
  onRetry,
  onHome,
}: {
  progress: number;
  leaving: boolean;
  failed: boolean;
  onRetry: () => void;
  onHome: () => void;
}) {
  const bar = Math.max(6, progress * 100);
  return (
    <div
      className={`absolute inset-0 isolate overflow-hidden bg-[var(--rw-sky-low)] text-white transition-opacity duration-500 ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
      data-testid="world-loading"
    >
      <Image src="/home/hd-world-load.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(rgb(8_30_60/0.38),transparent_62%)] short-land:bg-[linear-gradient(90deg,rgb(8_30_60/0.42),transparent_58%)]"
      />

      <div className="relative mx-auto flex max-w-sm flex-col items-center px-6 pt-[calc(var(--nn-safe-top)+11vh)] text-center [text-shadow:0_2px_12px_rgb(0_0_0/0.35)] short-land:mx-0 short-land:ml-[calc(max(var(--nn-safe-top),env(safe-area-inset-left))+28px)] short-land:items-start short-land:px-0 short-land:pt-[16vh] short-land:text-left">
        {failed ? (
          <>
            <Gugu view="side" mood="sleepy" size={56} />
            <p className="gg-display mt-2 text-[28px] leading-tight">월드를 불러오지 못했어요</p>
            <p className="mt-2 text-sm font-semibold text-white/90">인터넷 연결을 확인하고 다시 시도해 주세요.</p>
            <div className="mt-6 flex items-center gap-3 [text-shadow:none]">
              <button type="button" onClick={onRetry} className="gg-btn gg-btn-white !border-white px-6 text-[#2c7a2f]">
                다시 시도
              </button>
              <button type="button" onClick={onHome} className="h-11 rounded-full px-4 text-sm font-semibold text-white underline underline-offset-4">
                홈으로
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="gg-display text-[30px] leading-tight">로뎀 월드로 가는 중</p>
            <p className="mt-2 text-sm font-semibold text-white/90" role="status" aria-live="polite">
              {stageText(progress)}
            </p>
            {/* 진행 막대 — 구구가 막대 끝을 따라 날아간다 */}
            <div className="relative mt-12 w-[220px]">
              <span
                aria-hidden
                className="absolute bottom-full mb-1 transition-[left] duration-300 ease-out"
                style={{ left: `calc(${bar}% - 24px)` }}
              >
                <span className="gg-bob block">
                  <Gugu view="fly" size={40} />
                </span>
              </span>
              <div
                role="progressbar"
                aria-label="로뎀 월드 불러오기"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="gg-progress w-full !bg-white/45 shadow-[0_2px_10px_rgb(0_0_0/0.15)]"
              >
                <span style={{ width: `${bar}%` }} />
              </div>
            </div>
            <button type="button" onClick={onHome} className="mt-5 text-xs font-semibold text-white/85 underline underline-offset-4">
              홈으로 돌아가기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
