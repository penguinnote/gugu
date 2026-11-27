/**
 * 로뎀 월드 집 안 꾸미기 (2026-10-16)
 *
 *   가구    분류 furniture, 놓는 곳(slot) floor · wall. 목장 열매로 여러 개 살 수 있다
 *   집 안   world_set_room(마을 자리, 열 칸) — 그 자리에 집이 있어야 하고, 바닥 칸(1~8)엔 바닥 가구, 벽 칸(9~10)엔 벽 가구.
 *           모든 집 안을 합쳐 가진 수만큼. 목장 리더만
 *   마을    가구는 마을 자리에 못 놓는다. 집을 치우면 그 자리 방은 지워진다
 *   상태    world_state 의 마을에 rooms 가 붙는다(모두가 본다)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { attempt, createTestDb } from "./harness.mjs";

let ctx, L1, L2, g1, g2;

before(async () => {
  ctx = await createTestDb();
  const leaders = (await ctx.db.query(
    `select u.name, p.group_id from public.users u join public.persons p on p.user_id = u.id
     where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active'
     order by p.group_id, u.name`,
  )).rows;
  const byGroup = new Map();
  for (const r of leaders) if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, r.name);
  [[g1, L1], [g2, L2]] = [...byGroup.entries()];
  assert.ok(L1 && L2 && g1 !== g2);
});

after(async () => {
  await ctx?.db?.close?.();
});

async function as(name, setup, fn) {
  await ctx.db.exec("begin");
  try {
    if (setup) await setup(ctx.db);
    await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[name], role: "authenticated" })]);
    await ctx.db.exec("set local role authenticated");
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}
const rich = (group) => (db) => db.query(`insert into public.world_ledger (group_id, delta, reason, item_id) values ($1, 1000, 'purchase', 'cabin')`, [group]);
/** 가구를 준비해 둔다(서버 권한) — 마을은 _world_ensure 로 만든다(0번 자리에 집) */
const furnished = (group, items) => async (db) => {
  await db.query(`select public._world_ensure($1)`, [group]);
  for (const [id, qty] of Object.entries(items)) {
    await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, $2, $3) on conflict (group_id, item_id) do update set qty = excluded.qty`, [group, id, qty]);
  }
};
const room = (slots) => `array[${slots.map((s) => (s ? `'${s}'` : "null")).join(", ")}]::text[]`;
const N = (...xs) => [...xs, ...Array(10 - xs.length).fill(null)];

describe("가구 목록", () => {
  it("가구 56가지 — 바닥 49 · 벽 7(2026-11-10 22가지 · 2026-11-15 코드로 만든 14가지 더함), 모두 설명 한 줄", async () => {
    const rows = (await ctx.db.query(`select id, slot, blurb from public.world_items where cat = 'furniture'`)).rows;
    assert.equal(rows.length, 56);
    assert.equal(rows.filter((r) => r.slot === "floor").length, 49);
    assert.deepEqual(rows.filter((r) => r.slot === "wall").map((r) => r.id).sort(), ["bookshelf", "frame", "frametall", "framewide", "kshelf", "painting", "plantshelf"]);
    assert.ok(rows.every((r) => r.blurb.length > 0));
  });

  it("가구인데 놓는 곳이 없거나 소품 자리를 주면 거부된다", async () => {
    for (const sql of [
      `insert into public.world_items (id, name, cat, price) values ('oops', 'x', 'furniture', 1)`,
      `insert into public.world_items (id, name, cat, slot, price) values ('oops', 'x', 'furniture', 'hat', 1)`,
      `insert into public.world_items (id, name, cat, slot, price) values ('oops', 'x', 'wear', 'floor', 1)`,
    ]) {
      await ctx.db.exec("begin");
      try {
        assert.ok((await attempt(ctx.db, sql)).error, sql);
      } finally {
        await ctx.db.exec("rollback");
      }
    }
  });

  it("가구는 여러 개 살 수 있다", () =>
    as(L1, rich(g1), async (db) => {
      assert.equal((await db.query(`select public.world_buy('chair') as r`)).rows[0].r.qty, 1);
      assert.equal((await db.query(`select public.world_buy('chair') as r`)).rows[0].r.qty, 2);
    }));
});

describe("집 안 꾸미기", () => {
  it("가진 가구를 집 안 자리에 놓으면 world_state 에 보인다 — 다른 목장 리더도 본다", async () => {
    await ctx.db.exec("begin");
    try {
      await furnished(g1, { sofa: 1, chair: 2, painting: 1 })(ctx.db);
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[L1], role: "authenticated" })]);
      await ctx.db.exec("set local role authenticated");
      const r = await attempt(ctx.db, `select public.world_set_room(0, ${room(N("sofa", "chair", "chair", null, null, null, null, null, "painting"))})`);
      assert.equal(r.error, null);
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[L2], role: "authenticated" })]);
      const s = (await ctx.db.query(`select public.world_state() as s`)).rows[0].s;
      const v = s.villages.find((x) => x.group_id === g1);
      assert.deepEqual(v.rooms["0"], N("sofa", "chair", "chair", null, null, null, null, null, "painting"));
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("가진 것보다 많이는 못 놓는다 — 집이 둘이면 두 방을 합쳐서", () =>
    as(L1, async (db) => {
      await furnished(g1, { chair: 1, cabin: 2, redhouse: 2 })(db); // 기본 집이 무엇이든 집 둘을 세울 수 있게
    }, async (db) => {
      await db.exec("savepoint s");
      const two = await attempt(db, `select public.world_set_room(0, ${room(N("chair", "chair"))})`);
      assert.match(two.error, /가진 것보다 많이/);
      await db.exec("rollback to savepoint s");
      const house = (await db.query(`select slots[1] as h, slots[3] as t from public.world_villages where group_id = $1`, [g1])).rows[0];
      const second = house.h === "cabin" ? "redhouse" : "cabin";
      assert.equal((await attempt(db, `select public.world_set_village('wood', array['${house.h}', '${second}', '${house.t}', null, null, null, null]::text[])`)).error, null);
      assert.equal((await attempt(db, `select public.world_set_room(0, ${room(N("chair"))})`)).error, null);
      await db.exec("savepoint t");
      const other = await attempt(db, `select public.world_set_room(1, ${room(N("chair"))})`);
      assert.match(other.error, /가진 것보다 많이/);
      await db.exec("rollback to savepoint t");
    }));

  it("집이 없는 자리 · 맞지 않는 칸 · 가구가 아닌 물건은 거부된다", () =>
    as(L1, furnished(g1, { sofa: 1, painting: 1, swing: 1 }), async (db) => {
      for (const [sql, re] of [
        [`select public.world_set_room(1, ${room(N("sofa"))})`, /집이 없/],
        [`select public.world_set_room(0, ${room(N("painting"))})`, /그 자리에 놓을 수 없는/],
        [`select public.world_set_room(0, ${room([null, null, null, null, null, null, null, null, "sofa", null])})`, /그 자리에 놓을 수 없는/],
        [`select public.world_set_room(0, ${room(N("swing"))})`, /집 안에 놓을 수 없는/],
        [`select public.world_set_room(0, array['sofa']::text[])`, /열 칸/],
        [`select public.world_set_room(7, ${room(N())})`, /없는 집 자리/],
      ]) {
        await db.exec("savepoint s");
        const r = await attempt(db, sql);
        assert.match(r.error ?? "", re, sql);
        await db.exec("rollback to savepoint s");
      }
    }));

  it("가구는 마을 자리에 못 놓는다", () =>
    as(L1, furnished(g1, { sofa: 1 }), async (db) => {
      const r = await attempt(db, `select public.world_set_village('wood', array['sofa', null, null, null, null, null, null]::text[])`);
      assert.match(r.error, /놓을 수 없는/);
    }));

  it("집을 치우면 그 자리 방이 지워진다", () =>
    as(L1, furnished(g1, { sofa: 1 }), async (db) => {
      assert.equal((await attempt(db, `select public.world_set_room(0, ${room(N("sofa"))})`)).error, null);
      const t = (await db.query(`select slots[3] as t from public.world_villages where group_id = $1`, [g1])).rows[0].t;
      assert.equal((await attempt(db, `select public.world_set_village('wood', array[null, null, '${t}', null, null, null, null]::text[])`)).error, null);
      const rooms = (await db.query(`select rooms from public.world_villages where group_id = $1`, [g1])).rows[0].rooms;
      assert.deepEqual(rooms, {});
    }));

  it("다른 목장 집은 못 꾸민다 — 내 목장 것만 바뀐다", () =>
    as(L2, async (db) => {
      await furnished(g1, { sofa: 1 })(db);
      await db.query(`select public._world_ensure($1)`, [g2]);
    }, async (db) => {
      await db.exec("savepoint s");
      const r = await attempt(db, `select public.world_set_room(0, ${room(N("sofa"))})`);
      await db.exec("rollback to savepoint s");
      assert.match(r.error, /가진 것보다 많이/); // L2 의 목장(g2)엔 소파가 없다 — g1 방은 건드릴 길이 없다
      const g1rooms = (await db.query(`select rooms from public.world_villages where group_id = $1`, [g1])).rows[0].rooms;
      assert.deepEqual(g1rooms, {});
    }));

  it("쓰기는 함수로만 — 표를 직접 고칠 수 없다", () =>
    as(L1, furnished(g1, {}), async (db) => {
      const r = await attempt(db, `update public.world_villages set rooms = '{"0":["sofa"]}'::jsonb where group_id = $1`, [g1]);
      assert.ok(r.error || r.affected === 0);
    }));
});
