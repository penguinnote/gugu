/**
 * 보고서 명단 편집(2026-11-14) — persons.report_hidden · report_order
 *   · 리더는 자기 목장 사람만 숨기고 순서를 정한다(다른 목장은 0행)
 *   · 숨긴 사람은 처음 제출의 출석 빈칸 검사에서 빠진다. 상태는 그대로. 돌봄 사각지대에서는 빠지지 않는다(2026-11-15)
 *
 * 시드 기준: 3목장 리더 권다움 · 7목장
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;
let g7;
let thisWeek;
let member;
let other;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
  thisWeek = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
  member = (await ctx.db.query(`select id, name from public.persons where group_id = $1 and group_role = 'member' and status = 'active' order by name limit 1`, [g3])).rows[0];
  other = (await ctx.db.query(`select id from public.persons where group_id = $1 and status = 'active' limit 1`, [g7])).rows[0].id;
});
after(async () => {
  await ctx?.db?.close?.();
});

const row = async (id) => (await ctx.db.query(`select report_hidden, report_order, status from public.persons where id = $1`, [id])).rows[0];
const run = (who, sql, params = []) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });

describe("보고서 명단 편집", () => {
  it("리더는 자기 목장 사람을 숨기고 순서를 정한다 — 상태는 그대로 ★", async () => {
    const r = await run("권다움", `update public.persons set report_hidden = true, report_order = 3 where id = $1 returning id`, [member.id]);
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows.length, 1);
    const after = await row(member.id);
    assert.equal(after.report_hidden, true);
    assert.equal(after.report_order, 3);
    assert.equal(after.status, "active");
    await run("권다움", `update public.persons set report_hidden = false, report_order = null where id = $1`, [member.id]);
  });

  it("다른 목장 사람은 못 바꾼다(0행) ★", async () => {
    const r = await run("권다움", `update public.persons set report_hidden = true where id = $1 returning id`, [other]);
    assert.equal(r.rows?.length ?? 0, 0);
    assert.equal((await row(other)).report_hidden, false);
  });

  it("숨긴 사람은 처음 제출의 출석 빈칸에 나오지 않는다 ★", async () => {
    const opened = await run("권다움", `select public.open_report($1, $2::date) as id`, [g3, thisWeek]);
    assert.equal(opened.error, null, opened.error ?? "");
    const rid = opened.rows[0].id;
    // 아직 안 낸 보고서 + 기록이 없는 새 사람(지어낸 이름) — 시드의 이번 주는 이미 다 적혀 있을 수 있다
    const was = (await ctx.db.query(`select submitted_at, submitted_by, is_late from public.reports where id = $1`, [rid])).rows[0];
    await ctx.db.query(`update public.reports set submitted_at = null, submitted_by = null, is_late = false where id = $1`, [rid]);
    const fresh = (await ctx.db.query(
      `insert into public.persons (group_id, name, group_role, status, joined_at) values ($1, '숨김시험', 'member', 'active', date '2025-01-05') returning id`, [g3])).rows[0].id;
    // 빈칸이 있으면 submit_report 는 23514 로 거절하고 detail(JSON)에 이름을 싣는다
    const missing = async () =>
      asUser(ctx, "권다움", async (db) => {
        try {
          await db.query(`select public.submit_report($1, '[]'::jsonb)`, [rid]);
          return [];
        } catch (e) {
          assert.equal(e.code, "23514", e.message);
          return JSON.parse(e.detail).missing_attendance ?? [];
        }
      });
    try {
      assert.ok((await missing()).includes("숨김시험"), "숨기기 전에는 빈칸 명단에 있다");
      await run("권다움", `update public.persons set report_hidden = true where id = $1`, [fresh]);
      assert.ok(!(await missing()).includes("숨김시험"), "숨기면 빠진다");
    } finally {
      await ctx.db.query(`delete from public.persons where id = $1`, [fresh]);
      // 이번 주가 시드의 마지막 주와 겹칠 수 있다 — 아래 사각지대 시험이 '낸 주' 로 보도록 되돌린다
      await ctx.db.query(`update public.reports set submitted_at = $2, submitted_by = $3, is_late = $4 where id = $1`, [rid, was.submitted_at, was.submitted_by, was.is_late]);
    }
  });

  // 2026-11-15 — 숨기기는 보고서 화면에서만. 돌봄 사각지대에서는 빠지지 않는다(사용자: "숨겼더니 사각지대에서 빠졌다")
  const seedWeeks = async () =>
    (await ctx.db.query(`select distinct week_key::text as w from public.reports where submitted_at is not null order by 1`)).rows.map((r) => r.w);
  const judge = async (personId) => {
    const weeks = await seedWeeks();
    const last = weeks[weeks.length - 1];
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 3);
    const now = `${d.toISOString().slice(0, 10)}T09:00:00+09:00`; // 마지막 시드 주의 마감이 지난 수요일 아침
    const rows = (await run("권다움", `select * from public.care_blind_spots($1::date, $2::timestamptz)`, [last, now])).rows;
    return rows.find((r) => r.person_id === personId) ?? null;
  };

  it("숨겨도 돌봄 사각지대 판정 대상에 남는다 ★", async () => {
    assert.ok(await judge(member.id), "숨기기 전에 대상이다");
    await run("권다움", `update public.persons set report_hidden = true where id = $1`, [member.id]);
    try {
      assert.ok(await judge(member.id), "숨긴 뒤에도 대상이다");
    } finally {
      await run("권다움", `update public.persons set report_hidden = false where id = $1`, [member.id]);
    }
  });

  it("숨긴 동안 기록이 없는 최근 두 주는 결석으로 센다 — 숨기지 않은 사람은 그렇게 세지 않는다 ★", async () => {
    // 오래전에 들어왔지만 기록이 하나도 없는 사람(지어낸 이름) — 숨긴 동안의 모습과 같다
    const fresh = (
      await ctx.db.query(
        `insert into public.persons (group_id, name, group_role, status, joined_at) values ($1, '기록없음시험', 'member', 'active', date '2025-01-05') returning id`,
        [g3],
      )
    ).rows[0].id;
    try {
      const plain = await judge(fresh);
      assert.equal(plain.state, "judged");
      assert.equal(plain.absent_streak, false, "기록만 없으면(숨기지 않음) 결석으로 세지 않는다");
      await run("권다움", `update public.persons set report_hidden = true where id = $1`, [fresh]);
      const hidden = await judge(fresh);
      assert.equal(hidden.absent_streak, true, "숨긴 사람은 기록 없는 두 주가 결석이다");
      assert.equal(hidden.meeting_gap, true, "목장 참석 기록이 없으니 4주 목장 불참도 잡힌다");
    } finally {
      await ctx.db.query(`delete from public.persons where id = $1`, [fresh]);
    }
  });
});
