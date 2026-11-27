/**
 * '기록' 탭 — group_board(p_week_key, p_now) (2026-11-10)
 *
 * 모든 앱 사용자가 활동 중인 목장마다 연속 정시 제출 주 수 · 열매 잔액을 본다(사용자 결정 — 목장 간 공개).
 *   · 연속 셈은 group_streaks 와 같다(목사님이 보는 group_streaks 값과 목장마다 같아야 한다)
 *   · 열매는 world_ledger 합계
 *   · 리더 · 목사님 · 운영자 모두 12목장 전부, 미승인 · 익명은 막힌다
 *   · 숫자 두 개 말고는 돌려주지 않는다(보고서 본문 · 기도제목 · 출석 없음)
 *   · 내부 셈 _group_streak 은 직접 부를 수 없다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let weeks;
let g3;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  weeks = (await db.query(`select distinct week_key::text as w from public.reports order by 1`)).rows.map((r) => r.w);
});

after(async () => {
  await ctx?.db?.close?.();
});

function plusDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const now = () => `${plusDays(weeks[3], 2)}T23:59:59+09:00`;
const BOARD = `select * from public.group_board($1::date, $2::timestamptz)`;

describe("기록 탭 — 모든 목장의 연속 · 열매", () => {
  it("리더도 12목장 전부를 번호 순으로 받는다 ★", async () => {
    const rows = await asUser(ctx, "권다움", async (db) => (await db.query(BOARD, [weeks[3], now()])).rows);
    assert.equal(rows.length, 12);
    assert.deepEqual(rows.map((r) => r.number), [...rows.map((r) => r.number)].sort((a, b) => a - b));
    assert.deepEqual(Object.keys(rows[0]).sort(), ["berries", "group_id", "name", "number", "streak"]);
  });

  it("연속은 목사님의 group_streaks 와 목장마다 같다 ★", async () => {
    const board = await asUser(ctx, "권다움", async (db) => (await db.query(BOARD, [weeks[3], now()])).rows);
    const streaks = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(`select group_id, streak from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()])).rows);
    const want = new Map(streaks.map((r) => [r.group_id, r.streak]));
    for (const r of board) assert.equal(r.streak, want.get(r.group_id), `목장 ${r.number}`);
  });

  it("열매는 그 목장 장부의 합계다", async () => {
    const { db } = ctx;
    const sum = Number((await db.query(`select coalesce(sum(delta), 0) as s from public.world_ledger where group_id = $1`, [g3])).rows[0].s);
    const rows = await asUser(ctx, "정다슬", async (d) => (await d.query(BOARD, [weeks[3], now()])).rows);
    assert.equal(rows.find((r) => r.group_id === g3).berries, sum);
  });

  it("운영자 · 목사님도 받고, 미승인 · 익명은 막힌다", async () => {
    const admin = await asUser(ctx, "정다슬", async (db) => (await db.query(BOARD, [weeks[3], now()])).rows);
    assert.equal(admin.length, 12);
    const pastor = await asUser(ctx, "임찬양", async (db) => (await db.query(BOARD, [weeks[3], now()])).rows);
    assert.equal(pastor.length, 12);
    const pending = await asUser(ctx, "한이음", (db) => attempt(db, BOARD, [weeks[3], now()]));
    assert.equal(pending.code, "42501");
    const anon = await asAnon(ctx, (db) => attempt(db, BOARD, [weeks[3], now()]));
    assert.notEqual(anon.error, null);
  });

  it("내부 셈(_group_streak)은 직접 부를 수 없다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public._group_streak($1, $2::date, now())`, [g3, weeks[3]]));
    assert.notEqual(r.error, null);
  });
});
