/**
 * 목장 탭 배경 — 우리 목장 집 안 사진 (2026-10-24)
 *
 *   쓰기   world_set_room_shot(base64) — 목장 리더만, 자기 목장 칸에만. WebP('RIFF' ···· 'WEBP')만, 1KB~600KB
 *   읽기   승인된 앱 사용자 누구나(world_room_shots select) — 표를 직접 쓰지는 못한다
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

async function as(name, fn) {
  await ctx.db.exec("begin");
  try {
    await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[name], role: "authenticated" })]);
    await ctx.db.exec("set local role authenticated");
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}

/** 크기만 맞춘 가짜 WebP — 'RIFF' + 길이 4바이트 + 'WEBP' + 채움 */
const webp = (size = 2000) => {
  const b = Buffer.alloc(size, 7);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(size - 8, 4);
  b.write("WEBP", 8, "ascii");
  return b.toString("base64");
};
const save = (db, b64) => attempt(db, `select public.world_set_room_shot($1) as at`, [b64]);

describe("집 안 사진 저장", () => {
  it("목장 리더는 자기 목장 칸에 저장한다 — 다시 저장하면 바뀐다", async () => {
    await as(L1, async (db) => {
      const first = await save(db, webp(2000));
      assert.equal(first.error, null, first.error);
      const second = await save(db, webp(3000));
      assert.equal(second.error, null, second.error);
      const rows = (await db.query(`select group_id, octet_length(image) as n from public.world_room_shots`)).rows;
      assert.deepEqual(rows.map((r) => [r.group_id, Number(r.n)]), [[g1, 3000]]);
    });
  });

  it("WebP 가 아니거나 크기가 맞지 않으면 거절한다", async () => {
    await as(L1, async (db) => {
      assert.ok((await save(db, Buffer.alloc(2000, 1).toString("base64"))).error, "WebP 아님");
      assert.ok((await save(db, webp(500))).error, "너무 작음");
      assert.ok((await save(db, webp(700_000))).error, "너무 큼");
      assert.ok((await save(db, "!!!")).error, "base64 아님");
    });
  });

  it("목장 리더가 아니면(목사님) 저장하지 못한다", async () => {
    await as("임찬양", async (db) => {
      const r = await save(db, webp());
      assert.ok(r.error);
    });
  });

  it("표를 직접 쓰지 못한다 — 다른 목장 칸에도", async () => {
    await as(L1, async (db) => {
      const r = await attempt(db, `insert into public.world_room_shots (group_id, image) values ($1, decode($2, 'base64'))`, [g2, webp()]);
      assert.ok(r.error);
    });
  });
});

describe("집 안 사진 읽기", () => {
  it("다른 목장 리더 · 목사님도 읽는다", async () => {
    await ctx.db.exec("begin");
    try {
      await ctx.db.query(`insert into public.world_room_shots (group_id, image) values ($1, decode($2, 'base64'))`, [g1, webp()]);
      for (const who of [L2, "임찬양"]) {
        await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[who], role: "authenticated" })]);
        await ctx.db.exec("set local role authenticated");
        const rows = (await ctx.db.query(`select group_id from public.world_room_shots`)).rows;
        assert.deepEqual(rows.map((r) => r.group_id), [g1], who);
        await ctx.db.exec("reset role");
      }
    } finally {
      await ctx.db.exec("rollback");
    }
  });
});
