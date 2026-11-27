import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * 로뎀 월드의 DB 쪽 상태(World 4) — world_state() 한 번으로 읽는다.
 *   items    상점 물건(값은 DB 가 정한다)
 *   villages 모든 활동 목장의 꾸밈 — 번호 순. 앱 사용자 모두가 본다
 *   mine     내 목장(명단상 리더만): 열매 · 가진 물건. 목사님·운영자는 null
 *   look     내 아바타 생김새(없으면 null)
 *   people   다른 사람들의 꾸민 모습(World 7) — 명단 리더는 그 목장 id, 목사님은 null(교회 앞). 나는 빠진다. 이름은 없다
 */
export type WorldItemCat = "house" | "fence" | "nature" | "prop" | "ticket" | "wear" | "furniture";
/** slot: 꾸미기 소품(wear)이 입는 자리 · 가구(furniture)를 놓는 곳(floor · wall) · blurb: 상점 카드 설명 한 줄(World 6) */
export type WorldItem = { id: string; name: string; cat: WorldItemCat; price: number; slot?: string | null; blurb?: string };
/** rooms: 집 안 꾸밈(2026-10-16) — 마을 자리 번호("0"~"6") → 열 칸(바닥 8 · 벽 2) */
export type WorldRooms = Record<string, (string | null)[]>;
export type WorldVillage = { group_id: string; fence: string; slots: (string | null)[]; rooms?: WorldRooms };
export type WorldState = {
  items: WorldItem[];
  villages: WorldVillage[];
  mine: { group_id: string; berries: number; owned: Record<string, number> } | null;
  look: Record<string, string> | null;
  people?: { group_id: string | null; look: Record<string, string> }[];
  /** 열매 규칙 숫자(world_rules) — 월드 화면 글이 쓴다(World 8) */
  rules?: Record<string, number>;
};

export async function loadWorldState(supabase: SupabaseClient<Database>): Promise<WorldState | null> {
  const { data, error } = await supabase.rpc("world_state");
  if (error || !data) return null;
  return data as unknown as WorldState;
}

/** 상점 물건 열쇠 — 월드 ITEMS 와 같다. 서버 액션은 이 꼴만 받는다 */
export const ITEM_ID = /^[a-z]{2,20}$/;

/** 생김새 — 짧은 문자열 값만 받는다(색 #rrggbb · 모양 이름) */
export function cleanLook(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-zA-Z]{1,20}$/.test(k) || typeof v !== "string" || !/^[#a-zA-Z0-9]{1,20}$/.test(v)) return null;
    out[k] = v;
  }
  return Object.keys(out).length <= 20 ? out : null;
}

/**
 * 월드에 넘기는 꼴 — 월드는 마을을 자리 순서(목장 번호 순)로만 안다. 목장 id 는 넘기지 않는다.
 *   villages[i]  i번째 목장의 꾸밈(없으면 null — 월드가 기본 모습으로)
 *   berries      내 목장 열매(맡은 목장이 없으면 null)
 *   people       다른 사람들의 꾸민 모습 — v 는 마을 자리(목장 번호 순), 목사님은 -1(교회 앞). 자리를 모르는 목장은 뺀다
 */
export type WorldPayload = {
  items: WorldItem[];
  villages: ({ fence: string; slots: (string | null)[]; rooms: WorldRooms } | null)[];
  berries: number | null;
  owned: Record<string, number>;
  look: Record<string, string> | null;
  people: { v: number; look: Record<string, string> }[];
  rules: Record<string, number>;
};

export function toPayload(state: WorldState, groupIds: string[]): WorldPayload {
  const byGroup = new Map(state.villages.map((v) => [v.group_id, v]));
  return {
    items: state.items,
    villages: groupIds.map((id) => {
      const v = byGroup.get(id);
      return v ? { fence: v.fence, slots: v.slots, rooms: v.rooms ?? {} } : null;
    }),
    berries: state.mine ? Number(state.mine.berries) : null,
    owned: state.mine?.owned ?? {},
    look: state.look,
    people: (state.people ?? []).flatMap((p) => {
      const v = p.group_id === null ? -1 : groupIds.indexOf(p.group_id);
      return v === -1 && p.group_id !== null ? [] : [{ v, look: p.look }];
    }),
    rules: state.rules ?? {},
  };
}
