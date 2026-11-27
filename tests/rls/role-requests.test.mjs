/**
 * 시작 화면의 역할 고르기 · 임원진 (2026-10-30)
 *
 *   목사님 신청      이름 없이 → 승인하면 role = pastor
 *   임원진 신청      이름 없이 → role = officer · is_officer
 *                    리더 이름을 걸면 → 이름이 이어지고 role = leader · is_officer (리더 기능 그대로)
 *   임원진이 하는 것 전체 명단 읽기 · 전체 명단 엑셀 로그. 보고서 · 기도제목은 못 본다
 *   is_officer 는 본인이 켤 수 없다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAuthUser, asUser, attempt, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});

after(async () => {
  await ctx?.db?.close?.();
});

/** 처음 로그인한 사람 — pending 계정까지 만든다 */
async function newcomer(name) {
  const authId = await createUnlinkedAuthUser(ctx, "google", name);
  await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
  return authId;
}
const as = (authId, sql, params = [], opts) => asAuthUser(ctx, authId, (db) => attempt(db, sql, params), opts);

async function approve(authId) {
  const { rows } = await ctx.db.query(
    `select a.id from public.applications a join public.users u on u.id = a.user_id
      where u.auth_user_id = $1 and a.status = 'pending'`, [authId]);
  const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.approve_application($1)`, [rows[0].id]), { commit: true });
  assert.equal(r.error, null, r.error);
}
async function userOf(authId) {
  return (await ctx.db.query(`select role, is_officer from public.users where auth_user_id = $1`, [authId])).rows[0];
}
/** 계정이 없는 리더 이름 하나 — 운영자가 연결을 떼어 만든다(3목장은 피한다) */
async function freeLeader() {
  const { rows } = await ctx.db.query(
    `select p.id, p.group_id from public.persons p join public.groups g on g.id = p.group_id
      where g.number not in (3, 7) and p.group_role = 'leader' and p.status = 'active'
        and p.user_id is not null and not p.is_group_head
      order by g.number desc, p.name limit 1`);
  await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1)`, [rows[0].id]), { commit: true });
  return rows[0];
}

describe("목사님 신청", () => {
  it("이름 없이 신청 → 운영자 승인 → pastor ★", async () => {
    const me = await newcomer("새목사");
    const r = await as(me, `select public.request_role('pastor')`, [], { commit: true });
    assert.equal(r.error, null, r.error);
    const ctxRow = (await as(me, `select pending_role, application_status, pending_person_name from public.current_user_context()`)).rows[0];
    assert.deepEqual(ctxRow, { pending_role: "pastor", application_status: "pending", pending_person_name: null });

    const list = await asUser(ctx, "정다슬", async (db) => (await db.query(`select applicant_name, requested_role, person_name from public.list_pending_applications()`)).rows);
    assert.ok(list.some((a) => a.applicant_name === "새목사" && a.requested_role === "pastor" && a.person_name === null));

    await approve(me);
    assert.deepEqual(await userOf(me), { role: "pastor", is_officer: false });
  });

  it("목사님 신청에 이름을 걸 수 없고, 리더 신청은 이 길로 받지 않는다", async () => {
    const me = await newcomer("헛신청");
    const { id } = await freeLeader();
    assert.match((await as(me, `select public.request_role('pastor', $1)`, [id])).error, /이름을 고르지 않습니다/);
    assert.match((await as(me, `select public.request_role('leader')`)).error, /목사님 · 임원진/);
  });

  it("대기 중인 신청이 있으면 또 신청할 수 없다", async () => {
    const me = await newcomer("두번신청");
    assert.equal((await as(me, `select public.request_role('pastor')`, [], { commit: true })).error, null);
    assert.match((await as(me, `select public.request_role('pastor')`)).error, /이미 승인 대기/);
  });

  it("임원진은 리더 이름 없이 신청할 수 없다 ★ (2026-11-06)", async () => {
    const me = await newcomer("이름없는임원");
    assert.match((await as(me, `select public.request_role('officer')`)).error, /리더 이름을 골라/);
  });
});

