import { describe, expect, it } from "vitest";

import { toPayload, type WorldState } from "@/lib/world-state";

/**
 * 월드에 넘기는 꼴(World 4 · 7) — 마을은 목장 번호 순 자리로, 다른 사람 모습은 자리 번호로(목사님은 -1).
 * 목장 id 는 넘기지 않는다. 자리를 모르는 목장(비활성 등)의 사람은 뺀다.
 */
const base: WorldState = {
  items: [],
  villages: [{ group_id: "g2", fence: "stone", slots: [null, null, null, null, null, null, null] }],
  mine: { group_id: "g1", berries: 60, owned: { wood: 1 } },
  look: { hair: "bob" },
  people: [
    { group_id: "g2", look: { hair: "curly" } },
    { group_id: null, look: { hair: "buzz" } },
    { group_id: "gone", look: { hair: "pony" } },
  ],
  rules: { report_on_time: 20, report_late: 5 },
};

describe("toPayload", () => {
  it("사람들은 마을 자리 번호로, 목사님은 -1, 모르는 목장은 뺀다", () => {
    const p = toPayload(base, ["g1", "g2"]);
    expect(p.people).toEqual([
      { v: 1, look: { hair: "curly" } },
      { v: -1, look: { hair: "buzz" } },
    ]);
    expect(JSON.stringify(p)).not.toContain("g2");
  });

  it("people · rules 가 없으면(옛 응답) 빈 목록 · 빈 객체", () => {
    const p = toPayload({ ...base, people: undefined, rules: undefined }, ["g1"]);
    expect(p.people).toEqual([]);
    expect(p.rules).toEqual({});
  });

  it("열매 규칙 숫자를 그대로 넘긴다(월드 화면 글용)", () => {
    expect(toPayload(base, ["g1"]).rules).toEqual({ report_on_time: 20, report_late: 5 });
  });

  it("마을은 번호 순 자리로, 꾸밈이 없으면 null", () => {
    const p = toPayload(base, ["g1", "g2"]);
    expect(p.villages).toEqual([null, { fence: "stone", slots: [null, null, null, null, null, null, null], rooms: {} }]);
    expect(p.berries).toBe(60);
  });

  it("집 안 꾸밈(rooms)을 그대로 넘긴다", () => {
    const room = ["sofa", null, null, null, null, null, null, null, "painting", null];
    const p = toPayload({ ...base, villages: base.villages.map((v) => ({ ...v, rooms: { "0": room } })) }, ["g2"]);
    expect(p.villages[0]?.rooms).toEqual({ "0": room });
  });
});
