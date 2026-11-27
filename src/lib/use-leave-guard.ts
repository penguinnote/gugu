"use client";

import { useEffect, useRef } from "react";

export const LEAVE_MESSAGE = "저장하지 않은 내용이 있어요. 그래도 나갈까요?";

/**
 * 저장 안 한 채 나가려 하면 묻는다(2026-11-05) — 명단 고치기 · 목장 프로필 고치기. 예전엔 고친 것이 말없이 사라졌다.
 *   · 새로 고침 · 창 닫기   beforeunload(브라우저가 제 문구로 묻는다)
 *   · 앱 안 링크 · 탭바    문서 맨 앞(capture)에서 가로채 confirm — 아니오면 React 의 onClick(탭바 goTab)까지 막는다
 *   · 밀어서 뒤로 · 뒤로 단추  처음 고친 순간 같은 주소의 '지킴 칸' 을 기록에 한 칸 얹는다. 뒤로 하면 그 칸만 빠지고
 *                          화면은 그대로 — 그때 고친 것이 남아 있으면 묻고(나가기 = 한 칸 더 뒤로, 남기 = 다시 얹기),
 *                          되돌려서 고친 것이 없으면 묻지 않고 한 칸 더 뒤로 간다.
 * 지킴 칸은 저장을 시작할 때와 화면을 떠날 때만 걷는다 — 고친 것이 잠깐 처음과 같아질 때마다(한글 입력 중) 걷고 다시 얹으면
 * 두 기록 이동이 엇갈려 '뒤로 한 것' 으로 잘못 보고 물었다(2026-11-05 고침).
 * 링크로 떠나 남겨진 지킴 칸은 '죽은 칸' — 나중에 뒤로 해서 거기 닿으면 말없이 한 칸 더 넘어간다.
 * 링크 · 탭바로 떠날 때는 클릭에서 한 번만 묻는다 — 탭바의 history.go 가 지킴 칸을 지나가도 다시 묻지 않는다(2026-11-05).
 * '들어온 곳' 계산(nav-history 의 prevPlace · finishTo · '‹ 돌아가기')은 지킴 칸을 건너뛴다.
 * 층 · 주소 기록(lib/nav-history)은 history.pushState 를 감싸 두었으므로 지킴 칸도 그 규칙대로 한 층이 된다.
 */

type GuardState = { ggGuard?: string } & Record<string, unknown>;

let live: string | null = null; // 지금 화면에 붙어 있는 지킴 칸
let installed = false;

const guardOf = () => (history.state as GuardState | null)?.ggGuard ?? null;
const pushGuard = (id: string) => history.pushState({ ...((history.state as object) ?? {}), ggGuard: id }, "", location.href);

/** 죽은 지킴 칸 건너뛰기 — 한 번만 건다 */
function installSkip() {
  if (installed) return;
  installed = true;
  addEventListener("popstate", () => {
    const g = guardOf();
    if (g && g !== live) history.back();
  });
}

/** changed — 처음과 달라진 것이 있다. saving — 저장 중(지킴 칸을 걷는다) */
export function useLeaveGuard(changed: boolean, saving = false) {
  const dirty = useRef(false);
  const state = useRef({ id: "", pushed: false, ignore: false, leaving: false, depth: -1 });

  // 화면에 있는 동안 한 번 — 듣는 것들을 걸고, 떠날 때 지킴 칸을 정리한다
  useEffect(() => {
    installSkip();
    const s = state.current;
    s.id = Math.random().toString(36).slice(2);

    const onPop = () => {
      if (s.ignore) {
        s.ignore = false;
        return;
      }
      if (!s.pushed || guardOf() === s.id) return; // 지킴 칸이 없거나, 앞으로 와서 다시 그 위
      s.pushed = false;
      // 링크 · 탭바로 떠나는 중(이미 물었다), 또는 여러 칸을 한꺼번에 건너뛴 이동(탭바의 history.go) — 묻지 않고 비켜 준다
      const d = (history.state as { gg?: { d?: number } } | null)?.gg?.d;
      if (s.leaving || (typeof d === "number" && s.depth >= 0 && d !== s.depth - 1)) {
        live = null;
        return;
      }
      // 뒤로 밀어 지킴 칸 하나만 빠졌다 — 화면은 그대로다
      if (!dirty.current || window.confirm(LEAVE_MESSAGE)) {
        live = null;
        s.ignore = true;
        history.back();
      } else {
        pushGuard(s.id);
        s.pushed = true;
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (dirty.current && !window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      s.leaving = true; // 링크가 기록을 움직여도(탭바 · '‹ 돌아가기') 다시 묻지 않는다
    };
    addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      if (live === s.id) live = null; // 링크로 떠났으면 남은 칸은 죽은 칸
      if (s.pushed && guardOf() === s.id) history.back(); // 아직 그 위면 걷는다
      s.pushed = false;
    };
  }, []);

  // 처음 고친 순간 얹고, 저장을 시작하면 걷는다. 고친 것이 처음과 같아져도 걷지 않는다
  useEffect(() => {
    dirty.current = changed && !saving;
    const s = state.current;
    if (!s.id) return;
    if (changed && !saving && !s.pushed) {
      pushGuard(s.id);
      s.pushed = true;
      s.depth = (history.state as { gg?: { d?: number } } | null)?.gg?.d ?? -1;
      live = s.id;
    } else if (saving && s.pushed) {
      s.pushed = false;
      live = null;
      if (guardOf() === s.id) {
        s.ignore = true;
        history.back();
      }
    }
  }, [changed, saving]);
}