describe("임원진 — 리더가 아닌", () => {
  let me;
  before(async () => {
    me = await newcomer("새임원");
    // 2026-11-01 전에 받은 이름 없는 임원진 신청 — 이제 request_role 은 받지 않으므로 표에 직접 넣는다
    await ctx.db.query(
      `insert into public.applications (user_id, requested_role) select id, 'officer' from public.users where auth_user_id = $1`, [me]);
    await approve(me);
  });

  it("승인하면 role = officer · is_officer ★", async () => {
    assert.deepEqual(await userOf(me), { role: "officer", is_officer: true });
  });

  it("전체 명단을 읽고 전체 명단 엑셀 로그를 남긴다 ★", async () => {
    const all = (await ctx.db.query(`select count(*)::int as n from public.persons`)).rows[0].n;
    assert.equal((await as(me, `select id from public.persons`)).rows.length, all);
    assert.equal((await as(me, `select public.log_roster_export()`)).error, null);
    assert.ok((await as(me, `select * from public.roster_people()`)).rows.length > 0);
  });

  it("보고서 · 기도제목은 못 보고, 목장 명단 엑셀 · 명단 고치기도 못 한다 ★", async () => {
    assert.equal((await as(me, `select id from public.weekly_records_visible`)).rows.length, 0);
    const g = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
    assert.notEqual((await as(me, `select public.log_roster_export($1)`, [g])).error, null);
    const upd = await as(me, `update public.persons set name = name where group_id = $1 returning id`, [g]);
    assert.equal(upd.error, null);
    assert.equal(upd.rows.length, 0, "고칠 수 있는 행이 없다");
  });
});

describe("임원진 — 목장 리더도 맡은", () => {
  it("리더 이름을 걸면 이어지고 role = leader · is_officer — 자기 목장 기록도 본다 ★", async () => {
    const me = await newcomer("리더임원");
    const leader = await freeLeader();
    assert.equal((await as(me, `select public.request_role('officer', $1)`, [leader.id], { commit: true })).error, null);
    await approve(me);
    assert.deepEqual(await userOf(me), { role: "leader", is_officer: true });
    const linked = (await ctx.db.query(`select u.auth_user_id from public.persons p join public.users u on u.id = p.user_id where p.id = $1`, [leader.id])).rows[0];
    assert.equal(linked.auth_user_id, me);
    assert.equal((await as(me, `select public.is_leader_of($1) as ok`, [leader.group_id])).rows[0].ok, true);
    assert.equal((await as(me, `select public.log_roster_export()`)).error, null, "전체 명단도 받는다");
  });
});

describe("다른 사람은 바뀌지 않는다", () => {
  it("일반 리더는 전체 명단 엑셀을 받지 못한다 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.log_roster_export()`));
    assert.match(r.error, /목사님 · 운영자 · 임원진/);
  });

  it("is_officer 는 본인이 켤 수 없다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `update public.users set is_officer = true where id = public.current_user_id()`));
    assert.notEqual(r.error, null);
  });

  it("예전 리더 신청은 그대로 — requested_role 기본값 leader", async () => {
    const { rows } = await ctx.db.query(`select distinct requested_role from public.applications where person_id is not null and requested_role <> 'officer'`);
    assert.deepEqual(rows.map((r) => r.requested_role), ["leader"]);
  });
});

describe("신청 취소 (2026-11-05)", () => {
  it("본인의 대기 신청만 지우고, 다시 고를 수 있다", async () => {
    const me = await newcomer("잘못고른사람");
    assert.equal((await as(me, `select public.request_role('pastor')`, [], { commit: true })).error, null);
    const other = await newcomer("다른사람");
    assert.equal((await as(other, `select public.request_role('pastor')`, [], { commit: true })).error, null);

    assert.equal((await as(me, `select public.cancel_my_application()`, [], { commit: true })).error, null);
    const ctxRow = (await as(me, `select application_status from public.current_user_context()`)).rows[0];
    assert.equal(ctxRow.application_status, null);
    const otherRow = (await as(other, `select application_status from public.current_user_context()`)).rows[0];
    assert.equal(otherRow.application_status, "pending", "남의 신청은 그대로");
    assert.equal((await as(me, `select public.request_role('pastor')`, [], { commit: true })).error, null, "다시 신청할 수 있다");
  });
});
