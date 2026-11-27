/**
 * 상점 구조(2026-11-16) — 큰 칸 셋: 마당 · 집 안 · 캐릭터 꾸미기(+ 쿠폰). 칸 안에서 작은 묶음으로 나눈다.
 *   마당       집 · 울타리 · 나무·꽃 · 탈것 · 놀이기구 · 소품
 *   집 안      의자·침대 · 탁자·수납 · 부엌 · 조명·가전 · 장식
 *   캐릭터     모자 · 얼굴 · 목 · 등 · 손(입는 자리)
 * DB 의 종류(cat)는 그대로다 — 묶음은 화면에서만 정한다. 탈것 · 놀이기구 · 가구 묶음은 물건 이름표(id)로 가른다.
 * 여기 없는 새 물건은 종류의 기본 묶음(소품 · 장식)으로 간다. 월드 상점(public/rodem-world/index.html 의 SHOP_SUB)과 같은 표다 — 같이 고친다.
 */
export type ShopGroup = { key: string; label: string };

export const YARD_GROUPS: ShopGroup[] = [
  { key: "house", label: "집" },
  { key: "fence", label: "울타리" },
  { key: "nature", label: "나무·꽃" },
  { key: "ride", label: "탈것" },
  { key: "play", label: "놀이기구" },
  { key: "prop", label: "소품" },
];
export const ROOM_GROUPS: ShopGroup[] = [
  { key: "seat", label: "의자·침대" },
  { key: "table", label: "탁자·수납" },
  { key: "kitchen", label: "부엌" },
  { key: "light", label: "조명·가전" },
  { key: "decor", label: "장식" },
];

const IN = (s: string) => new Set(s.split(" "));
const RIDE = IN("bicycle sailboat wagon toycar truck bus airballoon");
const PLAY = IN("springhorse seesaw sandbox swing slide ropeswing trampoline hammock");
const SEAT = IN("sofa armchair chair bed bedsingle sofablue armblue bedwood bedsmall chaircush chairblue chaircurve stool woodchair softsofa cozybed");
const TABLE = IN("dtable lowtable cabinet cupboard drawer nightstand longtable sidetable roundtable bookcase wardrobe desk");
const KITCHEN = IN("fridge stove sink counter kshelf");
const LIGHT = IN("lamp tablelamp floorlamp tvset fishtank tallclock piano fireplace");

/** 물건이 들어가는 작은 묶음 — 마당 물건(house · fence · nature · prop)과 가구(furniture)만. 그 밖은 null */
export function shopGroupOf(it: { id: string; cat: string }): string | null {
  if (it.cat === "house" || it.cat === "fence" || it.cat === "nature") return it.cat;
  if (it.cat === "prop") return RIDE.has(it.id) ? "ride" : PLAY.has(it.id) ? "play" : "prop";
  if (it.cat === "furniture") return SEAT.has(it.id) ? "seat" : TABLE.has(it.id) ? "table" : KITCHEN.has(it.id) ? "kitchen" : LIGHT.has(it.id) ? "light" : "decor";
  return null;
}
