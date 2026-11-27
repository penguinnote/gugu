/**
 * 내 프로필 글(2026-11-11) — 소개 · 말씀 · 관심사. 본인만 쓰고, 다른 앱 사용자는 명단 사람 단위(person_profile)로 본다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let leaderPerson, memberPerson;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  leaderPerson = (await db.query(`select p.id from public.persons p join public.users u on u.id = p.user_id where u.name = '권다움'`)).rows[0].id;
  memberPerson = (await db.query(`select id from public.persons where user_id is null and status = 'active' limit 1`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const SET = `select public.set_my_profile($1, $2, $3::text[])`;
const GET = `select * from public.person_profile($1)`;

describe("내 프로필 글", () => {
  it("본인이 쓰면 다른 앱 사용자가 명단 사람으로 본다 — 빈 칸 · 겹치는 관심사는 걷는다 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, SET, ["  함께 걸어요  ", "", ["찬양", " 찬양 ", "", "캠핑"]]), { commit: true });
    assert.equal(r.error, null, r.error ?? "");
    const row = await asUser(ctx, "임찬양", async (db) => (await db.query(GET, [leaderPerson])).rows[0]);
    assert.equal(row.has_account, true);
    assert.equal(row.bio, "함께 걸어요");
    assert.equal(row.verse, null);
    assert.deepEqual(row.interests, ["찬양", "캠핑"]);
  });

  it("계정 없는 청년은 글이 없다", async () => {
    const row = await asUser(ctx, "권다움", async (db) => (await db.query(GET, [memberPerson])).rows[0]);
    assert.equal(row.has_account, false);
    assert.equal(row.bio, null);
    assert.deepEqual(row.interests, []);
  });

  it("너무 긴 글 · 관심사 6개 · 긴 관심사는 막힌다", async () => {
    for (const args of [["가".repeat(151), null, []], [null, "나".repeat(101), []], [null, null, ["1", "2", "3", "4", "5", "6"]], [null, null, ["가".repeat(13)]]]) {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, SET, args));
      assert.equal(r.code, "22023");
    }
  });

  it("표는 본인 행만, 미승인 · 익명은 막힌다", async () => {
    assert.equal((await asUser(ctx, "임찬양", async (db) => (await db.query(`select * from public.user_profiles`)).rows)).length, 0);
    assert.equal((await asUser(ctx, "권다움", async (db) => (await db.query(`select * from public.user_profiles`)).rows)).length, 1);
    const pending = await asUser(ctx, "한이음", (db) => attempt(db, SET, ["안녕", null, []]));
    assert.equal(pending.code, "42501");
    assert.equal((await asUser(ctx, "한이음", async (db) => (await db.query(GET, [leaderPerson])).rows)).length, 0);
    const anon = await asAnon(ctx, (db) => attempt(db, GET, [leaderPerson]));
    assert.notEqual(anon.error, null);
  });
});
