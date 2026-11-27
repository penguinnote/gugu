/**
 * 뒤로가기 구조(2026-10-15) — 아이폰 밀기 · 안드로이드 뒤로 · 화면 위 '‹ …' 가 모두 같은 규칙으로 움직이게.
 *
 *   층 0  홈(/)          바닥. 뒤로 해도 그대로 — 홈 위에 같은 주소의 기록을 한 칸 겹쳐 두고(덫), 아래 칸에 닿으면 다시 덮는다.
 *                         그래서 로그인 화면 · 이전 탭으로 빠져나가지 않고, 아이폰 밀기 미리보기에도 같은 홈이 보인다.
 *   층 1  탭 첫 화면      목장 · 상점 · 정보. 늘 홈 바로 위에 둔다 — 뒤로 = 홈. 탭끼리 옮겨도 쌓이지 않는다(갈아 끼운다).
 *   층 2+ 안쪽 화면       뒤로 = 들어온 곳(브라우저 기록 그대로).
 *   월드(/world)          맨 아래 칸이 된다(2026-11-10 사용자 요청 — 월드에선 뒤로 · 밀기로 홈에 가지 않고 '홈으로' 단추로만).
 *                         들어갈 때 기록 맨 아래 칸까지 되돌아가 그 칸을 월드로 갈아 끼우고, 그 위에 같은 주소의 덫을 덮는다.
 *                         아이폰 밀기 · 뒤로는 덫만 걷고 다시 덮는다(미리보기도 월드). 갤럭시는 뒤로를 한 번 누르면 '한 번 더 누르면 앱이 닫혀요'
 *                         — 2초 동안 덫을 덮지 않아, 그 사이 또 누르면 맨 아래 칸에서 뒤로라 앱이 닫힌다. 나갈 때(leaveWorld)는 맨 아래 칸을 홈으로 되돌린다.
 *
 * 기록마다 history.state.gg = { d: 층 } 을 붙인다. Next.js 가 바꾸는 기록(push · replace)도 거쳐 가도록 history 를 감싼다 —
 * 이 감싸기는 Next 의 것보다 먼저 걸린다(자식 효과가 부모 효과보다 먼저 돈다). Next 는 우리가 넣은 값을 지우지 않고 자기 값만 더한다.
 * 층마다 주소(trail)를 sessionStorage 에 적어 두어 '‹ 돌아가기' 와 저장 뒤 이동이 '들어온 곳' 이 맞는지 안다.
 */

type GG = { d: number; trap?: boolean; base?: boolean; solo?: boolean; world?: boolean };
type RouterLike = { push(href: string): void; replace(href: string): void; refresh(): void };
type HistoryFn = (data: unknown, unused: string, url?: string | URL | null) => void;

const KEY = "gg-trail";
/** 로그인 전 화면 — 처음 연 곳이어도 밑에 홈을 깔지 않는다 */
const OUTSIDE = ["/login", "/apply", "/auth"];

let depth = 0;
let trail: string[] = [];
let router: RouterLike | null = null;
let push0: HistoryFn | null = null;
let replace0: HistoryFn | null = null;
let pending: { kind: "push" | "replace"; href: string; at: number } | null = null;
let refreshAfterBack = false;
let lastAbsorb = 0;
let selfBack = false; // 앞 기록을 지우려고 우리가 누른 뒤로 — 갤럭시 '한 번 더' 셈에 넣지 않는다
let arming = false;
const UA = typeof navigator === "undefined" ? "" : navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(UA);
const WORLD = "/world";
/** 맨 아래 칸까지 되돌아가는 중이면 거기 닿았을 때 할 일(월드 들어가기 · 나가기) */
let toBase: (() => void) | null = null;
/** 월드로 들어가는 중 — 가는 길에 지나는 홈 칸에서 덫 · 안내를 하지 않게 */
let enteringWorld = false;
/** 뒤로(밀기)로 월드 맨 아래 칸에 닿았다 — settle 이 안내 · 덫을 정한다 */
let worldPopped = false;
let worldArmT: ReturnType<typeof setTimeout> | undefined;

