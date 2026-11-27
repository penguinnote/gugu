/**
 * 넓은 화면 제출 현황(2026-11-27, 목사님 주간 검토 작업대) — 화면과 상관없는 셈.
 *   미확인   제출했고 목사님 도장('기도하겠습니다')이 아직 없는 목장(앱의 '목장 보고서 피드백 현황' 과 같은 기준 — unstamped_reports)
 *   확인됨   제출했고 도장이 있는 목장
 *   미제출   아직 안 낸 목장
 * 목장 차례는 화면의 목장 차례(가나다, lib/group-order) 그대로 받는다.
 */
export type BenchState = "unchecked" | "checked" | "missing";
export type BenchGroup = { name: string; state: BenchState };

/** '남기고 다음 목장' · 건너뛰기 — 지금 목장 다음의 미확인 목장(끝이면 처음부터). 지금 목장은 빼고, 없으면 null(그 자리에 머문다) */
export function nextUnchecked(groups: BenchGroup[], current: string | null): string | null {
  const at = current === null ? -1 : groups.findIndex((g) => g.name === current);
  for (let i = 1; i <= groups.length; i++) {
    const g = groups[(at + i + groups.length) % groups.length];
    if (g && g.state === "unchecked" && g.name !== current) return g.name;
  }
  return null;
}

/** J · K — 제출된 목장(미확인 · 확인됨) 사이를 목장 차례대로 한 칸. 끝에서는 멈춘다(null). 고른 목장이 없으면 J 는 첫 목장 */
export function stepSubmitted(groups: BenchGroup[], current: string | null, dir: 1 | -1): string | null {
  const sent = groups.filter((g) => g.state !== "missing");
  if (sent.length === 0) return null;
  const at = current === null ? -1 : sent.findIndex((g) => g.name === current);
  if (at === -1) {
    // 고른 목장이 미제출이면 목장 차례에서 가장 가까운 제출 목장으로
    const all = current === null ? -1 : groups.findIndex((g) => g.name === current);
    if (all === -1) return dir === 1 ? sent[0].name : null;
    const after = groups.slice(all + 1).find((g) => g.state !== "missing");
    const before = groups.slice(0, all).reverse().find((g) => g.state !== "missing");
    return (dir === 1 ? after : before)?.name ?? null;
  }
  return sent[at + dir]?.name ?? null;
}

/** 입력칸(글 칸 · 고르는 칸 · 고칠 수 있는 글)에 커서가 있는가 — 그 동안 단축키는 쉰다 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as Element).closest !== "function") return false;
  const el = t as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

export type BenchKey = "next" | "prev" | "stamp";
/** J 다음 목장 · K 이전 목장 · S 기도하겠습니다 도장. 입력칸 안이거나 다른 키(⌘ · Ctrl · Alt)를 함께 누르면 무시 */
export function benchKeyOf(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; target: EventTarget | null }): BenchKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return null;
  const k = e.key.toLowerCase();
  // 한글 자판이 켜져 있어도 같은 자리 — J=ㅓ · K=ㅏ · S=ㄴ
  if (k === "j" || k === "ㅓ") return "next";
  if (k === "k" || k === "ㅏ") return "prev";
  if (k === "s" || k === "ㄴ") return "stamp";
  return null;
}

/** 작업대 주소 — 고른 주(이번 주면 빼고)와 고른 목장(?g=). 새로 고침 · 뒤로 가기에서 그대로 남는다 */
export function benchHref(basePath: string, weekKey: string, thisWeek: string, group: string | null): string {
  const q = new URLSearchParams();
  if (weekKey !== thisWeek) q.set("week", weekKey);
  if (group) q.set("g", group);
  const s = q.toString();
  return s ? `${basePath}${basePath.includes("?") ? "&" : "?"}${s}` : basePath;
}
