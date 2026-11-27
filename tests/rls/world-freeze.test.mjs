/**
 * World 5 — 연속 지키기 쿠폰 · 열매 규칙 표 (2026-10-11)
 *
 *   쿠폰   상점 물건(80 열매, 2장까지). 놓친 주(마감 지났는데 정시 제출 없음)를 그 다음 주 마감 전까지 지킨다
 *   효과   지킨 주는 그 목장에 한해 휴주처럼 건너뛴다(group_streaks · 제출 보너스)
 *   한도   학기(3~8월 / 9~2월)마다 2번. 지킬 기록(연속 1주 이상)이 없으면 못 쓴다
 *   규칙   열매 숫자는 world_rules 한 표 — 값을 바꾸면 다음 적립부터 바뀐다
 *
 * 시각이 걸린 판정은 안쪽 함수(_world_freeze, 시각을 받는다)를 서버 권한으로 부른다. 앱이 부르는 바깥 함수
 * (world_use_freeze)는 지금 시각만 쓰므로 권한·연결만 본다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let L1, L2, g1, g2, by;

// 시드보다 한참 뒤, 학기(3~8월) 첫머리의 일요일들 — 넷이 같은 학기다
const A = "2030-03-03";
const B = "2030-03-10";
const C = "2030-03-17";
const D = "2030-03-24";
const FALL = "2030-09-08";

const plusDays = (w, n) => {
  const d = new Date(`${w}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 그 주 마감(수 00:00 KST) 한 시간 뒤 — 쿠폰을 쓸 수 있는 때 */
