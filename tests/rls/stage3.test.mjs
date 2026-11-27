/**
 * 감사 3차 · 3단계 (2026-11-06) — 임시 저장 · 목장 모임 없음 · 휴면 신청 · 목장 옮기기 · 지난 주 새 사람
 * 시드 기준: 3목장 리더 권다움 · 김빛나, 목사님 임찬양, 운영자 정다슬
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;
let g7;
let thisWeek;
let n = 0;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
  thisWeek = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
});

after(async () => {
  await ctx?.db?.close?.();
});

const as = (who, sql, params) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });
const member = async (group = g3) =>
  (await ctx.db.query(
    `insert into public.persons (name, group_id, group_role, status, joined_at) values ($2, $1, 'member', 'active', date '2026-09-28') returning id`,
    [group, `삼단계양${++n}`])).rows[0].id;

/** 이번 주 보고서를 비우고 다시 연다 */
async function freshReport() {
  await ctx.db.query(`delete from public.events where report_id in (select id from public.reports where group_id = $1 and week_key = $2)`, [g3, thisWeek]);
  await ctx.db.query(`delete from public.reports where group_id = $1 and week_key = $2`, [g3, thisWeek]);
  return (await as("권다움", `select public.open_report($1, $2::date) as id`, [g3, thisWeek])).rows[0].id;
}

describe("임시 저장", () => {
  it("다 채우지 않아도 쓴 만큼 남고, 제출은 되지 않는다 ★", async () => {
    const rid = await freshReport();
    const one = (await ctx.db.query(`select id from public.persons where group_id = $1 and status = 'active' and group_role = 'member' limit 1`, [g3])).rows[0].id;
    const rows = [
      { person_id: one, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: true, prayer_request: "기도" } },
    ];
    const r = await as("권다움", `select public.submit_report($1, $2::jsonb, null, false, null, false, false) as r`, [rid, JSON.stringify(rows)]);
    assert.equal(r.error, null, r.error);
    assert.equal(r.rows[0].r.submitted, false);
    assert.equal(r.rows[0].r.saved, true);
    const rep = (await ctx.db.query(`select submitted_at from public.reports where id = $1`, [rid])).rows[0];
    assert.equal(rep.submitted_at, null);
    const saved = (await ctx.db.query(`select count(*)::int as n from public.weekly_records where report_id = $1`, [rid])).rows[0].n;
    assert.equal(saved, 1, "쓴 한 명이 남았다");
  });
});

describe("목장 모임 없음", () => {
  it("켜면 보고서에 남고, 그 주는 목장 불참으로 세지 않는다", async () => {
    const rid = await freshReport();
    const r = await as("권다움", `select public.submit_report($1, '[]'::jsonb, null, false, null, false, false, true) as r`, [rid]);
    assert.equal(r.error, null, r.error);
    const rep = (await ctx.db.query(`select no_meeting from public.reports where id = $1`, [rid])).rows[0];
    assert.equal(rep.no_meeting, true);
  });
});

describe("상태 · 판정 태그(2026-11-17 — 휴면 신청을 없애고 리더가 바로 바꾼다)", () => {
  it("리더는 자기 목장 양을 휴면으로 바꾸고 되돌리며, 판정 태그도 바꾼다 ★", async () => {
    const p = await member();
    assert.equal((await as("권다움", `update public.persons set status = 'dormant' where id = $1 returning id`, [p])).error, null);
    assert.equal((await ctx.db.query(`select status from public.persons where id = $1`, [p])).rows[0].status, "dormant");
    assert.equal((await as("권다움", `update public.persons set status = 'active' where id = $1 returning id`, [p])).error, null);
    const tag = await as("권다움", `update public.persons set care_status = 'military' where id = $1 returning care_status`, [p]);
    assert.equal(tag.error, null, tag.error ?? "");
    assert.equal((await ctx.db.query(`select care_status from public.persons where id = $1`, [p])).rows[0].care_status, "military");
  });

  it("다른 목장 사람은 못 바꾼다 · 휴면 신청 함수는 없다", async () => {
    const other = await member(g7);
    const r = await as("권다움", `update public.persons set care_status = 'remote' where id = $1 returning id`, [other]);
    assert.ok(r.error || r.rows.length === 0);
    assert.equal((await ctx.db.query(`select care_status from public.persons where id = $1`, [other])).rows[0].care_status, "active");
    const fns = (await ctx.db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('request_dormancy', 'decide_dormancy')`)).rows[0].n;
    assert.equal(fns, 0);
  });

  it("목사님도 판정 태그를 바꾼다", async () => {
    const p = await member(g7);
    assert.equal((await as("임찬양", `update public.persons set care_status = 'weekend_work' where id = $1 returning id`, [p])).error, null);
  });
});

describe("목장 옮기기", () => {
  it("목사님이 옮기고, 리더는 못 옮긴다 ★", async () => {
    const p = await member();
    assert.match((await as("권다움", `select public.move_person_group($1, $2)`, [p, g7])).error ?? "", /목사님 · 운영자/);
    assert.equal((await as("임찬양", `select public.move_person_group($1, $2)`, [p, g7])).error, null);
    assert.equal((await ctx.db.query(`select group_id from public.persons where id = $1`, [p])).rows[0].group_id, g7);
  });

  it("계정이 연결된 리더는 여기서 옮기지 않는다", async () => {
    const linked = (await ctx.db.query(`select id from public.persons where group_id = $1 and user_id is not null limit 1`, [g3])).rows[0].id;
    assert.match((await as("임찬양", `select public.move_person_group($1, $2)`, [linked, g7])).error ?? "", /운영자 화면/);
  });
});

describe("지난 주 새 사람", () => {
  it("리더는 들어온 날을 이번 주 앞 3주까지만 앞당긴다", async () => {
    const back2 = (await ctx.db.query(`select ($1::date - 14)::text as d`, [thisWeek])).rows[0].d;
    const r = await as("권다움",
      `insert into public.persons (name, group_id, group_role, status, joined_at) values ('늦게온양', $1, 'member', 'active', $2::date) returning joined_at::text`, [g3, back2]);
    assert.equal(r.error, null, r.error);
    assert.equal(r.rows[0].joined_at, back2);
    const r2 = await as("권다움",
      `insert into public.persons (name, group_id, group_role, status, joined_at) values ('아주옛양', $1, 'member', 'active', date '2020-01-05') returning joined_at::text`, [g3]);
    const floor = (await ctx.db.query(`select ($1::date - 21)::text as d`, [thisWeek])).rows[0].d;
    assert.equal(r2.rows[0].joined_at, floor);
  });
});
