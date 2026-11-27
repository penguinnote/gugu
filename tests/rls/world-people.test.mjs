/**
 * World 7 — 꾸민 모습이 서로 보이게 (2026-10-11)
 *
 *   world_state().people — 생김새를 저장한 명단 리더(그 목장 마을)와 목사님(교회, group_id null)
 *   나 자신은 빠진다. 미승인·휴면·운영자(명단 밖)는 나오지 않는다. 마을마다 최근 세 사람, 목사님 한 사람
 *   이름·사용자 id 는 주지 않는다. world_avatars 테이블은 여전히 본인 것만 읽힌다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTestDb } from "./harness.mjs";

let ctx;
let leaders; // [{ name, id, group_id }]

before(async () => {
  ctx = await createTestDb();
  leaders = (await ctx.db.query(
    `select u.name, u.id, p.group_id from public.users u join public.persons p on p.user_id = u.id
     where u.role in ('leader', 'admin') and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active'
     order by p.group_id, u.name`,
  )).rows;
  assert.ok(new Set(leaders.map((l) => l.group_id)).size >= 2, "목장이 다른 리더가 둘 이상");
});

after(async () => {
  await ctx?.db?.close?.();
});

const userId = async (name) => (await ctx.db.query(`select id from public.users where name = $1`, [name])).rows[0].id;
async function withLooks(rows, fn) {
  await ctx.db.exec("begin");
  try {
    for (const [id, look, ago = 0] of rows) {
      await ctx.db.query(`insert into public.world_avatars (user_id, look, updated_at) values ($1, $2::jsonb, now() - make_interval(mins => $3))`, [id, JSON.stringify(look), ago]);
    }
    return await fn();
  } finally {
    await ctx.db.exec("rollback");
  }
}
/** 같은 거래 안에서 그 사람으로 world_state 를 읽는다 */
async function peopleAs(name) {
  await ctx.db.exec("savepoint p");
  await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[name], role: "authenticated" })]);
  await ctx.db.exec("set local role authenticated");
  const s = (await ctx.db.query(`select public.world_state() as s`)).rows[0].s;
  await ctx.db.exec("rollback to savepoint p");
  return s.people;
}

describe("서로 보이는 모습", () => {
  it("다른 목장 리더의 모습은 그 목장 id 와 생김새만 — 나는 빠진다", async () => {
    const [a, b] = [leaders[0], leaders.find((l) => l.group_id !== leaders[0].group_id)];
    await withLooks([[a.id, { hair: "bob", hat: "none" }], [b.id, { hair: "curly" }]], async () => {
      const seenByA = await peopleAs(a.name);
      assert.deepEqual(seenByA, [{ group_id: b.group_id, look: { hair: "curly" } }]);
      const seenByB = await peopleAs(b.name);
      assert.deepEqual(seenByB, [{ group_id: a.group_id, look: { hair: "bob", hat: "none" } }]);
      assert.ok(Object.keys(seenByA[0]).every((k) => k === "group_id" || k === "look"), "이름·사용자 id 는 없다");
    });
  });

  it("목사님은 group_id 없이(교회) 나오고, 목사님도 리더 모습을 본다", async () => {
    const pastor = await userId("임찬양");
    await withLooks([[pastor, { hair: "buzz" }], [leaders[0].id, { hair: "pony" }]], async () => {
      const byLeader = await peopleAs(leaders.find((l) => l.group_id !== leaders[0].group_id).name);
      assert.deepEqual(byLeader.find((p) => p.group_id === null), { group_id: null, look: { hair: "buzz" } });
      const byPastor = await peopleAs("임찬양");
      assert.equal(byPastor.some((p) => p.group_id === null), false, "자기 모습은 빠진다");
      assert.ok(byPastor.some((p) => p.group_id === leaders[0].group_id));
    });
  });

  it("미승인 · 명단 밖 운영자의 모습은 나오지 않는다", async () => {
    const pending = await userId("박새벽");
    const admin = await userId("정다슬");
    const adminIsLeader = leaders.some((l) => l.id === admin);
    await withLooks([[pending, { hair: "bob" }], [admin, { hair: "pony" }]], async () => {
      const seen = await peopleAs(leaders.find((l) => l.id !== admin).name);
      assert.equal(seen.some((p) => p.look.hair === "bob"), false);
      if (!adminIsLeader) assert.equal(seen.some((p) => p.look.hair === "pony"), false);
    });
  });

  it("한 마을에는 최근에 꾸민 세 사람까지", async () => {
    // 한 목장에 리더를 넷 만든다(시드 리더 + 임시 사용자)
    const g = leaders[0].group_id;
    await ctx.db.exec("begin");
    try {
      const ids = [];
      for (let k = 0; k < 4; k++) {
        const u = (await ctx.db.query(`insert into public.users (name, role, status) values ($1, 'leader', 'active') returning id`, [`임시리더${k}`])).rows[0].id;
        await ctx.db.query(`insert into public.persons (name, group_id, group_role, status, user_id, joined_at) values ($1, $2, 'leader', 'active', $3, current_date)`, [`임시리더${k}`, g, u]);
        await ctx.db.query(`insert into public.world_avatars (user_id, look, updated_at) values ($1, $2::jsonb, now() - make_interval(mins => $3))`, [u, JSON.stringify({ hair: `h${k}` }), k]);
        ids.push(u);
      }
      const viewer = leaders.find((l) => l.group_id !== g).name;
      const seen = (await peopleAs(viewer)).filter((p) => p.group_id === g).map((p) => p.look.hair);
      assert.deepEqual(seen, ["h0", "h1", "h2"]);
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("world_avatars 테이블은 여전히 본인 것만 읽힌다", async () => {
    const [a, b] = [leaders[0], leaders.find((l) => l.group_id !== leaders[0].group_id)];
    await withLooks([[a.id, { hair: "bob" }], [b.id, { hair: "curly" }]], async () => {
      await ctx.db.exec("savepoint q");
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[a.name], role: "authenticated" })]);
      await ctx.db.exec("set local role authenticated");
      const rows = (await ctx.db.query(`select user_id from public.world_avatars`)).rows;
      await ctx.db.exec("rollback to savepoint q");
      assert.deepEqual(rows.map((r) => r.user_id), [a.id]);
    });
  });
});
