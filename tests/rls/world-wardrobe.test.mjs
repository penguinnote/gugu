/**
 * World 6 — 상점 넓히기 · 캐릭터 꾸미기 소품 (2026-10-11)
 *
 *   소품    분류 wear, 자리(hat · face · neck · back · hand)마다. 목장 열매로 한 번만 산다 — 목장 옷장
 *   입기    world_save_look 은 소품 자리 값이 'none' 이거나 내 목장이 가진 그 자리 소품일 때만 저장한다
 *   마을    소품은 마을 자리에 놓을 수 없다. 새 놀이터 물건은 놓을 수 있다
 *   상태    world_state 의 물건에 slot · blurb 가 붙는다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

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

/** 서버 권한으로 준비하고, 같은 거래 안에서 그 사람으로 바꿔 실행한 뒤 되돌린다 */
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
const look = (db, l) => attempt(db, `select public.world_save_look($1::jsonb)`, [JSON.stringify(l)]);

describe("물건 목록", () => {
  it("소품 11가지는 자리가 있고, 다른 물건은 자리가 없다. 모두 설명 한 줄이 있다", async () => {
    const rows = (await ctx.db.query(`select id, cat, slot, blurb from public.world_items`)).rows;
    const wear = rows.filter((r) => r.cat === "wear");
    assert.equal(wear.length, 11);
    assert.ok(wear.every((r) => ["hat", "face", "neck", "back", "hand"].includes(r.slot)));
    assert.ok(rows.filter((r) => r.cat !== "wear" && r.cat !== "furniture").every((r) => r.slot === null)); // 가구(2026-10-16)는 놓는 곳(floor · wall)이 있다
    assert.ok(rows.every((r) => r.blurb.length > 0), "설명이 빈 물건이 없다");
  });

  it("소품이 아닌데 자리를 주거나, 소품인데 자리가 없으면 거부된다", async () => {
    await ctx.db.exec("begin");
    try {
      const a = await attempt(ctx.db, `insert into public.world_items (id, name, cat, slot, price) values ('oops', 'x', 'prop', 'hat', 1)`);
      assert.ok(a.error);
    } finally {
      await ctx.db.exec("rollback");
    }
    await ctx.db.exec("begin");
    try {
      const b = await attempt(ctx.db, `insert into public.world_items (id, name, cat, price) values ('oops', 'x', 'wear', 1)`);
      assert.ok(b.error);
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("world_state 의 물건에 slot · blurb 가 붙는다", async () => {
    const s = await asUser(ctx, L1, async (db) => (await db.query(`select public.world_state() as s`)).rows[0].s);
    const hat = s.items.find((i) => i.id === "strawhat");
    assert.deepEqual({ cat: hat.cat, slot: hat.slot, price: hat.price }, { cat: "wear", slot: "hat", price: 40 });
    assert.ok(hat.blurb);
    assert.equal(s.items.find((i) => i.id === "swing").slot, null);
  });
});

describe("소품 사기", () => {
  it("리더가 목장 열매로 사고, 같은 소품은 두 번 못 산다", () =>
    as(L1, rich(g1), async (db) => {
      const r = (await db.query(`select public.world_buy('strawhat') as r`)).rows[0].r;
      assert.equal(r.qty, 1);
      const again = await attempt(db, `select public.world_buy('strawhat')`);
      assert.match(again.error, /이미 가진 꾸미기/);
    }));

  it("소품은 마을 자리에 놓을 수 없고, 새 놀이터 물건은 놓을 수 있다", () =>
    as(L1, async (db) => {
      await rich(g1)(db);
      await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'balloon', 1), ($1, 'swing', 1)`, [g1]);
    }, async (db) => {
      await db.exec("savepoint s");
      const bad = await attempt(db, `select public.world_set_village('wood', array['balloon', null, null, null, null, null, null]::text[])`);
      assert.match(bad.error, /놓을 수 없는/);
      await db.exec("rollback to savepoint s");
      const ok = await attempt(db, `select public.world_set_village('wood', array['swing', null, null, null, null, null, null]::text[])`);
      assert.equal(ok.error, null);
    }));
});

describe("소품 입기", () => {
  it("가진 소품은 입는다 — 같은 목장의 다른 리더도(목장 옷장)", async () => {
    const coLeader = (await ctx.db.query(
      `select u.name from public.users u join public.persons p on p.user_id = u.id
       where p.group_id = $1 and p.group_role = 'leader' and p.status = 'active' and u.status = 'active' and u.role in ('leader', 'admin') and u.auth_user_id is not null`,
      [g1],
    )).rows.map((r) => r.name);
    for (const who of coLeader) {
      await as(who, (db) => db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'strawhat', 1), ($1, 'scarf', 1)`, [g1]), async (db) => {
        const r = await look(db, { hair: "bob", hat: "strawhat", neck: "scarf", face: "none" });
        assert.equal(r.error, null, `${coLeader.indexOf(who)}번째 리더`);
      });
    }
  });

  it("안 산 소품은 못 입는다", () =>
    as(L1, null, async (db) => {
      const r = await look(db, { hat: "strawhat" });
      assert.match(r.error, /옷장에 없는/);
    }));

  it("다른 목장이 산 소품은 못 입는다", () =>
    as(L1, (db) => db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'wings', 1)`, [g2]), async (db) => {
      assert.match((await look(db, { back: "wings" })).error, /옷장에 없는/);
    }));

  it("자리가 맞지 않거나 소품이 아닌 값은 못 입는다", () =>
    as(L1, (db) => db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'strawhat', 1)`, [g1]), async (db) => {
      await db.exec("savepoint s");
      assert.ok((await look(db, { face: "strawhat" })).error);
      await db.exec("rollback to savepoint s");
      assert.ok((await look(db, { hat: "cabin" })).error);
    }));

  it("목사님·운영자는 소품 없이 꾸밀 수 있고, 소품을 입으려 하면 막힌다", async () => {
    for (const who of ["임찬양", "정다슬"]) {
      await as(who, null, async (db) => {
        assert.equal((await look(db, { hair: "curly", hat: "none" })).error, null);
        assert.match((await look(db, { hat: "beanie" })).error, /옷장에 없는/);
      });
    }
  });
});

describe("요약", () => {
  it("world_summary 에 쿠폰을 가질 수 있는 수가 붙는다", async () => {
    const s = await asUser(ctx, L1, async (db) => (await db.query(`select public.world_summary() as s`)).rows[0].s);
    assert.equal(s.coupon_max, 2);
  });
});
