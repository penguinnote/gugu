/**
 * 목장 이동 신청(2026-11-26) — 신청 · 수락 · 거절 · 취소 · 2주 기한, 그리고 같은 주 두 보고서 겹치지 않기.
 * 시드: 3 다솜(리더 권다움 · 김빛나, 목장장 권다움) → 9 자람(리더 유바다 · 하도담 …) / 다른 목장 8 아람 리더 송가을 / 목사님 임찬양
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let A; // 다솜
let B; // 자람
let week;
before(async () => {
  ctx = await createTestDb();
  A = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  B = (await ctx.db.query(`select id from public.groups where number = 9`)).rows[0].id;
  week = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
});
after(async () => {
  await ctx?.db?.close?.();
});

const run = (who, sql, params, commit = true) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit });
let n = 0;
/** 다솜에 새 양(기록 없음) */
const newMember = async () =>
  (await ctx.db.query(`insert into public.persons (name, group_id, group_role, status, joined_at) values ($1, $2, 'member', 'active', date '2026-09-28') returning id`, [`이동양${++n}`, A])).rows[0].id;
const request = (who, pid, to = B, note = null) => run(who, `select public.request_group_move($1, $2, $3) as id`, [pid, to, note]);
const decide = (who, id, ok) => run(who, `select public.decide_group_move($1, $2) as r`, [id, ok]);
const personRow = async (pid) => (await ctx.db.query(`select group_id, is_group_head, group_since::text, group_role from public.persons where id = $1`, [pid])).rows[0];

describe("신청", () => {
  it("A 목장 리더만 신청한다 — 다른 목장 리더 · 목사님은 못 한다 ★", async () => {
    const p = await newMember();
    assert.equal((await request("송가을", p)).code, "42501");
    assert.equal((await request("임찬양", p)).code, "42501");
    const r = await request("권다움", p, B, "이사해요");
    assert.equal(r.error, null, r.error ?? "");
    const row = (await ctx.db.query(`select direction, status, note from public.group_moves where id = $1`, [r.rows[0].id])).rows[0];
    assert.deepEqual(row, { direction: "push", status: "pending", note: "이사해요" });
  });

  it("한 사람에게 대기 신청은 하나 · 신청한 사람은 취소한다", async () => {
    const p = await newMember();
    const id = (await request("권다움", p)).rows[0].id;
    assert.equal((await request("김빛나", p)).code, "23505");
    assert.notEqual((await run("김빛나", `select public.cancel_group_move($1)`, [id])).error, null, "다른 리더가 취소했다");
    assert.equal((await run("권다움", `select public.cancel_group_move($1)`, [id])).error, null);
    assert.equal((await request("김빛나", p)).error, null, "취소 뒤 다시 신청");
  });

  it("다른 목장 리더는 신청을 못 본다 — A · B 리더와 목사님은 본다 ★", async () => {
    const p = await newMember();
    const id = (await request("권다움", p)).rows[0].id;
    const sees = async (who) => (await asUser(ctx, who, (db) => db.query(`select id from public.group_moves where id = $1`, [id]))).rows.length;
    const list = async (who) => (await asUser(ctx, who, (db) => db.query(`select id from public.list_group_moves() where id = $1`, [id]))).rows.length;
    assert.equal(await sees("송가을"), 0);
    assert.equal(await list("송가을"), 0);
    for (const who of ["권다움", "유바다", "임찬양"]) {
      assert.equal(await sees(who), 1, who);
      assert.equal(await list(who), 1, who);
    }
  });
});

