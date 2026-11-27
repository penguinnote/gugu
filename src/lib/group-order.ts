/**
 * 목장을 늘어놓는 순서(2026-11-17 사용자 결정) — 앱 어디서든 가나다 순, 다만 내 목장(목장 리더)은 늘 맨 위.
 *   · 전체 명단(화면 · 명단 엑셀)은 마을별로 묶은 채 마을 안에서만 가나다. 마을 순서는 그대로(번호가 가장 앞선 목장의 마을부터),
 *     마을이 없는 목장은 맨 뒤
 *   · 파일(엑셀)은 내 목장을 올리지 않는다 — 여러 사람이 같이 보는 문서다
 *   · 로뎀 월드의 마을 자리는 번호 순 그대로(자리가 바뀌면 집이 옮겨 간다) — 여기를 쓰지 않는다
 * 이름 비교는 코드포인트(가나다 순과 같다) — localeCompare 는 서버와 브라우저가 다를 수 있다(lib/group-profile sortMembers 와 같은 이유).
 */

export const byKoName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Named = { id: string; name: string };

/** 가나다 순, own 이 있으면 그 목장을 맨 위로 */
export function sortGroups<T extends Named>(groups: readonly T[], own?: string | null): T[] {
  return [...groups].sort((a, b) => (own ? Number(b.id === own) - Number(a.id === own) : 0) || byKoName(a.name, b.name));
}

type Villaged = Named & { number: number; village: string | null };

/** 마을별(마을 순서는 번호가 가장 앞선 목장 기준) → 마을 안에서 가나다. own 이 있으면 그 목장을 맨 위로 */
export function sortGroupsByVillage<T extends Villaged>(groups: readonly T[], own?: string | null): T[] {
  const first = new Map<string, number>();
  for (const g of groups) if (g.village) first.set(g.village, Math.min(first.get(g.village) ?? Infinity, g.number));
  const villageRank = (g: T) => (g.village ? first.get(g.village)! : Infinity);
  return [...groups].sort(
    (a, b) => (own ? Number(b.id === own) - Number(a.id === own) : 0) || villageRank(a) - villageRank(b) || byKoName(a.name, b.name),
  );
}
