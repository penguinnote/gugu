"use server";

import { createClient } from "@/lib/supabase/server";
import { ITEM_ID, cleanLook, loadWorldState, type WorldState } from "@/lib/world-state";

/**
 * 로뎀 월드의 쓰기 — 사기 · 마을 꾸미기 · 생김새(World 4) · 집 안 꾸미기(2026-10-16) · 집 안 사진(2026-10-24) · 아바타 사진(2026-10-25) — 월드(iframe)가 부탁하면 /world 껍데기가 부른다.
 * 판정(목장 리더인가 · 열매가 되는가 · 가진 물건인가)은 전부 DB 함수가 한다. 여기서는 모양만 걸러 보내고,
 * 성공하면 새 상태(world_state)를 돌려줘 월드가 그대로 그린다. 오류 문구는 DB 함수의 한국어 문구 그대로.
 * 프리뷰 읽기 전용(Step 9c)이면 서버 클라이언트의 fetch 에서 막혀 "프리뷰에서는 저장하지 않습니다." 가 돌아간다.
 */
export type WorldActionResult = { ok: true; state: WorldState | null; berries?: number } | { ok: false; message: string };

async function fresh(): Promise<WorldState | null> {
  return loadWorldState(await createClient());
}

export async function worldBuy(item: string): Promise<WorldActionResult> {
  if (typeof item !== "string" || !ITEM_ID.test(item)) return { ok: false, message: "없는 물건입니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_buy", { p_item: item });
  if (error) return { ok: false, message: error.message };
  return { ok: true, state: await fresh() };
}

export async function worldSetVillage(fence: string, slots: (string | null)[]): Promise<WorldActionResult> {
  if (typeof fence !== "string" || !ITEM_ID.test(fence)) return { ok: false, message: "울타리가 올바르지 않습니다." };
  if (!Array.isArray(slots) || slots.length !== 7 || slots.some((s) => s !== null && (typeof s !== "string" || !ITEM_ID.test(s)))) {
    return { ok: false, message: "자리는 일곱 칸입니다." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_set_village", { p_fence: fence, p_slots: slots as string[] });
  if (error) return { ok: false, message: error.message };
  return { ok: true, state: await fresh() };
}

/** 집 안 꾸미기(2026-10-16) — house: 마을 자리 번호(0~6), slots: 열 칸(바닥 8 · 벽 2) */
export async function worldSetRoom(house: number, slots: (string | null)[]): Promise<WorldActionResult> {
  if (!Number.isInteger(house) || house < 0 || house > 6) return { ok: false, message: "없는 집 자리입니다." };
  if (!Array.isArray(slots) || slots.length !== 10 || slots.some((s) => s !== null && (typeof s !== "string" || !ITEM_ID.test(s)))) {
    return { ok: false, message: "집 안 자리는 열 칸입니다." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_set_room", { p_house: house, p_slots: slots as string[] });
  if (error) return { ok: false, message: error.message };
  return { ok: true, state: await fresh() };
}

const SHOT_PREFIX = "data:image/webp;base64,";
/** 목장 탭 배경 — 월드가 찍은 우리 목장 집 안(WebP). 판정(목장 리더 · WebP · 크기)은 DB 함수(world_set_room_shot)가 한다. 실패해도 월드는 모른다(배경만 예전 그대로) */
export async function worldSaveRoomShot(image: unknown): Promise<{ ok: boolean }> {
  if (typeof image !== "string" || !image.startsWith(SHOT_PREFIX) || image.length > 820_000) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_set_room_shot", { p_image: image.slice(SHOT_PREFIX.length) });
  return { ok: !error };
}

/** 정보 탭 배경 — 월드가 찍은 내 아바타(WebP). 판정(승인된 사용자 · WebP · 크기)은 DB 함수(world_set_avatar_shot)가 한다 */
export async function worldSaveAvatarShot(image: unknown): Promise<{ ok: boolean }> {
  if (typeof image !== "string" || !image.startsWith(SHOT_PREFIX) || image.length > 820_000) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_set_avatar_shot", { p_image: image.slice(SHOT_PREFIX.length) });
  return { ok: !error };
}

export async function worldSaveLook(look: unknown): Promise<WorldActionResult> {
  const clean = cleanLook(look);
  if (!clean) return { ok: false, message: "생김새 값이 올바르지 않습니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("world_save_look", { p_look: clean });
  if (error) return { ok: false, message: error.message };
  return { ok: true, state: null };
}
