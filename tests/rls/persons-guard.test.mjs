/**
 * 명단을 API 로 직접 바꿀 때의 한계 (2026-11-06) — 화면이 막던 것을 데이터베이스도 막는다(persons_staff_only)
 * 시드 기준: 3목장 리더 권다움 · 김빛나 / 운영자 정다슬
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

let n = 0;
const member = async (status = "active") =>
  (await ctx.db.query(
    `insert into public.persons (name, group_id, group_role, status, joined_at) values ($3, $1, 'member', $2, date '2026-09-28') returning id`,
    [g3, status, `시험양${++n}`])).rows[0].id;
const upd = (who, sql, params) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });

describe("리더가 직접 바꿀 수 없는 것", () => {
  it("기록 제외를 풀지도, 걸지도 못한다 ★", async () => {
    const out = await member("opted_out");
    assert.match((await upd("권다움", `update public.persons set status = 'active' where id = $1`, [out])).error ?? "", /기록 제외/);
    const p = await member();
    assert.match((await upd("권다움", `update public.persons set status = 'opted_out' where id = $1`, [p])).error ?? "", /기록 제외/);
  });

  it("들어온 날을 바꾸지 못하고, 새로 넣으면 오늘로 들어간다 ★", async () => {
    const p = await member();
    assert.match((await upd("권다움", `update public.persons set joined_at = date '2099-01-01' where id = $1`, [p])).error ?? "", /들어온 날/);
    const ins = await upd("권다움",
      `insert into public.persons (name, group_id, group_role, status, joined_at, care_status) values ('새양', $1, 'member', 'active', date '2099-01-01', 'other_church') returning joined_at::text, care_status`, [g3]);
    assert.equal(ins.error, null, ins.error);
    const today = (await ctx.db.query(`select ((now() at time zone 'Asia/Seoul')::date)::text as d`)).rows[0].d;
    assert.deepEqual(ins.rows[0], { joined_at: today, care_status: "active" });
  });

  it("공동 리더를 휴면 · 이탈로 바꾸거나 목장장을 바꾸지 못한다 ★", async () => {
    const co = (await ctx.db.query(`select id from public.persons where name = '김빛나'`)).rows[0].id;
    assert.match((await upd("권다움", `update public.persons set status = 'dormant' where id = $1`, [co])).error ?? "", /리더의 상태/);
    assert.match((await upd("권다움", `update public.persons set is_group_head = true where id = $1`, [co])).error ?? "", /목장장/);
  });

  it("양을 떠났어요 · 되돌리기는 그대로 된다", async () => {
    const p = await member();
    assert.equal((await upd("권다움", `update public.persons set status = 'left' where id = $1`, [p])).error, null);
    assert.equal((await upd("권다움", `update public.persons set status = 'active' where id = $1`, [p])).error, null);
  });

  it("운영자는 다 바꾼다", async () => {
    const p = await member();
    for (const sql of [
      `update public.persons set joined_at = date '2026-10-04' where id = $1`,
      `update public.persons set status = 'opted_out' where id = $1`,
      `update public.persons set status = 'active' where id = $1`,
    ]) assert.equal((await upd("정다슬", sql, [p])).error, null, sql);
  });
});

describe("휴주 · 잠긴 계정", () => {
  it("휴주가 된 주는 처음 제출하지 못한다", async () => {
    const week = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
    const rid = (await upd("권다움", `select public.open_report($1, $2::date) as id`, [g3, week])).rows[0].id;
    await ctx.db.query(`update public.reports set submitted_at = null, submitted_by = null, is_late = false where id = $1`, [rid]);
    await ctx.db.query(`insert into public.skipped_weeks (week_key) values ($1) on conflict do nothing`, [week]);
    try {
      const r = await upd("권다움", `select public.submit_report($1, '[]'::jsonb)`, [rid]);
      assert.match(r.error ?? "", /휴주/);
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [week]);
    }
  });
});

describe("목장장 정하기 (2026-11-06)", () => {
  const head = async (name) => (await ctx.db.query(`select is_group_head from public.persons where name = $1`, [name])).rows[0].is_group_head;
  const pid = async (name) => (await ctx.db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;

  it("그 목장 리더는 함수로 목장장을 정하고, 전 목장장은 풀린다 ★", async () => {
    const before = (await ctx.db.query(`select name from public.persons where group_id = $1 and is_group_head`, [g3])).rows.map((r) => r.name);
    const target = (await ctx.db.query(`select name from public.persons where group_id = $1 and group_role = 'leader' and status = 'active' and not is_group_head limit 1`, [g3])).rows[0].name;
    const r = await upd("권다움", `select public.set_group_head($1, true)`, [await pid(target)]);
    assert.equal(r.error, null, r.error);
    assert.equal(await head(target), true);
    for (const n of before) assert.equal(await head(n), false, `${n} 은 풀려야 한다`);
    const heads = (await ctx.db.query(`select count(*)::int as n from public.persons where group_id = $1 and is_group_head`, [g3])).rows[0].n;
    assert.equal(heads, 1);
  });

  it("양은 목장장이 될 수 없고, 다른 목장 리더는 정하지 못한다", async () => {
    const m = await member();
    assert.match((await upd("권다움", `select public.set_group_head($1, true)`, [m])).error ?? "", /리더만/);
    const g7leader = (await ctx.db.query(`select p.id from public.persons p join public.groups g on g.id = p.group_id where g.number = 7 and p.group_role = 'leader' limit 1`)).rows[0].id;
    assert.match((await upd("권다움", `select public.set_group_head($1, true)`, [g7leader])).error ?? "", /정할 수 없습니다/);
  });

  it("함수 밖에서 직접 바꾸는 것은 여전히 막힌다", async () => {
    const notHead = (await ctx.db.query(`select id from public.persons where group_id = $1 and group_role = 'leader' and not is_group_head limit 1`, [g3])).rows[0].id;
    assert.match((await upd("권다움", `update public.persons set is_group_head = true where id = $1`, [notHead])).error ?? "", /목장장/);
  });
});

describe("감사 3차 (2026-11-06)", () => {
  it("리더를 양으로 내리기는 목사님 · 운영자만", async () => {
    const free = (await ctx.db.query(
      `insert into public.persons (name, group_id, group_role, status, joined_at) values ('자리리더', $1, 'leader', 'active', date '2026-09-28') returning id`, [g3])).rows[0].id;
    assert.match((await upd("권다움", `update public.persons set group_role = 'member' where id = $1`, [free])).error ?? "", /목사님 · 운영자/);
    assert.equal((await upd("임찬양", `update public.persons set group_role = 'member' where id = $1`, [free])).error, null);
  });

  it("떠났어요 되돌리기는 30분 안에만 ★", async () => {
    const p = await member();
    assert.equal((await upd("권다움", `update public.persons set status = 'left' where id = $1`, [p])).error, null);
    await ctx.db.query(`update public.persons set left_at = now() - interval '2 hours' where id = $1`, [p]);
    assert.match((await upd("권다움", `update public.persons set status = 'active' where id = $1`, [p])).error ?? "", /운영자/);
    assert.equal((await upd("정다슬", `update public.persons set status = 'active' where id = $1`, [p])).error, null, "운영자는 된다");
  });

  it("휴주의 주차는 고치기로 바꿀 수 없다", async () => {
    const next = (await ctx.db.query(`select (public.kst_current_week() + 14)::text as w`)).rows[0].w;
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '방학')`, [next]);
    try {
      const r = await upd("정다슬", `update public.skipped_weeks set week_key = week_key + 7 where week_key = $1`, [next]);
      assert.match(r.error ?? "", /주차는 바꿀 수 없습니다/);
      assert.equal((await upd("정다슬", `update public.skipped_weeks set reason = '수련회' where week_key = $1`, [next])).error, null, "사유는 고친다");
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [next]);
    }
  });
});

describe("사각지대는 보고서를 낸 주로만 (2026-11-06)", () => {
  it("보고서를 안 낸 목장은 '4주 목장 불참' 으로 잡히지 않는다 ★", async () => {
    const orig = (await ctx.db.query(`select id, submitted_at, submitted_by, is_late from public.reports where group_id = $1`, [g3])).rows;
    await ctx.db.query(`update public.reports set submitted_at = null, submitted_by = null, is_late = false where group_id = $1`, [g3]);
    try {
      const rows = await asUser(ctx, "임찬양", async (db) =>
        (await db.query(`select group_id, meeting_gap, contact_gap from public.care_blind_spots(public.kst_current_week())`)).rows);
      const g3rows = rows.filter((r) => r.group_id === g3);
      assert.ok(g3rows.every((r) => r.meeting_gap !== true && r.contact_gap !== true), "안 낸 목장 사람이 공백으로 잡혔다");
    } finally {
      for (const r of orig) {
        await ctx.db.query(`update public.reports set submitted_at = $2, submitted_by = $3, is_late = $4 where id = $1`, [r.id, r.submitted_at, r.submitted_by, r.is_late]);
      }
    }
  });
});