/** 홈이 다 그려지면([data-home-ready]) 덫 칸을 덮는다 — 늦어도 4초 */
function armTrap(force = false) {
  if (arming) return;
  arming = true;
  const t0 = performance.now();
  // 덮을 수 있나 — 이미 덫 위면 그만. 다만 force(홈에 되돌아와 앞 기록을 지워야 할 때)는 '처음 연 홈'(solo) 위에도 덮는다
  const covered = () => { const g = ggOf(history.state); return !!g?.trap && !(force && g.solo); };
  const tick = () => {
    if (location.pathname !== "/" || covered() || !push0) {
      arming = false;
      return;
    }
    if (document.querySelector("[data-home-ready]") || performance.now() - t0 > 4000) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          arming = false;
          if (location.pathname === "/" && !covered()) push0!({ ...(history.state ?? {}), gg: { d: 0, trap: true } }, "", location.href);
        }),
      );
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 잠깐 뜨는 안내(갤럭시 '한 번 더 누르면 앱이 닫혀요') — 화면 아래 가운데, 1.8초 */
function hint(text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.setAttribute("role", "status");
  Object.assign(el.style, {
    position: "fixed", left: "50%", bottom: "calc(var(--nn-tabbar, 64px) + var(--nn-safe-bottom) + 18px)", transform: "translateX(-50%)",
    zIndex: "60", padding: "10px 16px", borderRadius: "999px", background: "rgba(35,43,58,.88)", color: "#fff", font: "600 14px/1.3 var(--font-sans, sans-serif)",
    whiteSpace: "nowrap", pointerEvents: "none", transition: "opacity .3s", opacity: "1",
  });
  document.body.appendChild(el);
  setTimeout(() => (el.style.opacity = "0"), 1500);
  setTimeout(() => el.remove(), 1850);
}

const here = () => location.pathname + location.search;
const pathOf = (url: string | URL | null | undefined) => {
  if (!url) return here();
  const u = new URL(String(url), location.href);
  return u.pathname + u.search;
};
function ggOf(s: unknown): GG | null {
  if (!s || typeof s !== "object") return null;
  const g = (s as { gg?: unknown }).gg;
  return g && typeof g === "object" && typeof (g as GG).d === "number" ? (g as GG) : null;
}
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(0, Math.max(0, depth) + 1)));
  } catch {
    /* 저장이 막힌 브라우저 — 이번 화면 동안만 기억 */
  }
}
function load() {
  try {
    const t: unknown = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    if (Array.isArray(t)) trail = t.map((x) => (typeof x === "string" ? x : ""));
  } catch {
    trail = [];
  }
}
/** 주소 비교 — 쿼리가 없는 링크면 경로만 본다(/groups 와 /groups?x 는 같은 곳) */
export function samePlace(a: string, b: string): boolean {
  if (b.includes("?")) return a === b;
  return a.split("?")[0] === b.split("?")[0];
}

/** 지금 기록이 어디에 있는지 맞춘다 — 처음 열 때 · 화면이 바뀔 때마다 · 뒤로/앞으로 뒤 */
export function settle() {
  if (!push0 || !replace0) return;
  const g = ggOf(history.state);
  const path = location.pathname;
  if (path === WORLD) {
    settleWorld(g);
    return;
  }
  if (enteringWorld || toBase) return; // 월드로 가는 길에 지나는 칸 — 건드리지 않는다
  if (path === "/") {
    if (g?.trap) {
      depth = 0;
      trail = ["/"];
      save();
      return;
    }
    // 아이폰 · 홈에서 처음 연 앱(뒤에 아무 기록도 없음) — 덫을 두지 않는다. 밀어도 갈 곳이 없어 아예 반응하지 않는다(2026-10-16)
    if (IOS && history.length === 1) {
      replace0({ ...(history.state ?? {}), gg: { d: 0, trap: true, solo: true } }, "", location.href);
      depth = 0;
      trail = ["/"];
      save();
      return;
    }
    // 갤럭시 · 뒤로를 눌러 아래 칸에 닿았다 — 한 번은 그대로(덫을 다시 덮고 안내), 2초 안에 또 누르면 앱 밖으로
    if (selfBack) selfBack = false;
    else if (ANDROID && g && g.d === -1) {
      if (Date.now() - lastAbsorb < 2000) {
        lastAbsorb = 0;
        history.back();
        return;
      }
      lastAbsorb = Date.now();
      hint("한 번 더 누르면 앱이 닫혀요");
    }
    // 아래쪽 홈(처음 연 홈 · 뒤로 와서 닿은 홈) — 같은 주소의 기록을 한 칸 겹쳐 덮는다. 화면은 그대로.
    //   덮는 것은 홈이 다 그려진 뒤에 — 아이폰은 떠나는 칸의 모습을 찍어 밀기 미리보기로 쓰므로, 불러오기 화면이 찍히지 않게
    replace0({ ...(history.state ?? {}), gg: { d: -1 } }, "", location.href);
    armTrap();
    depth = 0;
    trail = ["/"];
    save();
    return;
  }
  if (g) {
    depth = g.d;
    trail[depth] = here();
    save();
    return;
  }
  if (OUTSIDE.some((p) => path === p || path.startsWith(p + "/"))) return;
  // 처음 연 곳이 홈이 아니다(알림 · 링크) — 밑에 홈을 한 칸 깐다. 그 칸은 Next 가 모르는 칸이라 뒤로 오면 홈을 새로 불러온다
  const href = location.href;
  const st = history.state;
  replace0({ gg: { d: -1, base: true } }, "", "/");
  push0({ ...(st ?? {}), gg: { d: 1 } }, "", href);
  depth = 1;
  trail = ["/", here()];
  save();
}

