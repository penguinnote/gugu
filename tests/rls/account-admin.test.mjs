/**
 * 계정 권한 관리 (2026-11-05) — admin_update_account · unlink_person_account 의 임원진 내리기
 *
 * 시드 기준: 운영자 정다슬 · 목사님 임찬양 · 3목장 리더 권다움 · 김빛나
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});

after(async () => {
  await ctx?.db?.close?.();
});

const userOf = async (name) =>
  (await ctx.db.query(
    `select u.id, u.role, u.is_officer, u.status from public.users u
      left join public.persons p on p.user_id = u.id
     where u.name = $1 or p.name = $1 limit 1`, [name])).rows[0];
const act = (who, target, action) =>
  asUser(ctx, who, (db) => attempt(db, `select public.admin_update_account($1, $2)`, [target, action]), { commit: true });

describe("운영자의 계정 권한 고치기", () => {
  it("운영자가 아니면 못 한다 ★", async () => {
    const t = await userOf("김빛나");
    for (const who of ["권다움", "임찬양"]) {
      const r = await act(who, t.id, "officer_on");
      assert.match(r.error ?? "", /운영자만/, who);
    }
  });

  it("리더에게 임원진을 맡기고 거둔다", async () => {
    const t = await userOf("김빛나");
    assert.equal((await act("정다슬", t.id, "officer_on")).error, null);
    assert.equal((await userOf("김빛나")).is_officer, true);
    assert.equal((await act("정다슬", t.id, "officer_off")).error, null);
    const after = await userOf("김빛나");
    assert.equal(after.is_officer, false);
    assert.equal(after.role, "leader", "리더 권한은 그대로");
  });

  it("목사님 권한을 거두면 신청 전 상태가 되고, 잠그고 풀 수 있다 ★", async () => {
    const t = await userOf("임찬양");
    try {
      assert.equal((await act("정다슬", t.id, "pastor_off")).error, null);
      assert.equal((await userOf("임찬양")).role, "pending");
      assert.equal((await act("정다슬", t.id, "lock")).error, null);
      assert.equal((await userOf("임찬양")).status, "inactive");
      assert.equal((await act("정다슬", t.id, "unlock")).error, null);
      assert.equal((await userOf("임찬양")).status, "active");
    } finally {
      await ctx.db.query(`update public.users set role = 'pastor', status = 'active' where id = $1`, [t.id]);
    }
  });

  it("자기 자신과 운영자 계정은 못 고친다", async () => {
    const me = await userOf("정다슬");
    const r = await act("정다슬", me.id, "lock");
    assert.match(r.error ?? "", /운영자 계정/);
  });

  it("로그인 없는 옛 행(초기화로 남은 기록)은 풀거나 고칠 수 없다 — 같은 사람 두 줄 막기 ★", async () => {
    const old = (await ctx.db.query(
      `insert into public.users (name, role, status) values ('김빛나', 'leader', 'inactive') returning id`)).rows[0].id;
    try {
      for (const action of ["unlock", "lock", "officer_on"]) {
        const r = await act("정다슬", old, action);
        assert.match(r.error ?? "", /옛 계정/, action);
      }
      const row = (await ctx.db.query(`select status, is_officer from public.users where id = $1`, [old])).rows[0];
      assert.deepEqual(row, { status: "inactive", is_officer: false });
    } finally {
      await ctx.db.query(`delete from public.users where id = $1`, [old]);
    }
  });

  it("리더 아닌 계정에 임원진을 맡길 수 없다", async () => {
    const t = await userOf("임찬양");
    const r = await act("정다슬", t.id, "officer_on");
    assert.match(r.error ?? "", /목장 리더에게만/);
  });
});

describe("명단 연결 해제는 임원진도 내린다", () => {
  it("연결을 떼면 is_officer 가 꺼진다 ★", async () => {
    const t = await userOf("김빛나");
    await ctx.db.query(`update public.users set is_officer = true where id = $1`, [t.id]);
    const person = (await ctx.db.query(`select id from public.persons where user_id = $1`, [t.id])).rows[0].id;
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.unlink_person_account($1)`, [person]), { commit: true });
    assert.equal(r.error, null, r.error);
    const after = (await ctx.db.query(`select role, is_officer from public.users where id = $1`, [t.id])).rows[0];
    assert.deepEqual(after, { role: "pending", is_officer: false });
  });
});

describe("잠긴 계정 안내 (2026-11-05)", () => {
  it("본인 계정이 잠겼는지만 알려 준다", async () => {
    const t = await userOf("임찬양");
    const authId = (await ctx.db.query(`select auth_user_id from public.users where id = $1`, [t.id])).rows[0].auth_user_id;
    const { asAuthUser } = await import("./harness.mjs");
    const ask = () => asAuthUser(ctx, authId, async (db) => (await db.query(`select public.my_account_locked() as v`)).rows[0].v);
    assert.equal(await ask(), false);
    await ctx.db.query(`update public.users set status = 'inactive' where id = $1`, [t.id]);
    try {
      assert.equal(await ask(), true);
    } finally {
      await ctx.db.query(`update public.users set status = 'active' where id = $1`, [t.id]);
    }
  });
});

describe("잠긴 계정은 승인하지 않는다 (2026-11-06)", () => {
  it("잠그면 걸어 둔 신청이 닫히고, 잠긴 계정의 신청은 승인되지 않는다 ★", async () => {
    const { asAuthUser, createUnlinkedAuthUser } = await import("./harness.mjs");
    const authId = await createUnlinkedAuthUser(ctx, "google", "잠길사람");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    await asAuthUser(ctx, authId, (db) => db.query(`select public.request_role('pastor')`), { commit: true });
    const uid = (await ctx.db.query(`select id from public.users where auth_user_id = $1`, [authId])).rows[0].id;

    assert.equal((await act("정다슬", uid, "lock")).error, null);
    const st = (await ctx.db.query(`select status from public.applications where user_id = $1`, [uid])).rows.map((r) => r.status);
    assert.deepEqual(st, ["rejected"]);

    // 잠긴 채로 새 신청이 들어와도(표에 직접) 승인은 막힌다
    const app = (await ctx.db.query(`insert into public.applications (user_id, requested_role) values ($1, 'pastor') returning id`, [uid])).rows[0].id;
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.approve_application($1)`, [app]), { commit: true });
    assert.match(r.error ?? "", /잠긴 계정/);
  });
});
