/**
 * 프로필 사진(2026-11-11) — 계정마다 한 장, 본인만 정하고 지운다. 다른 사람 것은 명단 사람 단위로 승인된 앱 사용자가 본다.
 *   set_profile_photo — WebP · JPEG 만, 200B~300KB, 미승인은 막힘
 *   person_photos(ids) · person_photo(id) — 앱 사용자 누구나, 미승인 · 익명은 막힘
 *   표 직접 읽기는 본인 행만
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let leaderPerson;

const webp = (n = 2000) => {
  const b = Buffer.alloc(n);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  return b.toString("base64");
};
const jpeg = (n = 2000) => {
  const b = Buffer.alloc(n);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  return b.toString("base64");
};

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  leaderPerson = (await db.query(`select p.id from public.persons p join public.users u on u.id = p.user_id where u.name = '권다움'`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

describe("프로필 사진", () => {
  it("본인이 정하면 다른 앱 사용자가 명단 사람으로 본다 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.set_profile_photo($1)`, [webp()]), { commit: true });
    assert.equal(r.error, null, r.error ?? "");
    const list = await asUser(ctx, "임찬양", async (db) => (await db.query(`select person_id from public.person_photos($1::uuid[])`, [[leaderPerson]])).rows);
    assert.deepEqual(list.map((x) => x.person_id), [leaderPerson]);
    const img = await asUser(ctx, "정다슬", async (db) => (await db.query(`select public.person_photo($1) as i`, [leaderPerson])).rows[0].i);
    assert.ok(img && img.length === 2000);
  });

  it("JPEG 도 되고, 다른 형식 · 너무 작거나 큰 것은 막힌다", async () => {
    const ok = await asUser(ctx, "권다움", (db) => attempt(db, `select public.set_profile_photo($1)`, [jpeg()]));
    assert.equal(ok.error, null, ok.error ?? "");
    const png = Buffer.alloc(2000); png.write("\x89PNG", 0, "latin1");
    for (const bad of [png.toString("base64"), webp(100), webp(310000), "!!!"]) {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.set_profile_photo($1)`, [bad]));
      assert.equal(r.code, "22023", `받으면 안 된다: ${bad.slice(0, 12)}`);
    }
  });

  it("표는 본인 행만, 미승인 · 익명은 막힌다", async () => {
    const other = await asUser(ctx, "임찬양", async (db) => (await db.query(`select user_id from public.profile_photos`)).rows);
    assert.equal(other.length, 0);
    const own = await asUser(ctx, "권다움", async (db) => (await db.query(`select user_id from public.profile_photos`)).rows);
    assert.equal(own.length, 1);
    const pending = await asUser(ctx, "한이음", (db) => attempt(db, `select public.set_profile_photo($1)`, [webp()]));
    assert.equal(pending.code, "42501");
    const pendingRead = await asUser(ctx, "한이음", async (db) => (await db.query(`select * from public.person_photos($1::uuid[])`, [[leaderPerson]])).rows);
    assert.equal(pendingRead.length, 0);
    const anon = await asAnon(ctx, (db) => attempt(db, `select * from public.person_photos($1::uuid[])`, [[leaderPerson]]));
    assert.notEqual(anon.error, null);
  });

  it("지우면 사라진다", async () => {
    await asUser(ctx, "권다움", (db) => db.query(`select public.clear_profile_photo()`), { commit: true });
    const list = await asUser(ctx, "임찬양", async (db) => (await db.query(`select person_id from public.person_photos($1::uuid[])`, [[leaderPerson]])).rows);
    assert.equal(list.length, 0);
  });
});