/** 월드 덫 — 월드가 다 뜨면([data-world-ready], 아이폰 밀기 미리보기에 불러오기 화면이 찍히지 않게) 같은 주소를 한 칸 덮는다. 늦어도 8초 */
function armWorldTrap() {
  clearTimeout(worldArmT);
  const t0 = performance.now();
  const tick = () => {
    if (location.pathname !== WORLD || ggOf(history.state)?.trap || !push0 || toBase) return;
    if (document.querySelector("[data-world-ready]") || performance.now() - t0 > 8000) {
      push0({ ...(history.state ?? {}), gg: { d: 0, trap: true, world: true } }, "", location.href);
      depth = 0;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 월드 칸 맞추기 — 덫 위면 그대로, 맨 아래 칸이면(처음 열었거나 뒤로 와서 닿음) 덫을 덮는다. 갤럭시가 뒤로 와서 닿았으면 2초 쉬고 */
function settleWorld(g: GG | null) {
  enteringWorld = false;
  if (g?.trap) {
    depth = 0;
    return;
  }
  // 그냥 쌓인 월드 칸(enterWorld 를 거치지 않고 열림) — 여느 화면처럼 둔다. 맨 아래 칸이 아니라 덫을 덮어도 앱을 닫을 수 없다
  if (g && !g.world && g.d >= 0) {
    depth = g.d;
    trail[depth] = here();
    save();
    return;
  }
  if (!(g && g.d === -1 && g.world)) replace0!({ ...(history.state ?? {}), gg: { d: -1, world: true } }, "", location.href);
  depth = -1;
  trail = [here()];
  save();
  if (worldPopped && ANDROID) {
    worldPopped = false;
    hint("한 번 더 누르면 앱이 닫혀요");
    clearTimeout(worldArmT);
    worldArmT = setTimeout(armWorldTrap, 2000); // 그 사이 또 누르면 맨 아래 칸에서 뒤로 — 앱이 닫힌다
    return;
  }
  worldPopped = false;
  armWorldTrap();
}

const isBase = (g: GG | null) => !g || g.d <= -1 || !!g.solo;
/** 기록 맨 아래 칸까지 되돌아간 뒤 then — 한 칸씩 뒤로(onPop 이 이어 간다) */
function goBase(then: () => void) {
  if (isBase(ggOf(history.state))) {
    then();
    return;
  }
  toBase = then;
  history.back();
}

function onPop() {
  if (toBase) {
    if (isBase(ggOf(history.state))) {
      const then = toBase;
      toBase = null;
      setTimeout(then, 0); // Next 가 먼저 화면을 되돌린 뒤에
    } else history.back();
    return;
  }
  if (location.pathname === WORLD) worldPopped = true;
  // 앞으로 가기(아이폰 오른쪽 → 왼쪽 밀기 · 브라우저 앞으로) 막기 — 앞 기록으로 넘어오면 곧바로 원래 자리로 되돌린다(2026-10-16)
  const g = ggOf(history.state), prev = depth;
  if (g && g.d > prev && prev >= 0) {
    history.go(prev - g.d);
    return;
  }
  // Next 가 먼저 화면을 되돌린 뒤에
  setTimeout(() => {
    settle();
    // 뒤로 해서 홈에 돌아왔다 — 앞에 남은 기록(방금 있던 화면)을 지운다. 그래서 다시 밀어 앞으로 갈 곳이 없다
    if (location.pathname === "/" && prev > 0 && !pending) {
      const h = ggOf(history.state);
      if (h?.solo) armTrap(true); // 처음 연 홈 — 그 위에 덫을 덮으면 앞 기록이 사라진다
      else if (h?.trap) { selfBack = true; history.back(); } // 아래 칸으로 갔다가 덫을 새로 덮는다(화면은 그대로 홈)
    }
    if (pending && Date.now() - pending.at < 4000) {
      const p = pending;
      pending = null;
      if (!samePlace(here(), p.href)) {
        if (p.kind === "push") router?.push(p.href);
        else router?.replace(p.href);
      }
    }
    if (refreshAfterBack) {
      refreshAfterBack = false;
      router?.refresh();
    }
  }, 0);
}

/** 앱을 열 때 한 번 — history 를 감싸 층을 붙이고, 뒤로/앞으로를 듣는다 */
export function installNav(r: RouterLike) {
  router = r;
  const w = window as Window & { __ggNav?: boolean };
  if (w.__ggNav) return;
  w.__ggNav = true;
  load();
  push0 = history.pushState.bind(history) as HistoryFn;
  replace0 = history.replaceState.bind(history) as HistoryFn;
  history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    // 지금 칸의 층에서 센다(2026-11-06) — 뒤로 직후(층 맞추기는 setTimeout 뒤) 같은 이벤트 안에서 기록을 얹으면
    // depth 가 아직 옛 값이라 한 층 높게 적혔다(지킴 칸을 다시 얹을 때). 탭바가 엉뚱한 칸으로 갔다
    const d = (ggOf(history.state)?.d ?? depth) + 1;
    depth = d;
    trail.length = d;
    trail[d] = pathOf(url);
    save();
    push0!({ ...((data as object) ?? {}), gg: { d } }, unused, url);
  };
  history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    const g = ggOf(data) ?? ggOf(history.state) ?? { d: depth };
    if (url) {
      trail[Math.max(0, g.d)] = pathOf(url);
      save();
    }
    replace0!({ ...((data as object) ?? {}), gg: g }, unused, url);
  };
  addEventListener("popstate", onPop);
  // 월드로 가는 링크(홈 '들어가기' · 전체 '내 모습 꾸미기' …) — 그냥 쌓지 않고 맨 아래 칸으로(enterWorld). next/link 는 막힌 클릭이면 가지 않는다
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname !== WORLD || location.pathname === WORLD) return;
      e.preventDefault();
      enterWorld(u.pathname + u.search);
    },
    true,
  );
  settle();
}