const afterDeadline = (w) => `${plusDays(w, 3)}T01:00:00+09:00`;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  const leaders = (await db.query(
    `select u.name, p.group_id from public.users u join public.persons p on p.user_id = u.id
     where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active'
     order by p.group_id, u.name`,
  )).rows;
  const byGroup = new Map();
  for (const r of leaders) if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, r.name);
  [[g1, L1], [g2, L2]] = [...byGroup.entries()];
  assert.ok(L1 && L2 && g1 !== g2);
  by = (await db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

/** 서버 권한으로, 끝나면 되돌린다 */
async function sys(fn) {
  await ctx.db.exec("begin");
  try {
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}
const submit = (db, group, week, late = false) =>
  db.query(
    `insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late) values ($1, $2, now(), $3, $4)
     on conflict (group_id, week_key) do update set submitted_at = excluded.submitted_at, is_late = excluded.is_late`,
    [group, week, by, late],
  );
/** 쿠폰 쓰기(안쪽 함수). 실패해도 거래가 이어지게 세이브포인트로 감싼다 */
async function freeze(db, group, week, now, buy = false) {
  await db.exec("savepoint f");
  const r = await attempt(db, `select public._world_freeze($1, $2, $3, $4, $5) as r`, [group, by, week, buy, now]);
  await db.exec(r.error ? "rollback to savepoint f" : "release savepoint f");
  return r;
}
const give = (db, group, n) => db.query(`insert into public.world_ledger (group_id, delta, reason, item_id) values ($1, $2, 'purchase', 'cabin')`, [group, n]);
const coupons = async (db, group) =>
  Number((await db.query(`select coalesce((select qty from public.world_inventory where group_id = $1 and item_id = 'freeze'), 0) as q`, [group])).rows[0].q);
const balance = async (db, group) => Number((await db.query(`select coalesce(sum(delta), 0) as b from public.world_ledger where group_id = $1`, [group])).rows[0].b);

describe("상점의 쿠폰", () => {
  it("쿠폰은 ticket 물건으로 300 열매다(2026-11-16 — 그 전엔 80)", async () => {
    const r = (await ctx.db.query(`select name, cat, price from public.world_items where id = 'freeze'`)).rows[0];
    assert.deepEqual(r, { name: "연속 지키기 쿠폰", cat: "ticket", price: 300 });
  });

  it("리더가 사면 쿠폰이 늘고 열매가 준다. 2장까지만 가진다", async () => {
    // 서버 권한으로 열매를 넣고, 같은 거래 안에서 리더로 바꿔 산다
    await ctx.db.exec("begin");
    try {
      await give(ctx.db, g1, 1000);
      const before = await balance(ctx.db, g1);
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[L1], role: "authenticated" })]);
      await ctx.db.exec("set local role authenticated");
      await ctx.db.query(`select public.world_buy('freeze')`);
      const r2 = (await ctx.db.query(`select public.world_buy('freeze') as r`)).rows[0].r;
      assert.equal(r2.qty, 2);
      assert.equal(r2.berries, before - 600);
      const third = await attempt(ctx.db, `select public.world_buy('freeze')`);
      assert.match(third.error, /2장까지/);
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("쿠폰은 마을에 놓을 수 없다", async () => {
    await ctx.db.exec("begin");
    try {
      await ctx.db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 1)`, [g1]);
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[L1], role: "authenticated" })]);
      await ctx.db.exec("set local role authenticated");
      const r = await attempt(ctx.db, `select public.world_set_village('wood', array['freeze', null, null, null, null, null, null]::text[])`);
      assert.match(r.error, /놓을 수 없는/);
    } finally {
      await ctx.db.exec("rollback");
    }
  });
});

describe("쿠폰 쓰기 — 언제 되나", () => {
  // A 정시 · B 놓침 — B 를 지킬 수 있는 때는 B 마감 뒤부터 C 마감 전까지
  const setup = async (db) => {
    await submit(db, g1, A);
    await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 2)`, [g1]);
  };

  it("놓친 주를 다음 주 마감 전에 쓰면 지켜지고 쿠폰이 하나 준다", () =>
    sys(async (db) => {
      await setup(db);
      const r = await freeze(db, g1, B, afterDeadline(B));
      assert.equal(r.error, null);
      assert.equal(r.rows[0].r.coupons, 1);
      assert.equal(r.rows[0].r.used, 1);
      assert.equal((await db.query(`select count(*)::int as n from public.world_streak_freezes where group_id = $1 and week_key = $2`, [g1, B])).rows[0].n, 1);
    }));

  it("마감 전인 주는 아직 못 쓴다", () =>
    sys(async (db) => {
      await setup(db);
      const r = await freeze(db, g1, B, `${plusDays(B, 2)}T23:00:00+09:00`);
      assert.match(r.error, /마감 전/);
    }));

  it("다음 주 마감이 지나면 늦었다", () =>
    sys(async (db) => {
      await setup(db);
      const r = await freeze(db, g1, B, afterDeadline(C));
      assert.match(r.error, /다음 주 마감 전까지만/);
    }));

  it("마감 안에 낸 주 · 휴주 · 이미 지킨 주는 쓸 필요가 없다", async () => {
    await sys(async (db) => {
      await setup(db);
      await submit(db, g1, B);
      assert.match((await freeze(db, g1, B, afterDeadline(B))).error, /마감 안에 낸/);
    });
    await sys(async (db) => {
      await setup(db);
      await db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '시험')`, [B]);
      assert.match((await freeze(db, g1, B, afterDeadline(B))).error, /휴주/);
    });
    await sys(async (db) => {
      await setup(db);
      assert.equal((await freeze(db, g1, B, afterDeadline(B))).error, null);
      assert.match((await freeze(db, g1, B, afterDeadline(B))).error, /이미 쿠폰으로/);
    });
  });

  it("마감 뒤에 낸 주(지각)도 놓친 주라 지킬 수 있다", () =>
    sys(async (db) => {
      await setup(db);
      await submit(db, g1, B, true);
      assert.equal((await freeze(db, g1, B, afterDeadline(B))).error, null);
    }));

  it("지킬 연속 기록이 없으면 못 쓴다", () =>
    sys(async (db) => {
      await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 2)`, [g1]);
      assert.match((await freeze(db, g1, B, afterDeadline(B))).error, /지킬 연속 기록이 없/);
    }));

  it("쿠폰이 없으면 못 쓰고, 사서 쓰기면 같은 거래에서 300 열매로 사서 쓴다", () =>
    sys(async (db) => {
      await submit(db, g1, A);
      assert.match((await freeze(db, g1, B, afterDeadline(B))).error, /쿠폰이 없습니다/);
    }).then(() =>
      sys(async (db) => {
        await submit(db, g1, A);
        await give(db, g1, 400);
        const before = await balance(db, g1);
        const r = await freeze(db, g1, B, afterDeadline(B), true);
        assert.equal(r.error, null);
        assert.equal(await balance(db, g1), before - 300);
        assert.equal(await coupons(db, g1), 0);
      }),
    ));

  it("사서 쓰기도 열매가 모자라면 아무것도 안 바뀐다", () =>
    sys(async (db) => {
      await submit(db, g1, A);
      const have = await balance(db, g1);
      if (have >= 80) await db.query(`insert into public.world_ledger (group_id, delta, reason, item_id) values ($1, $2, 'purchase', 'cabin')`, [g1, -(have - 10)]);
      const r = await freeze(db, g1, B, afterDeadline(B), true);
      assert.match(r.error, /열매가 모자랍니다/);
    }));

  it("학기마다 2번 — 같은 학기 세 번째는 막히고, 다음 학기엔 다시 된다", () =>
    sys(async (db) => {
      await submit(db, g1, A);
      await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 2)`, [g1]);
      assert.equal((await freeze(db, g1, B, afterDeadline(B))).error, null);
      assert.equal((await freeze(db, g1, C, afterDeadline(C))).error, null);
      // 쿠폰을 하나 더 쥐여 줘도 한도에 걸린다
      await db.query(`update public.world_inventory set qty = 1 where group_id = $1 and item_id = 'freeze'`, [g1]);
      assert.match((await freeze(db, g1, D, afterDeadline(D))).error, /이번 학기에는 쿠폰을 2번까지/);
      // 9월 학기: 그 전 주에 정시 제출이 있으면 다시 쓸 수 있다
      await submit(db, g1, plusDays(FALL, -7));
      assert.equal((await freeze(db, g1, FALL, afterDeadline(FALL))).error, null);
    }));
});

describe("지킨 주의 효과", () => {
  it("group_streaks 는 지킨 주를 건너뛴다 — A 정시 · B 지킴 · C 정시면 2주 연속", async () => {
    await ctx.db.exec("begin");
    try {
      await submit(ctx.db, g1, A);
      await submit(ctx.db, g1, C);
      const streakAt = async () => {
        await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[L1], role: "authenticated" })]);
        await ctx.db.exec("set local role authenticated");
        const r = (await ctx.db.query(`select streak from public.group_streaks($1, $2) where group_id = $3`, [C, afterDeadline(C), g1])).rows[0].streak;
        await ctx.db.exec("reset role");
        return r;
      };
      assert.equal(await streakAt(), 1);
      await ctx.db.query(`insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g1, B]);
      assert.equal(await streakAt(), 2);
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("지킨 다음 주에 정시 제출하면 연속 보너스가 이어진다(+4)", () =>
    sys(async (db) => {
      await submit(db, g1, A);
      await db.query(`insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g1, B]);
      await submit(db, g1, C);
      const r = (await db.query(`select delta from public.world_ledger where group_id = $1 and week_key = $2 and reason = 'streak_bonus'`, [g1, C])).rows;
      assert.deepEqual(r.map((x) => x.delta), [4]);
    }));

  it("이번 주를 먼저 내고 놓친 주를 나중에 지켜도 연속 보너스를 채운다 ★ (2026-11-06)", () =>
    sys(async (db) => {
      await submit(db, g1, A);
      await submit(db, g1, C); // B 를 놓친 채 C 를 먼저 냈다 — 이때는 연속이 끊겨 보너스 0
      const before = (await db.query(`select count(*)::int as n from public.world_ledger where group_id = $1 and week_key = $2 and reason = 'streak_bonus'`, [g1, C])).rows[0].n;
      assert.equal(before, 0);
      await db.query(`insert into public.world_inventory (group_id, item_id, qty) values ($1, 'freeze', 1) on conflict (group_id, item_id) do update set qty = 1`, [g1]);
      const r = await freeze(db, g1, B, afterDeadline(B));
      assert.equal(r.error, null, r.error);
      const after = (await db.query(`select delta from public.world_ledger where group_id = $1 and week_key = $2 and reason = 'streak_bonus'`, [g1, C])).rows;
      assert.deepEqual(after.map((x) => x.delta), [4]);
    }));

  it("다른 목장의 streak 에는 영향이 없다", () =>
    sys(async (db) => {
      await db.query(`insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g1, B]);
      await submit(db, g2, A);
      await submit(db, g2, C);
      const n = (await db.query(`select public._world_streak($1, $2) as n`, [g2, C])).rows[0].n;
      assert.equal(n, 1);
    }));
});

