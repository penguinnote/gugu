/**
 * 목사님 주간 정리 v1 (2026-11-05)
 *
 *   prayer_streaks       그 주 기도제목을 낸 사람마다 연속 주 수(휴주는 건너뛴다). 목사님 전체 · 리더 자기 목장 · 그 밖 0행
 *   push_digest_targets  수요일 알림을 받을 목사님 계정 — 서버 전용
 *
 * 시드 기준: 최근 4주 기록, 목사님 임찬양 · 운영자 정다슬(명단 밖) · 3목장 리더 권다움
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let latestWeek;
let g3;

before(async () => {
  ctx = await createTestDb();
  latestWeek = (await ctx.db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const plusWeeks = (week, n) => {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};

/** 표에서 직접 센 연속 주 수 — 함수와 견줄 기준 */
async function expectedWeeks(personId) {
  const { rows } = await ctx.db.query(
    `select week_key::text as w from public.weekly_records where person_id = $1 and prayer_request is not null`,
    [personId],
  );
  const have = new Set(rows.map((r) => r.w));
  let n = 0;
  while (have.has(plusWeeks(latestWeek, -n))) n += 1;
  return n;
}

describe("기도제목 연속 n주", () => {
  it("목사님은 전 목장을 받고, 연속 주 수가 표에서 센 값과 같다 ★", async () => {
    const rows = await asUser(ctx, "임찬양", async (db) => (await db.query(`select * from public.prayer_streaks($1::date)`, [latestWeek])).rows);
    assert.ok(rows.length > 0, "기도제목이 하나도 없다");
    assert.ok(new Set(rows.map((r) => r.group_id)).size > 1, "여러 목장이 나와야 한다");
    for (const r of rows.slice(0, 8)) {
      assert.equal(r.weeks, await expectedWeeks(r.person_id), `연속 주 수가 다르다: ${r.person_id}`);
      assert.ok(r.prayer_request, "이번 주 기도제목이 비었다");
    }
  });

  it("리더는 자기 목장만, 운영자(명단 밖)는 0행", async () => {
    const leader = await asUser(ctx, "권다움", async (db) => (await db.query(`select group_id from public.prayer_streaks($1::date)`, [latestWeek])).rows);
    assert.ok(leader.length > 0);
    assert.ok(leader.every((r) => r.group_id === g3), "다른 목장 기도제목이 보인다");
    const admin = await asUser(ctx, "정다슬", async (db) => (await db.query(`select 1 from public.prayer_streaks($1::date)`, [latestWeek])).rows);
    assert.equal(admin.length, 0);
  });

  it("빈 주가 끼면 끊기고, 그 주가 휴주면 건너뛰어 이어진다 ★", async () => {
    const pastor = (db) => db.query(`select person_id, weeks from public.prayer_streaks($1::date)`, [latestWeek]);
    const top = (await asUser(ctx, "임찬양", pastor)).rows.find((r) => r.weeks >= 3);
    assert.ok(top, "3주 이상 이어진 사람이 시드에 있어야 한다");
    const gap = plusWeeks(latestWeek, -1);

    // asUser 가 제 트랜잭션을 열고 닫으므로 바깥에서 begin/rollback 으로 감쌀 수 없다 — 고치고, 끝나면 되돌린다
    const orig = (await ctx.db.query(
      `select prayer_request, prayer_status from public.weekly_records where person_id = $1 and week_key = $2`, [top.person_id, gap])).rows[0];
    try {
      await ctx.db.query(`update public.weekly_records set prayer_request = null, prayer_status = null where person_id = $1 and week_key = $2`, [top.person_id, gap]);
      const cut = await asUser(ctx, "임찬양", pastor);
      assert.equal(cut.rows.find((r) => r.person_id === top.person_id).weeks, 1, "빈 주에서 끊겨야 한다");

      await ctx.db.query(`insert into public.skipped_weeks (week_key) values ($1)`, [gap]);
      const bridged = await asUser(ctx, "임찬양", pastor);
      assert.equal(bridged.rows.find((r) => r.person_id === top.person_id).weeks, top.weeks - 1, "휴주는 건너뛰고 이어져야 한다");
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [gap]);
      await ctx.db.query(
        `update public.weekly_records set prayer_request = $3, prayer_status = $4 where person_id = $1 and week_key = $2`,
        [top.person_id, gap, orig.prayer_request, orig.prayer_status]);
    }
  });
});

describe("수요일 알림 받는 사람", () => {
  it("목사님 계정만 나오고, 앱 사용자는 부를 수 없다", async () => {
    const rows = await asService(ctx, async (db) => (await db.query(`select user_id from public.push_digest_targets()`)).rows);
    const pastorId = (await ctx.db.query(`select id from public.users where role = 'pastor' and status = 'active'`)).rows.map((r) => r.id);
    assert.deepEqual(rows.map((r) => r.user_id).sort(), pastorId.sort());
    const r = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.push_digest_targets()`));
    assert.match(r.error ?? "", /permission denied/);
  });
});
