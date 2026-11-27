/**
 * 정보 탭 배경 — 내 아바타 사진 (2026-10-25)
 *
 *   쓰기   world_set_avatar_shot(base64) — 승인된 앱 사용자 본인 칸에만. WebP 만, 1KB~600KB
 *   읽기   본인 것만
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { attempt, createTestDb } from "./harness.mjs";

let ctx, L1, L2;

before(async () => {
  ctx = await createTestDb();
  const leaders = (await ctx.db.query(
    `select u.name from public.users u where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null order by u.name limit 2`,
  )).rows;
  [L1, L2] = leaders.map((r) => r.name);
  assert.ok(L1 && L2);
});

after(async () => {
  await ctx?.db?.close?.();
});

const claims = (name) => JSON.stringify({ sub: ctx.authIdByName[name], role: "authenticated" });
async function as(name, fn) {
  await ctx.db.exec("begin");
  try {
    await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(name)]);
    await ctx.db.exec("set local role authenticated");
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}
const webp = (size = 2000) => {
  const b = Buffer.alloc(size, 7);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(size - 8, 4);
  b.write("WEBP", 8, "ascii");
  return b.toString("base64");
};
const save = (db, b64) => attempt(db, `select public.world_set_avatar_shot($1) as at`, [b64]);

describe("아바타 사진", () => {
  it("본인 칸에 저장하고, 다시 저장하면 바뀐다 — 목사님도", async () => {
    for (const who of [L1, "임찬양"]) {
      await as(who, async (db) => {
        assert.equal((await save(db, webp(2000))).error, null, who);
        assert.equal((await save(db, webp(3000))).error, null, who);
        const rows = (await db.query(`select octet_length(image) as n from public.world_avatar_shots`)).rows;
        assert.deepEqual(rows.map((r) => Number(r.n)), [3000], who);
      });
    }
  });

  it("WebP 가 아니거나 크기가 맞지 않으면 거절한다", async () => {
    await as(L1, async (db) => {
      assert.ok((await save(db, Buffer.alloc(2000, 1).toString("base64"))).error);
      assert.ok((await save(db, webp(500))).error);
      assert.ok((await save(db, webp(700_000))).error);
    });
  });

  it("남의 사진은 읽지 못하고, 표를 직접 쓰지 못한다", async () => {
    await ctx.db.exec("begin");
    try {
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(L1)]);
      await ctx.db.exec("set local role authenticated");
      assert.equal((await save(ctx.db, webp())).error, null);
      await ctx.db.exec("reset role");
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(L2)]);
      await ctx.db.exec("set local role authenticated");
      assert.equal((await ctx.db.query(`select * from public.world_avatar_shots`)).rows.length, 0);
      const me2 = (await ctx.db.query(`select public.current_user_id() as id`)).rows[0].id;
      assert.ok((await attempt(ctx.db, `insert into public.world_avatar_shots (user_id, image) values ($1, decode($2, 'base64'))`, [me2, webp()])).error);
    } finally {
      await ctx.db.exec("rollback");
    }
  });
});