describe("열매 규칙 표", () => {
  it("지금 규칙 값(2026-11-16 — 시작 300 · 정시 80, 나머지는 World 8 추천안 그대로, 휴주 선물 200 은 2026-11-26)", async () => {
    const r = Object.fromEntries((await ctx.db.query(`select key, value from public.world_rules`)).rows.map((x) => [x.key, x.value]));
    assert.deepEqual(r, { start_berries: 300, report_on_time: 80, report_late: 5, streak_step: 4, streak_max: 12, freeze_per_term: 2, freeze_hold_max: 2, pastor_read: 2, pastor_stamp: 1, admin_approve: 5, skip_gift: 200 });
  });

  it("world_state 가 규칙 숫자를 함께 준다(월드 화면 글용)", async () => {
    const s = await asUser(ctx, L1, async (db) => (await db.query(`select public.world_state() as s`)).rows[0].s);
    assert.equal(s.rules.report_on_time, 80);
    assert.equal(s.rules.streak_max, 12);
  });

  it("규칙 값을 바꾸면 다음 적립부터 그 값이다", () =>
    sys(async (db) => {
      await db.query(`update public.world_rules set value = 40 where key = 'report_on_time'`);
      await db.query(`update public.world_rules set value = 7 where key = 'streak_step'`);
      await submit(db, g1, A);
      await submit(db, g1, B);
      const r = (await db.query(`select reason, delta from public.world_ledger where group_id = $1 and week_key = $2 order by reason`, [g1, B])).rows;
      assert.deepEqual(r, [{ reason: "report_on_time", delta: 40 }, { reason: "streak_bonus", delta: 7 }]);
    }));

  it("앱 사용자는 읽기만 한다", async () => {
    const rows = await asUser(ctx, L1, async (db) => (await db.query(`select key from public.world_rules`)).rows);
    assert.ok(rows.length >= 7);
    const w = await asUser(ctx, L1, (db) => attempt(db, `update public.world_rules set value = 999 where key = 'report_on_time'`));
    assert.ok(w.error || w.affected === 0);
    const p = await asUser(ctx, "박새벽", async (db) => (await db.query(`select key from public.world_rules`)).rows);
    assert.equal(p.length, 0);
  });
});

