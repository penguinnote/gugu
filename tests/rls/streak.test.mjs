/**
 * Step 6 — 연속 제출(streak) 계산 규칙 (2026-09-29)
 *
 * 단위는 목장. 마감(화요일 23:59 KST) 안에 제출한 주가 연속으로 이어진 수.
 *   · 마감 후 제출(is_late)은 반영되지 않는다 — 끊는다
 *   · 휴주(skipped_weeks)는 건너뛰고 유지한다 — 제출 대상이 아닌 주에 끊기면 안 된다
 *   · 이번 주가 아직 마감 전이고 미제출이면 '대기' — 끊지도 세지도 않는다
 *   · 저장하지 않고 함수로 계산한다: group_streaks(p_week_key, p_now)
 *       streak            연속 주 수
 *       current_included  p_week_key 주가 정시 제출로 셈에 들어갔는가
 *       ever_on_time      정시 제출이 한 번이라도 있었는가 (첫 주 문구 판단)
 *       broken            정시 제출이 있었는데 지금 streak 이 0 인가 ("이번 주부터 다시")
 *   · 순위는 없다. 함수는 목사님에게 전체, 리더에게 자기 목장만 돌려준다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3, g7;
let weeks; // 시드 4주, 오름차순

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  weeks = (await db.query(`select distinct week_key::text as w from public.reports order by 1`)).rows.map((r) => r.w);
  assert.equal(weeks.length, 4);
});

after(async () => {
  await ctx?.db?.close?.();
});

/** 날짜 문자열에 일수를 더한다 (테스트용, UTC 달력) */
function plusDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 목장의 4주를 원하는 상태로 만든다. 값: "on" 정시, "late" 지각, "none" 미제출(행 없음) */
async function shape(groupId, states) {
  const { db } = ctx;
  const author = (await db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const st = states[i];
    if (st === "none") {
      await db.query(`delete from public.weekly_records where report_id in (select id from public.reports where group_id = $1 and week_key = $2)`, [groupId, w]);
      await db.query(`delete from public.reports where group_id = $1 and week_key = $2`, [groupId, w]);
      continue;
    }
    await db.query(
      `insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late)
       values ($1, $2, ($2::date + 2)::timestamptz + interval '20 hours', $3, $4)
       on conflict (group_id, week_key) do update
         set submitted_at = excluded.submitted_at, submitted_by = excluded.submitted_by, is_late = excluded.is_late`,
      [groupId, w, author, st === "late"],
    );
  }
}

/** 기본: 마지막 주의 화요일 23:59:59 KST (아직 마감 전) 시점에서 계산 */
async function streakOf(groupId, who = "임찬양", asOf = weeks[3], now = `${plusDays(weeks[3], 2)}T23:59:59+09:00`) {
  const rows = await asUser(ctx, who, async (db) =>
    (await db.query(`select * from public.group_streaks($1::date, $2::timestamptz) where group_id = $3`, [asOf, now, groupId])).rows);
  return rows[0] ?? null;
}

