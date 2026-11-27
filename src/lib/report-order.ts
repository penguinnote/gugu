/**
 * 보고서 화면의 사람 순서(2026-11-11 사용자 요청) — 돌봄 사각지대는 맨 뒤, 그 안은 역할 상관없이 가나다.
 * 나머지는 리더 먼저 → 가나다(예전 그대로).
 */
const collator = new Intl.Collator("ko");

/**
 * 리더가 명단 편집으로 정한 순서(2026-11-14)가 있으면 그것이 먼저 — 정한 사람은 그 순서대로 위에, 정하지 않은 사람(새로 온 사람)은 아래에 예전 규칙대로.
 */
export function orderReportPersons<T extends { id: string; name: string; groupRole: "leader" | "member" }>(
  persons: T[],
  spots: ReadonlySet<string>,
  custom: ReadonlyMap<string, number> = new Map(),
): T[] {
  return [...persons].sort((a, b) => {
    const ca = custom.get(a.id);
    const cb = custom.get(b.id);
    if (ca !== undefined || cb !== undefined) {
      if (ca === undefined) return 1;
      if (cb === undefined) return -1;
      if (ca !== cb) return ca - cb;
    }
    const sa = spots.has(a.id);
    const sb = spots.has(b.id);
    if (sa !== sb) return sa ? 1 : -1;
    if (!sa && a.groupRole !== b.groupRole) return a.groupRole === "leader" ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
}