describe("앱이 부르는 함수 · 읽기 범위", () => {
  it("world_summary — 리더는 내 목장 요약, 목사님·운영자는 null, 미승인은 막힌다", async () => {
    const s = await asUser(ctx, L1, async (db) => (await db.query(`select public.world_summary() as s`)).rows[0].s);
    assert.ok(s.berries >= 60);
    assert.equal(s.coupons, 0);
    assert.equal(s.coupon_price, 300);
    assert.equal(s.freezes_per_term, 2);
    assert.ok("freeze_week" in s && "freeze_keeps" in s);
    for (const who of ["임찬양", "정다슬"]) {
      assert.equal(await asUser(ctx, who, async (db) => (await db.query(`select public.world_summary() as s`)).rows[0].s), null);
    }
    const p = await asUser(ctx, "박새벽", (db) => attempt(db, `select public.world_summary()`));
    assert.ok(p.error);
  });

  it("world_use_freeze — 목사님은 못 쓰고, 리더는 지금 시각으로 판정된다", async () => {
    const pastor = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.world_use_freeze($1::date)`, [B]));
    assert.match(pastor.error, /목장 리더만/);
    const leader = await asUser(ctx, L1, (db) => attempt(db, `select public.world_use_freeze($1::date)`, [B]));
    assert.match(leader.error, /마감 전/); // 2030년 주는 아직 마감 전
  });

  it("안쪽 함수는 앱에서 못 부른다", async () => {
    const r = await asUser(ctx, L1, (db) => attempt(db, `select public._world_freeze($1, $2, $3, true, now())`, [g1, by, B]));
    assert.ok(r.error);
  });

  it("지킨 주는 그 목장 리더 · 목사님 · 운영자만 보고, 직접 쓰지 못한다", async () => {
    await ctx.db.query(`insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g1, B]);
    try {
      const see = async (who) => (await asUser(ctx, who, async (db) => (await db.query(`select group_id from public.world_streak_freezes`)).rows)).length;
      assert.equal(await see(L1), 1);
      assert.equal(await see(L2), 0);
      assert.equal(await see("임찬양"), 1);
      assert.equal(await see("정다슬"), 1);
      const w = await asUser(ctx, L1, (db) => attempt(db, `insert into public.world_streak_freezes (group_id, week_key) values ($1, $2)`, [g1, C]));
      assert.ok(w.error);
    } finally {
      await ctx.db.query(`delete from public.world_streak_freezes where group_id = $1`, [g1]);
    }
  });
});
