/**
 * 휴주 새 규칙(2026-11-26) — 늦게 정해도 휴주, 휴주 선물(열매 200, 목장 · 주마다 한 번), 미리 정한 휴주는 그 주가 시작돼야,
 * 휴주에 낸 목장은 원래 열매를 따로, 늦게 정하면 쿠폰을 돌려주고 못 받은 연속 보너스를 채운다, 휴주를 지워도 선물은 남는다.
 * 시드: 2026-11-01 · 08 · 15 · 22 네 주, 주마다 11곳 제출(한 곳 지각). 운영자 정다슬 · 3 다솜 리더 권다움
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let thisWeek;
let activeGroups;
before(async () => {
  ctx = await createTestDb();
  thisWeek = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
  activeGroups = (await ctx.db.query(`select count(*)::int as n from public.groups where status = 'active'`)).rows[0].n;
});
after(async () => {
  await ctx?.db?.close?.();
});

const addWeeks = (w, n) => {
  const d = new Date(`${w}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};
const skip = (wk, who = "정다슬") => asUser(ctx, who, (db) => attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '행사')`, [wk]), { commit: true });
const unskip = (wk) => asUser(ctx, "정다슬", (db) => attempt(db, `delete from public.skipped_weeks where week_key = $1`, [wk]), { commit: true });
const gifts = async (wk) => (await ctx.db.query(`select group_id, delta from public.world_ledger where reason = 'skip_gift' and week_key = $1`, [wk])).rows;
const gid = async (name) => (await ctx.db.query(`select id from public.groups where name = $1`, [name])).rows[0].id;

describe("휴주 선물", () => {
  it("마감 지난 주를 휴주로 정하면 바로 — 활동 중인 목장마다 200, 목장 · 주마다 한 번 ★", async () => {
    const wk = addWeeks(thisWeek, -1);
    assert.equal((await skip(wk)).error, null);
    const g = await gifts(wk);
    assert.equal(g.length, activeGroups);
    assert.ok(g.every((r) => r.delta === 200));
    await ctx.db.query(`select public._world_skip_gifts()`); // cron 이 다시 돌아도
    assert.equal((await gifts(wk)).length, activeGroups, "두 번 들어갔다");
  });

  it("휴주에 낸 목장은 원래 열매(report_on_time)를 따로 받는다 ★", async () => {
    const wk = addWeeks(thisWeek, -1);
    const rows = (await ctx.db.query(
      `select r.group_id, (select count(*)::int from public.world_ledger l where l.group_id = r.group_id and l.week_key = r.week_key and l.reason in ('report_on_time', 'report_late')) as report,
              (select count(*)::int from public.world_ledger l where l.group_id = r.group_id and l.week_key = r.week_key and l.reason = 'skip_gift') as gift
         from public.reports r where r.week_key = $1 and r.submitted_at is not null`, [wk])).rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.report === 1 && r.gift === 1));
  });

  it("미리 정한 휴주는 그 주가 시작되기 전에는 선물이 없고, 시작되면 들어간다 ★", async () => {
    const next = addWeeks(thisWeek, 2);
    assert.equal((await skip(next)).error, null);
    await ctx.db.query(`select public._world_skip_gifts()`);
    assert.equal((await gifts(next)).length, 0, "시작 전에 선물이 들어갔다");
    // 시간이 흘러 그 주가 됐다고 치고(주차를 이번 주로 옮긴다 — 세션 없는 쓰기) cron 을 부른다
    const today = addWeeks(thisWeek, 0);
    await ctx.db.query(`delete from public.world_ledger where reason = 'skip_gift' and week_key = $1`, [today]);
    await ctx.db.query(`update public.skipped_weeks set week_key = $2 where week_key = $1`, [next, today]);
    const n = (await ctx.db.query(`select public._world_skip_gifts() as n`)).rows[0].n;
    assert.equal(n, activeGroups);
    assert.equal((await gifts(today)).length, activeGroups);
  });

  it("휴주를 지워도 이미 준 선물은 남는다", async () => {
    const wk = addWeeks(thisWeek, -1);
    assert.equal((await unskip(wk)).error, null);
    assert.equal((await gifts(wk)).length, activeGroups);
  });

  it("리더는 휴주를 정하지 못한다", async () => {
    assert.equal((await skip(addWeeks(thisWeek, 4), "권다움")).code, "42501");
  });
});

describe("늦게 정한 휴주의 뒷정리", () => {
  it("그 주에 쓴 연속 지키기 쿠폰을 돌려준다 — 가진 수 +1, 학기 사용 횟수 -1 ★", async () => {
    const g = await gid("다솜");
    const wk = addWeeks(thisWeek, -3);
    await ctx.db.query(`insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g, wk]);
    await ctx.db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 0) on conflict (group_id, item_id) do update set qty = 0`, [g]);
    const usedBefore = (await ctx.db.query(`select public._world_term_used($1, $2) as n`, [g, wk])).rows[0].n;
    assert.equal((await skip(wk)).error, null);
    assert.equal((await ctx.db.query(`select qty from public.world_inventory where group_id = $1 and item_id = 'freeze'`, [g])).rows[0].qty, 1);
    assert.equal((await ctx.db.query(`select count(*)::int as n from public.world_streak_freezes where group_id = $1 and week_key = $2`, [g, wk])).rows[0].n, 0);
    assert.equal((await ctx.db.query(`select public._world_term_used($1, $2) as n`, [g, wk])).rows[0].n, usedBefore - 1);
    await unskip(wk);
  });

  it("끊겼던 연속이 이어지며 그 뒤 제때 낸 주의 못 받은 연속 보너스만 채운다 ★", async () => {
    const g = await gid("라온");
    const missed = addWeeks(thisWeek, -2);
    const after1 = addWeeks(thisWeek, -1);
    // 라온이 missed 주를 늦게 냈다고(연속이 끊김) 하고, 그 뒤 주의 보너스를 지워 '그때 0 이었던' 상태로 만든다
    await ctx.db.query(`update public.reports set is_late = true where group_id = $1 and week_key = $2`, [g, missed]);
    await ctx.db.query(`delete from public.world_ledger where group_id = $1 and reason = 'streak_bonus' and week_key >= $2`, [g, missed]);
    const before = (await ctx.db.query(`select public._world_streak($1, $2) as n`, [g, after1])).rows[0].n;
    assert.equal(before, 1);
    const onTime = (await ctx.db.query(`select (submitted_at is not null and not is_late) as ok from public.reports where group_id = $1 and week_key = $2`, [g, after1])).rows[0].ok;
    assert.ok(onTime, "그 뒤 주는 제때 냈어야 한다");
    assert.equal((await skip(missed)).error, null);
    const bonus = (await ctx.db.query(`select delta from public.world_ledger where group_id = $1 and reason = 'streak_bonus' and week_key = $2`, [g, after1])).rows;
    assert.equal(bonus.length, 1, "못 받은 보너스가 채워지지 않았다");
    assert.ok(bonus[0].delta > 0);
  });
});

describe("선물 팝업을 본 기록", () => {
  it("본인 것만 쓰고 읽는다", async () => {
    const me = (await ctx.db.query(`select user_id from public.persons where name = '권다움'`)).rows[0].user_id;
    const other = (await ctx.db.query(`select user_id from public.persons where name = '김빛나'`)).rows[0].user_id;
    const mine = await asUser(ctx, "권다움", (db) => attempt(db, `insert into public.skip_gift_seen (user_id, week_key) values ($1, $2)`, [me, thisWeek]), { commit: true });
    assert.equal(mine.error, null, mine.error ?? "");
    const theirs = await asUser(ctx, "권다움", (db) => attempt(db, `insert into public.skip_gift_seen (user_id, week_key) values ($1, $2)`, [other, thisWeek]));
    assert.equal(theirs.code, "42501");
    const seen = await asUser(ctx, "김빛나", async (db) => (await db.query(`select * from public.skip_gift_seen`)).rows.length);
    assert.equal(seen, 0);
  });
});
