/**
 * '전체' 에서 들어간 화면인가(2026-11-12 사용자 요청) — 전체 메뉴로 들어간 화면에서는 하단 탭을 아무것도 칠하지 않는다.
 * 같은 화면(전체 명단 · 목장 프로필 · 지난 보고서 …)이 다른 탭에서도 열리므로 주소만으로는 모른다 — 전체 메뉴를 누를 때 표시해 두고,
 * 탭을 누르거나 탭 첫 화면(/ · /groups · /records · /all)에 닿으면 지운다. 이 탭(창) 동안만 sessionStorage 에 남긴다(새로 고침해도 그대로).
 */
const KEY = "gg-from-all";
let value: boolean | null = null;
const subs = new Set<() => void>();

export function setFromAll(on: boolean) {
  if (getFromAll() === on) return;
  value = on;
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {}
  subs.forEach((f) => f());
}

export function getFromAll(): boolean {
  if (value === null) {
    try {
      value = sessionStorage.getItem(KEY) === "1";
    } catch {
      value = false;
    }
  }
  return value;
}

/** 서버 그림 · 붙기 전 첫 그림은 표시 없음 */
export const getFromAllServer = () => false;

export function subscribeFromAll(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** 탭 첫 화면 — 여기 닿으면 표시를 지운다 */
export const TAB_ROOTS = ["/", "/groups", "/records", "/all"];
