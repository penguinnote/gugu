import { describe, expect, it } from "vitest";

import { LIVE_TOPIC, peersOf, toLivePos } from "@/app/world/world-live";

/**
 * 함께 걷기 1단계(2026-10-14) — 껍데기가 채널과 월드 사이에서 하는 일
 *   · 월드가 보낸 내 자리는 모양이 맞는 것만 싣는다(숫자 아니면 버림, 동작은 네 가지 중 하나, 집 열쇠는 짧은 글자)
 *   · presence 상태 → 월드에 넘길 사람 목록: 나는 빼고, 한 사람이 여러 기기면 마지막 것, 목장 자리는 정수만
 *   · 채널 이름은 정책(마이그레이션 world_live)과 같은 'world:lobby'
 */
describe("함께 걷기 — 껍데기", () => {
  it("채널 이름이 정책과 같다", () => {
    expect(LIVE_TOPIC).toBe("world:lobby");
  });

  it("내 자리 — 모양이 맞는 것만", () => {
    expect(toLivePos({ x: 1, y: 0.4, z: -2, f: 3.1, s: 3.6, a: "w", r: null })).toEqual({ x: 1, y: 0.4, z: -2, f: 3.1, s: 3.6, a: "w", r: null, pi: -1 });
    expect(toLivePos({ x: "1", y: 0, z: 0, f: 0, s: 0 })).toBeNull();
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: Number.NaN })).toBeNull();
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: 0, a: "dance", r: "x".repeat(80) })).toMatchObject({ a: "w", r: null });
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: 0, a: "s", r: "house:3" })).toMatchObject({ a: "s", r: "house:3" });
    expect(toLivePos({ x: 1, y: 0.8, z: 0, f: 0, s: 5.6, a: "p", r: null, pi: 9 })).toMatchObject({ a: "p", pi: 9 }); // 조랑말(9번)을 타고 있다
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: 0, pi: 1.5 })).toMatchObject({ pi: -1 });
    // 탈것(자전거 …) — 종류 · 마을 · 자리. 모양이 이상하면 뺀다
    expect(toLivePos({ x: 1, y: 0.9, z: 0, f: 0, s: 6, a: "s", r: null, v: "bicycle", vg: 3, vs: 2 })).toMatchObject({ a: "s", v: "bicycle", vg: 3, vs: 2 });
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: 0, a: "s", v: "bus", vg: 999, vs: -4 })).toMatchObject({ v: "bus", vg: -1, vs: -1 });
    expect(toLivePos({ x: 1, y: 0, z: 0, f: 0, s: 0, a: "s", v: "<b>" })).not.toHaveProperty("v");
  });

  it("사람 목록 — 나는 빼고, 여러 기기면 마지막 것", () => {
    const look = { hair: "bob" };
    const list = peersOf(
      {
        me: [{ look, g: 0, role: "leader" }],
        u1: [{ look: null, g: 2, role: "leader" }, { look, g: 2, role: "leader", n: "김가온" }],
        u2: [{ look, g: -1, role: "pastor" }],
        u3: [],
      },
      "me",
    );
    expect(list).toEqual([
      { id: "u1", look, g: 2, role: "leader", n: "김가온" }, // 이름표에 쓸 명단 이름
      { id: "u2", look, g: -1, role: "pastor", n: null },
    ]);
  });
});
