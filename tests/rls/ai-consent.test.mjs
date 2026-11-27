/**
 * AI 는 동의한 사람만(2026-11-13 옵트인) — persons.ai_consented_at 이 정답, ai_excluded 는 그 그림자
 *
 * 시드 기준: 운영자 정다슬 · 목사님 임찬양 · 3목장 리더 권다움. 시드의 사람은 모두 동의한 것으로 시작한다(seed.sql 끝).
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let memberId;
let groupId;

before(async () => {
  ctx = await createTestDb();
  const leader = (await ctx.db.query(`select group_id from public.persons where name = '권다움'`)).rows[0];
  groupId = leader.group_id;
  memberId = (await ctx.db.query(`select id from public.persons where group_id = $1 and group_role = 'member' and status = 'active' order by id limit 1`, [groupId])).rows[0].id;
});
after(async () => {
  await ctx?.db?.close?.();
});

const state = async (id) => (await ctx.db.query(`select ai_consented_at, ai_excluded from public.persons where id = $1`, [id])).rows[0];
const run = (who, sql, params = []) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });

describe("AI 동의(옵트인)", () => {
  it("동의일이 없으면 AI 에서 빠지고, 있으면 들어간다 — ai_excluded 는 저절로 맞춰진다 ★", async () => {
    assert.equal((await run("임찬양", `update public.persons set ai_consented_at = null where id = $1`, [memberId])).error, null);
    assert.equal((await state(memberId)).ai_excluded, true);
    assert.equal((await run("정다슬", `update public.persons set ai_consented_at = now() where id = $1`, [memberId])).error, null);
    assert.equal((await state(memberId)).ai_excluded, false);
  });

  it("ai_excluded 를 직접 쓰지 못한다(쓰기 권한 없음) ★", async () => {
    const r = await run("정다슬", `update public.persons set ai_excluded = true where id = $1`, [memberId]);
    assert.match(r.error ?? "", /permission denied/);
    assert.equal((await state(memberId)).ai_excluded, false);
  });

  it("리더는 동의를 적거나 거두지 못한다", async () => {
    const r = await run("권다움", `update public.persons set ai_consented_at = null where id = $1`, [memberId]);
    assert.match(r.error ?? "", /AI 동의/);
    assert.notEqual((await state(memberId)).ai_consented_at, null);
  });

  it("리더가 새로 넣는 사람은 동의 전(AI 에서 빠진 채)으로 시작하고, 동의일을 실어 넣을 수 없다 ★", async () => {
    const ok = await run("권다움", `insert into public.persons (group_id, name, group_role, status) values ($1, '새얼굴', 'member', 'active') returning id`, [groupId]);
    assert.equal(ok.error, null);
    const id = ok.rows[0].id;
    const s = await state(id);
    assert.equal(s.ai_consented_at, null);
    assert.equal(s.ai_excluded, true);
    const bad = await run("권다움", `insert into public.persons (group_id, name, group_role, status, ai_consented_at) values ($1, '새얼굴둘', 'member', 'active', now())`, [groupId]);
    assert.match(bad.error ?? "", /AI 동의/);
    await ctx.db.query(`delete from public.persons where id = $1`, [id]);
  });

  it("기본값으로 넣으면(운영자 · 시드 경로) 동의 전이다", async () => {
    const id = (await ctx.db.query(`insert into public.persons (group_id, name, group_role, status, joined_at) values ($1, '기본값', 'member', 'active', date '2026-11-13') returning id`, [groupId])).rows[0].id;
    assert.equal((await state(id)).ai_excluded, true);
    await ctx.db.query(`delete from public.persons where id = $1`, [id]);
  });
});

describe("내 AI 동의(로그인하는 사람 본인, 2026-11-13)", () => {
  const mine = async (who) => (await run(who, `select public.my_ai_consent() as at`)).rows?.[0]?.at ?? null;
  const set = (who, on) => run(who, `select public.set_my_ai_consent($1) as at`, [on]);
  const leaderRow = async () => (await ctx.db.query(`select id, ai_consented_at, ai_excluded from public.persons where name = '권다움'`)).rows[0];

  it("리더는 자기 행만 켜고 끈다 — 끄면 AI 에서 빠지고, 켜면 동의일이 생긴다 ★", async () => {
    assert.equal((await set("권다움", false)).error, null);
    assert.equal(await mine("권다움"), null);
    assert.equal((await leaderRow()).ai_excluded, true);
    const on = await set("권다움", true);
    assert.equal(on.error, null);
    assert.ok(on.rows[0].at, "동의일을 돌려준다");
    const row = await leaderRow();
    assert.ok(row.ai_consented_at);
    assert.equal(row.ai_excluded, false);
  });

  it("이미 켠 것을 다시 켜도 동의일은 그대로다", async () => {
    const before = (await leaderRow()).ai_consented_at;
    await set("권다움", true);
    assert.deepEqual((await leaderRow()).ai_consented_at, before);
  });

  it("다른 사람 행은 이 함수로 못 바꾼다 — 같은 목장 양은 그대로", async () => {
    const before = await state(memberId);
    await set("권다움", false);
    assert.deepEqual(await state(memberId), before);
    await set("권다움", true);
  });

  it("명단과 연결되지 않은 계정(운영자 · 목사님)은 못 한다", async () => {
    for (const who of ["정다슬", "임찬양"]) {
      const r = await set(who, true);
      assert.match(r.error ?? "", /명단과 연결된 계정만/, who);
    }
  });

  it("함수 밖에서는 여전히 리더가 자기 동의를 직접 못 고친다", async () => {
    const id = (await leaderRow()).id;
    const r = await run("권다움", `update public.persons set ai_consented_at = null where id = $1`, [id]);
    assert.match(r.error ?? "", /AI 동의/);
  });
});