describe("수락 · 거절", () => {
  it("B 리더나 목사님만 수락 — A 리더 · 다른 목장 리더는 못 한다 ★", async () => {
    const p = await newMember();
    const id = (await request("권다움", p)).rows[0].id;
    assert.equal((await decide("김빛나", id, true)).code, "42501");
    assert.equal((await decide("송가을", id, true)).code, "42501");
    const ok = await decide("유바다", id, true);
    assert.equal(ok.error, null, ok.error ?? "");
    assert.equal((await personRow(p)).group_id, B);

    const p2 = await newMember();
    const id2 = (await request("권다움", p2)).rows[0].id;
    assert.equal((await decide("임찬양", id2, true)).error, null, "목사님도 수락");
    assert.equal((await personRow(p2)).group_id, B);
  });

  it("거절하면 명단은 그대로", async () => {
    const p = await newMember();
    const id = (await request("권다움", p)).rows[0].id;
    assert.equal((await decide("하도담", id, false)).error, null);
    assert.equal((await personRow(p)).group_id, A);
    assert.equal((await ctx.db.query(`select status from public.group_moves where id = $1`, [id])).rows[0].status, "rejected");
  });

  it("수락하면 group_id 가 바뀌고 목장장이 내려간다 — 리더는 리더 그대로 ★", async () => {
    const head = (await ctx.db.query(`select id from public.persons where group_id = $1 and is_group_head`, [A])).rows[0].id;
    const id = (await request("김빛나", head)).rows[0].id; // 목장장(권다움)을 다른 리더가 신청
    assert.equal((await decide("유바다", id, true)).error, null);
    const row = await personRow(head);
    assert.equal(row.group_id, B);
    assert.equal(row.is_group_head, false);
    assert.equal(row.group_role, "leader");
  });

  it("2주 지난 대기 신청은 저절로 닫힌다", async () => {
    const p = await newMember();
    const id = (await request("김빛나", p)).rows[0].id;
    await ctx.db.query(`update public.group_moves set requested_at = now() - interval '15 days' where id = $1`, [id]);
    assert.equal((await asUser(ctx, "유바다", (db) => db.query(`select id from public.list_group_moves() where id = $1`, [id]))).rows.length, 0);
    const d = await decide("유바다", id, true);
    assert.equal(d.rows[0]?.r?.status, "expired", d.error ?? "");
    assert.equal((await ctx.db.query(`select status from public.group_moves where id = $1`, [id])).rows[0].status, "expired");
    assert.equal((await personRow(p)).group_id, A);
  });

  it("리더가 명단을 직접 고쳐 옮긴 주를 바꾸지 못한다", async () => {
    const p = await newMember();
    const r = await run("김빛나", `update public.persons set group_since = date '2020-01-05' where id = $1`, [p]);
    assert.match(r.error ?? "", /목장 이동 처리|permission denied/);
  });
});

describe("데려오기(새가족 추가에서 같은 이름이 다른 목장에 있을 때)", () => {
  it("받을 목장(B) 리더가 걸면 지금 목장(A) 리더나 목사님이 수락 — B 리더는 자기 신청을 수락하지 못한다", async () => {
    const p = await newMember();
    const r = await request("유바다", p, B);
    assert.equal(r.error, null, r.error ?? "");
    const id = r.rows[0].id;
    assert.equal((await ctx.db.query(`select direction from public.group_moves where id = $1`, [id])).rows[0].direction, "pull");
    assert.equal((await decide("하도담", id, true)).code, "42501");
    assert.equal((await decide("김빛나", id, true)).error, null);
    assert.equal((await personRow(p)).group_id, B);
  });
});

describe("이번 주 보고서 — 같은 주 두 목장에 겹치지 않게", () => {
  it("이번 주 기록이 아직 없으면 이번 주부터 B", async () => {
    const p = await newMember();
    const id = (await request("김빛나", p)).rows[0].id;
    await decide("유바다", id, true);
    assert.equal((await personRow(p)).group_since, week);
  });

  it("이번 주 A 보고서에 이미 기록이 있으면 그 주는 A, B 에는 다음 주부터 — B 의 이번 주 보고서에 넣을 수 없다 ★", async () => {
    const p = (await ctx.db.query(
      `select w.person_id from public.weekly_records w join public.persons p on p.id = w.person_id
        where w.week_key = $1 and p.group_id = $2 and p.group_role = 'member' and p.status = 'active' limit 1`, [week, A])).rows[0].person_id;
    const id = (await request("김빛나", p)).rows[0].id;
    assert.equal((await decide("유바다", id, true)).error, null);
    const since = (await personRow(p)).group_since;
    assert.ok(since > week, `다음 주부터여야 한다: ${since}`);
    const rid = (await run("유바다", `select public.open_report($1, $2::date) as id`, [B, week])).rows[0].id;
    const put = await run("유바다", `select public.submit_report($1, $2::jsonb, null, false, null, false, false)`, [
      rid, JSON.stringify([{ person_id: p, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: true } }]),
    ]);
    assert.match(put.error ?? "", /명단에 없는 사람/);
  });
});

describe("계정이 연결된 리더 옮기기", () => {
  it("수락하면 그 리더의 홈(내 목장)과 보고서가 B 가 된다 ★", async () => {
    const leader = (await ctx.db.query(`select id from public.persons where name = '김빛나'`)).rows[0].id;
    const id = (await request("김빛나", leader)).rows[0].id; // 본인 신청(A 리더)
    assert.equal((await decide("하도담", id, true)).error, null);
    const me = (await asUser(ctx, "김빛나", (db) => db.query(`select group_id, group_name, group_role from public.current_user_context()`))).rows[0];
    assert.equal(me.group_id, B);
    assert.equal(me.group_role, "leader");
    const open = await run("김빛나", `select public.open_report($1, $2::date) as id`, [B, week]);
    assert.equal(open.error, null, open.error ?? "B 보고서를 못 연다");
    const old = await run("김빛나", `select public.open_report($1, $2::date) as id`, [A, week]);
    assert.notEqual(old.error, null, "A 보고서를 아직 연다");
  });
});