describe("계산 규칙", () => {
  it("4주 정시 제출 → 4주 연속 ★", async () => {
    await shape(g3, ["on", "on", "on", "on"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 4);
    assert.equal(s.current_included, true);
    assert.equal(s.broken, false);
    assert.equal(s.ever_on_time, true);
  });

  it("중간에 지각이 있으면 그 뒤부터 센다 ★", async () => {
    await shape(g3, ["on", "late", "on", "on"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 2);
  });

  it("중간에 미제출(행 없음)이 있으면 그 뒤부터 센다", async () => {
    await shape(g3, ["on", "none", "on", "on"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 2);
  });

  it("휴주는 건너뛰고 유지한다 ★", async () => {
    await shape(g3, ["on", "none", "on", "on"]);
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '방학')`, [weeks[1]]);
    try {
      const s = await streakOf(g3);
      assert.equal(s.streak, 3, "휴주를 사이에 두고 이어져야 한다");
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [weeks[1]]);
    }
  });

  it("휴주에 제출했더라도 세지 않는다 (제출 대상이 아니다)", async () => {
    await shape(g3, ["on", "on", "on", "on"]);
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '수련회')`, [weeks[2]]);
    try {
      const s = await streakOf(g3);
      assert.equal(s.streak, 3);
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [weeks[2]]);
    }
  });

  it("이번 주가 마감 전이고 미제출이면 '대기' — 끊지도 세지도 않는다 ★", async () => {
    await shape(g3, ["on", "on", "on", "none"]);
    const s = await streakOf(g3, "임찬양", weeks[3], `${plusDays(weeks[3], 1)}T12:00:00+09:00`); // 월요일 정오
    assert.equal(s.streak, 3);
    assert.equal(s.current_included, false);
    assert.equal(s.broken, false);
  });

  it("이번 주 마감이 지났는데 미제출이면 0 이고 끊김이다", async () => {
    await shape(g3, ["on", "on", "on", "none"]);
    const s = await streakOf(g3, "임찬양", weeks[3], `${plusDays(weeks[3], 3)}T09:00:00+09:00`); // 수요일 아침
    assert.equal(s.streak, 0);
    assert.equal(s.broken, true);
    assert.equal(s.ever_on_time, true);
  });

  it("마감 경계 — 화요일 23:59:59 KST 는 아직 마감 전, 수요일 00:00:00 은 마감 후", async () => {
    await shape(g3, ["on", "on", "on", "none"]);
    const before = await streakOf(g3, "임찬양", weeks[3], `${plusDays(weeks[3], 2)}T23:59:59+09:00`);
    const after = await streakOf(g3, "임찬양", weeks[3], `${plusDays(weeks[3], 3)}T00:00:00+09:00`);
    assert.equal(before.streak, 3);
    assert.equal(after.streak, 0);
  });

  it("정시 제출이 한 번도 없으면 0 이고 첫 주다 (끊김 아님)", async () => {
    await shape(g3, ["none", "none", "none", "none"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 0);
    assert.equal(s.ever_on_time, false);
    assert.equal(s.broken, false);
  });

  it("전부 지각이면 0 이고, 정시가 없었으니 첫 주로 본다", async () => {
    await shape(g3, ["late", "late", "late", "late"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 0);
    assert.equal(s.ever_on_time, false);
  });

  it("지난주까지 이어졌고 이번 주도 정시면 current_included", async () => {
    await shape(g3, ["late", "on", "on", "on"]);
    const s = await streakOf(g3);
    assert.equal(s.streak, 3);
    assert.equal(s.current_included, true);
  });

  it("제출하는 순간 오른다 — 제출 전 N, 제출 후 N+1 ★", async () => {
    await shape(g3, ["on", "on", "on", "none"]);
    const now = `${plusDays(weeks[3], 1)}T12:00:00+09:00`; // 월요일, 마감 전
    const before = await streakOf(g3, "임찬양", weeks[3], now);
    assert.equal(before.streak, 3);
    const author = (await ctx.db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
    await ctx.db.query(
      `insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late) values ($1, $2, $3::timestamptz, $4, false)`,
      [g3, weeks[3], now, author],
    );
    const after = await streakOf(g3, "임찬양", weeks[3], now);
    assert.equal(after.streak, 4);
    assert.equal(after.current_included, true);
  });
});

describe("누가 무엇을 보는가 — 순위는 없다", () => {
  const now = () => `${plusDays(weeks[3], 2)}T23:59:59+09:00`;

  it("목사님은 12개 목장 전부 받는다 ★", async () => {
    const rows = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(`select group_id from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()])).rows);
    assert.equal(rows.length, 12);
  });

  it("리더는 자기 목장 한 줄만 받는다 — 남의 목장 streak 은 없다 ★", async () => {
    const rows = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select group_id from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()])).rows);
    assert.deepEqual(rows.map((r) => r.group_id), [g3]);
  });

  it("운영자(명단 밖)와 미승인은 0행", async () => {
    const admin = await asUser(ctx, "정다슬", async (db) =>
      (await db.query(`select group_id from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()])).rows);
    assert.equal(admin.length, 0);
    const pending = await asUser(ctx, "한이음", (db) =>
      attempt(db, `select group_id from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()]));
    if (pending.error === null) assert.equal(pending.rows.length, 0);
  });

  it("7목장 리더의 계산은 자기 목장 값이고 읽기 전용이다", async () => {
    await shape(g7, ["on", "on", "on", "on"]);
    const r = await asUser(ctx, "노해찬", (db) =>
      attempt(db, `select streak from public.group_streaks($1::date, $2::timestamptz)`, [weeks[3], now()]));
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows[0].streak, 4);
  });
});

// 2026-11-16 — 연속을 세기 시작하는 주(app_meta streak_start). 출시 전에 낸 보고서는 남기고 연속만 같은 줄에서 시작한다
describe("세기 시작하는 주", () => {
  const setStart = (w) => ctx.db.query(`insert into public.app_meta (key, value) values ('streak_start', $1) on conflict (key) do update set value = excluded.value`, [w]);
  const clearStart = () => ctx.db.query(`delete from public.app_meta where key = 'streak_start'`);

  it("그 주보다 앞의 정시 제출은 연속에 넣지 않는다 — 홈 · 순위 · 열매 보너스가 같은 기준 ★", async () => {
    await shape(g3, ["on", "on", "on", "on"]);
    await setStart(weeks[2]);
    try {
      const s = await streakOf(g3);
      assert.equal(s.streak, 2, "셋째 주부터 센다");
      assert.equal(s.current_included, true);
      assert.equal((await ctx.db.query(`select public._world_streak($1, $2::date) as n`, [g3, weeks[3]])).rows[0].n, 2);
      assert.equal((await ctx.db.query(`select public._group_streak($1, $2::date, $3::timestamptz) as n`, [g3, weeks[3], `${plusDays(weeks[3], 2)}T23:59:59+09:00`])).rows[0].n, 2);
    } finally {
      await clearStart();
    }
    assert.equal((await streakOf(g3)).streak, 4, "값을 지우면 예전처럼 처음부터");
  });

  it("앞 주에만 정시 제출이 있었으면 '끊김' 이 아니라 첫 주로 본다", async () => {
    await shape(g3, ["on", "on", "none", "none"]);
    await setStart(weeks[2]);
    try {
      const s = await streakOf(g3, "임찬양", weeks[3], `${plusDays(weeks[3], 3)}T09:00:00+09:00`);
      assert.equal(s.streak, 0);
      assert.equal(s.ever_on_time, false);
      assert.equal(s.broken, false);
    } finally {
      await clearStart();
    }
  });
});
