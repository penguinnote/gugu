/**
 * 집 안 사진(world_room_shots)이 지금 방 모습인가(2026-11-11).
 *
 * 2026-11-10 집 꾸미기를 다시 만들며(#118 빈 방이 기본 · #121 벽을 높임) 방 모습이 바뀌었다. 그 전에 찍힌 사진에는 예전 기본 가구 ·
 * 낮은 벽이 남아 있어, 목장 화면에서 어떤 목장은 빈 방이고 어떤 목장은 예전 가구가 보였다(사용자 지적). 지우지 않고 '없는 것' 으로 친다 —
 * 목장 화면은 빈 방 그림(이름판)을 보이고, 그 목장 리더가 월드에 들어오면 새로 한 장 찍는다(roomShot "need").
 */
export const ROOM_SHOT_SINCE = Date.parse("2026-11-10T13:00:00+09:00"); // #121 이 운영에 나간 뒤

/** 쓸 수 있는 사진이면 저장 시각(ms), 없거나 예전 방 모습이면 null */
export function freshShotAt(updatedAt: string | null | undefined): number | null {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(t) && t >= ROOM_SHOT_SINCE ? t : null;
}