/** 월드 들어가기 — 기록 맨 아래 칸까지 되돌아가 그 칸을 월드로 갈아 끼운다(뒤로 · 밀기로 홈에 가지 않게) */
export function enterWorld(href: string, fallback?: RouterLike) {
  router ??= fallback ?? null;
  if (!router || !replace0) {
    location.assign(href);
    return;
  }
  enteringWorld = true;
  setTimeout(() => (enteringWorld = false), 6000);
  goBase(() => {
    replace0!({ ...(history.state ?? {}), gg: { d: -1, world: true } }, "", location.href);
    router!.replace(href);
  });
}

/** 월드 나가기 — 맨 아래 칸(월드)을 홈으로 되돌린다. to 가 있으면(보고서) 홈 · 덫 위에 연다 — 거기서 뒤로 하면 홈 */
export function leaveWorld(to: string | null, fallback?: RouterLike) {
  router ??= fallback ?? null;
  if (!router || !replace0 || !push0) {
    // 기록 감싸기가 없다(시험 · 걸리기 전) — 그냥 옮긴다
    if (!router) location.replace(to ?? "/");
    else if (to) router.push(to);
    else router.replace("/");
    return;
  }
  clearTimeout(worldArmT);
  if (!ggOf(history.state)?.world) {
    // 맨 아래 칸이 아닌 월드(그냥 쌓인 칸) — 예전처럼 홈까지 되돌아가거나 홈 위에 연다
    if (to) freshFromHome(to);
    else goHome();
    return;
  }
  goBase(() => {
    if (!to) {
      replace0!({ ...(history.state ?? {}), gg: { d: -1 } }, "", location.href);
      selfBack = true; // 홈에 닿아도 '한 번 더' 안내를 띄우지 않는다
      router!.replace("/");
      return;
    }
    // 홈 칸 둘(바닥 · 덫)을 Next 가 모르는 칸으로 깔고 그 위에 보고서 — 뒤로 오면 홈을 새로 불러온다
    replace0!({ gg: { d: -1, base: true } }, "", "/");
    push0!({ gg: { d: 0, trap: true } }, "", "/");
    depth = 0;
    trail = ["/"];
    save();
    router!.push(to);
  });
}

export const navDepth = () => depth;
/**
 * 지금 칸이 저장 안 한 입력 화면의 '지킴 칸'(lib/use-leave-guard)이면 1 — 같은 화면이 한 칸 더 쌓여 있다(2026-11-05).
 * '들어온 곳' 은 그 아래 칸이고, 그리로 가려면 두 칸 뒤로 간다.
 */
const guardSteps = () => ((history.state as { ggGuard?: unknown } | null)?.ggGuard ? 1 : 0);
/** 바로 아래 층의 주소 — '들어온 곳'(지킴 칸은 건너뛴다) */
export const prevPlace = (): string | null => {
  const at = depth - 1 - guardSteps();
  return at >= 0 ? (trail[at] ?? null) : null;
};

const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

/** 탭 막대 — 홈은 바닥으로 돌아가고, 다른 탭은 늘 홈 바로 위 한 칸에 갈아 끼운다. 지금 탭 첫 화면을 다시 누르면 맨 위로 */
export function goTab(href: string, fallback?: RouterLike) {
  router ??= fallback ?? null;
  if (!router) return;
  if (href === "/") {
    if (depth > 0) history.go(-depth);
    else scrollTop();
    return;
  }
  if (samePlace(here(), href) && depth <= 1) {
    scrollTop();
    return;
  }
  if (depth <= 0) router.push(href);
  else if (depth === 1) router.replace(href);
  else {
    pending = { kind: "replace", href, at: Date.now() };
    history.go(-(depth - 1));
  }
}

/** 홈으로 — 바닥까지 되돌아간다(기록을 더 쌓지 않는다) */
export function goHome(fallback?: RouterLike) {
  router ??= fallback ?? null;
  if (depth > 0) history.go(-depth);
  else if (location.pathname !== "/") router?.replace("/");
}

/** 홈 위에 새로 — 홈까지 되돌아간 뒤 그 위에 연다(월드 → 보고서: 뒤로 하면 홈). 홈 바로 위에서는 갈아 끼운다 */
export function freshFromHome(href: string, fallback?: RouterLike) {
  router ??= fallback ?? null;
  if (!router) return;
  if (depth <= 0) router.push(href);
  else if (depth === 1) router.replace(href);
  else {
    pending = { kind: "push", href, at: Date.now() };
    history.go(-depth);
  }
}

/** '‹ 돌아가기' — 들어온 곳이 그 주소면 뒤로(기록을 줄인다). 아니면 false — 링크가 그 주소로 갈아 끼운다 */
export function backIfCameFrom(href: string): boolean {
  const prev = prevPlace();
  if (prev && samePlace(prev, href)) {
    history.go(-1 - guardSteps());
    return true;
  }
  // 지킴 칸 위에서 다른 곳으로 — 링크가 지킴 칸을 갈아 끼우면 그 아래 입력 화면이 기록에 남는다.
  // 지킴 칸을 먼저 걷고(뒤로) 그 자리를 갈아 끼운다(2026-11-06)
  if (guardSteps() && router) {
    pending = { kind: "replace", href, at: Date.now() };
    history.back();
    return true;
  }
  return false;
}

/** 저장 · 등록이 끝난 뒤 — 들어온 곳이 그 주소면 뒤로 가서 새로 읽고, 아니면 그 주소로 갈아 끼운다(입력 화면은 기록에서 빠진다) */
export function finishTo(href: string, fallback?: RouterLike, waited = 0) {
  router ??= fallback ?? null;
  // 저장을 시작하면 입력 화면이 지킴 칸을 스스로 걷는다(뒤로 — 비동기). 그게 끝나기 전에 여기 오면(빠른 응답)
  // 잠깐 기다린다 — 여기서 또 뒤로 하면 두 칸을 가 버린다(2026-11-06). 1.5초가 지나도 남아 있으면 그대로 간다
  if (guardSteps() && waited < 1500) {
    setTimeout(() => finishTo(href, fallback, waited + 30), 30);
    return;
  }
  const prev = prevPlace();
  if (prev && samePlace(prev, href)) {
    refreshAfterBack = true;
    history.go(-1 - guardSteps());
    return;
  }
  router?.replace(href);
}

/**
 * 머리의 ‹ 단추(2026-11-11) — 들어온 곳이 있으면 그리로 뒤로(아이폰 밀기 · 안드로이드 뒤로와 같다, 지킴 칸은 건너뛴다).
 * 들어온 곳이 없으면(알림 · 링크로 바로 열었을 때) fallback 으로 갈아 끼운다.
 */
export function goBack(fallback: string, fallbackRouter?: RouterLike) {
  router ??= fallbackRouter ?? null;
  if (prevPlace() !== null) {
    history.go(-1 - guardSteps());
    return;
  }
  router?.replace(fallback);
}
