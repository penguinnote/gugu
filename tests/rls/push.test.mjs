/**
 * Step 7 — 웹 푸시 구독과 받는 사람 (2026-10-03, PRD §6.4)
 *
 * 구독
 *   · push_subscriptions — 한 사람이 기기 여러 대. endpoint 가 기기 하나다
 *   · save_push_subscription(endpoint, p256dh, auth, ua) — 승인된 사용자만. 같은 endpoint 가 다른 사람
 *     것이었으면 지금 사람에게 옮긴다(한 기기에서 계정을 바꾼 경우 — 남의 알림이 오면 안 된다)
 *   · remove_push_subscription(endpoint) — 내 것만
 *   · 읽기는 내 구독만. 남의 endpoint·키는 안 보인다
 *
 * 받는 사람 (서버 전용 — service_role 만 실행)
 *   · push_reminder_targets(week) — 그 주 보고서를 아직 제출하지 않은 목장의 리더 전원(계정 있는 사람).
 *     휴주면 없다. 운영자 겸 리더도 리더다
 *   · push_group_targets(report, exclude) — 그 보고서 목장의 리더 전원, 한 명 제외(제출한 사람)
 *   · claim_push(key, users) — 같은 알림을 두 번 보내지 않는다. 처음 잡은 사람만 돌려준다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let weeks;

before(async () => {
  ctx = await createTestDb();
  weeks = (await ctx.db.query(`select distinct week_key::text as w from public.reports order by 1`)).rows.map((r) => r.w);
});

after(async () => {
  await ctx?.db?.close?.();
});

function plusDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const save = (who, endpoint) =>
  asUser(ctx, who, (db) =>
    attempt(db, `select public.save_push_subscription($1, 'p256dh-key', 'auth-key', 'test-agent')`, [endpoint]), { commit: true });

const mine = (who) =>
  // 시드의 가짜 구독(example.invalid)은 빼고 이 테스트가 만든 것만 본다
  asUser(ctx, who, async (db) => (await db.query(
    `select endpoint from public.push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/test-%' order by endpoint`)).rows.map((r) => r.endpoint));

describe("구독 저장", () => {
  it("리더가 저장하면 자기 구독으로 보인다 — 기기 여러 대 ★", async () => {
    assert.equal((await save("권다움", "https://fcm.googleapis.com/fcm/send/test-a1")).error, null);
    assert.equal((await save("권다움", "https://fcm.googleapis.com/fcm/send/test-a2")).error, null);
    assert.deepEqual(await mine("권다움"), ["https://fcm.googleapis.com/fcm/send/test-a1", "https://fcm.googleapis.com/fcm/send/test-a2"]);
  });

  it("남의 구독은 안 보인다", async () => {
    assert.deepEqual(await mine("김빛나"), []);
  });

  it("같은 기기(endpoint)에서 다른 사람이 저장하면 그 사람 것으로 옮긴다 ★", async () => {
    assert.equal((await save("김빛나", "https://fcm.googleapis.com/fcm/send/test-a1")).error, null);
    assert.deepEqual(await mine("김빛나"), ["https://fcm.googleapis.com/fcm/send/test-a1"]);
    assert.deepEqual(await mine("권다움"), ["https://fcm.googleapis.com/fcm/send/test-a2"]);
  });

  it("미승인은 저장할 수 없다", async () => {
    const r = await save("한이음", "https://fcm.googleapis.com/fcm/send/test-p1");
    assert.notEqual(r.error, null);
  });

  it("지우기는 내 것만", async () => {
    await asUser(ctx, "권다움", (db) => db.query(`select public.remove_push_subscription('https://fcm.googleapis.com/fcm/send/test-a1')`), { commit: true });
    assert.deepEqual(await mine("김빛나"), ["https://fcm.googleapis.com/fcm/send/test-a1"], "남의 구독은 그대로");
    await asUser(ctx, "권다움", (db) => db.query(`select public.remove_push_subscription('https://fcm.googleapis.com/fcm/send/test-a2')`), { commit: true });
    assert.deepEqual(await mine("권다움"), []);
  });

  it("알려진 푸시 서비스 주소만 받는다 (2026-11-06)", async () => {
    for (const bad of ["https://evil.example/hook", "http://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com.evil.example/x"]) {
      const r = await save("김빛나", bad);
      assert.match(r.error ?? "", /올바르지 않습니다/, bad);
    }
    for (const ok of ["https://web.push.apple.com/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc"]) {
      assert.equal((await save("김빛나", ok)).error, null, ok);
    }
  });

  it("한 사람 다섯 대까지 — 오래된 것부터 지운다 (2026-11-06)", async () => {
    for (let i = 0; i < 7; i++) assert.equal((await save("김빛나", `https://fcm.googleapis.com/fcm/send/cap-${i}`)).error, null);
    const n = (await ctx.db.query(
      `select count(*)::int as n from public.push_subscriptions s join public.users u on u.id = s.user_id where u.name = '김빛나'`)).rows[0].n;
    assert.equal(n, 5);
  });

  it("직접 쓰기는 막혀 있다 — 함수로만", async () => {
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                   select id, 'https://fcm.googleapis.com/fcm/send/test-x', 'k', 'a' from public.users where name = '권다움'`));
    assert.notEqual(r.error, null);
  });
});

describe("서버 전용", () => {
  it("일반 사용자는 받는 사람 함수·발송 기록을 쓸 수 없다 ★", async () => {
    for (const sql of [
      `select * from public.push_reminder_targets('${weeks[3]}')`,
      `select * from public.claim_push('x', array[]::uuid[])`,
      `select * from public.push_log`,
    ]) {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, sql));
      assert.notEqual(r.error, null, sql);
    }
  });

  it("서버(service_role)는 모든 구독을 읽는다 — 발송용", async () => {
    const rows = await asService(ctx, async (db) => (await db.query(`select endpoint from public.push_subscriptions`)).rows);
    assert.ok(rows.length >= 1);
  });
});

describe("월요일 미제출 — 받는 사람", () => {
  const targets = (week) =>
    asService(ctx, async (db) =>
      (await db.query(
        `select t.user_id, g.number from public.push_reminder_targets($1::date) t join public.groups g on g.id = t.group_id order by g.number`,
        [week])).rows);

  it("시드 마지막 주는 11목장만 미제출(초안) → 11목장 리더 전원 ★", async () => {
    const rows = await targets(weeks[3]);
    assert.ok(rows.length > 0);
    assert.deepEqual([...new Set(rows.map((r) => r.number))], [11]);
    const expected = (await ctx.db.query(
      `select count(*)::int n from public.persons p join public.groups g on g.id = p.group_id
        where g.number = 11 and p.group_role = 'leader' and p.status = 'active' and p.user_id is not null`)).rows[0].n;
    assert.equal(rows.length, expected);
  });

  it("보고서가 아직 없는 주는 전 목장 리더 — 계정 없는 리더(류지호)는 빠진다", async () => {
    const rows = await targets(plusDays(weeks[3], 7));
    const expected = (await ctx.db.query(
      `select count(*)::int n from public.persons p join public.users u on u.id = p.user_id
        where p.group_role = 'leader' and p.status = 'active' and u.role in ('leader', 'admin')`)).rows[0].n;
    assert.equal(rows.length, expected);
    assert.equal(new Set(rows.map((r) => r.number)).size, 12);
  });

  it("휴주면 아무에게도 보내지 않는다", async () => {
    const w = plusDays(weeks[3], 7);
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '추석')`, [w]);
    try {
      assert.equal((await targets(w)).length, 0);
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [w]);
    }
  });

  it("운영자 겸 리더도 받고, 휴면 리더는 받지 않는다", async () => {
    const w = plusDays(weeks[3], 7);
    const uid = (await ctx.db.query(`select id from public.users where name = '반석호'`)).rows[0].id;
    const pid = (await ctx.db.query(`select id from public.persons where name = '노해찬'`)).rows[0].id;
    const nuid = (await ctx.db.query(`select user_id from public.persons where id = $1`, [pid])).rows[0].user_id;
    await ctx.db.query(`update public.users set role = 'admin' where id = $1`, [uid]);
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [pid]);
    try {
      const ids = (await targets(w)).map((r) => r.user_id);
      assert.ok(ids.includes(uid), "운영자 겸 리더");
      assert.ok(!ids.includes(nuid), "휴면 리더");
    } finally {
      await ctx.db.query(`update public.users set role = 'leader' where id = $1`, [uid]);
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [pid]);
    }
  });
});

describe("제출·스탬프 — 같은 목장 리더", () => {
  it("보고서 목장의 리더 전원, 제출한 사람은 빼고 ★", async () => {
    const report = (await ctx.db.query(
      `select r.id from public.reports r join public.groups g on g.id = r.group_id where g.number = 3 and r.week_key = $1`, [weeks[3]])).rows[0].id;
    const me = (await ctx.db.query(`select id from public.users where name = '권다움'`)).rows[0].id;
    const rows = await asService(ctx, async (db) =>
      (await db.query(`select user_id from public.push_group_targets($1, $2)`, [report, me])).rows);
    const expected = (await ctx.db.query(
      `select p.user_id from public.persons p join public.groups g on g.id = p.group_id
        where g.number = 3 and p.group_role = 'leader' and p.status = 'active' and p.user_id is not null and p.user_id <> $1`, [me])).rows;
    assert.equal(rows.length, expected.length);
    assert.ok(!rows.some((r) => r.user_id === me));
  });

  it("제외할 사람이 없으면(목사님 스탬프) 전원", async () => {
    const report = (await ctx.db.query(
      `select r.id from public.reports r join public.groups g on g.id = r.group_id where g.number = 3 and r.week_key = $1`, [weeks[3]])).rows[0].id;
    const rows = await asService(ctx, async (db) =>
      (await db.query(`select user_id from public.push_group_targets($1, null)`, [report])).rows);
    assert.equal(rows.length, 3, "3목장 리더 4명 중 계정 있는 3명");
  });
});

describe("같은 알림은 한 번", () => {
  it("claim_push 는 처음 잡은 사람만 돌려준다 ★", async () => {
    const ids = (await ctx.db.query(`select id from public.users where role = 'leader' order by name limit 2`)).rows.map((r) => r.id);
    const first = await asService(ctx, async (db) =>
      (await db.query(`select * from public.claim_push('reminder:test', $1::uuid[])`, [ids])).rows, { commit: true });
    assert.equal(first.length, 2);
    const again = await asService(ctx, async (db) =>
      (await db.query(`select * from public.claim_push('reminder:test', $1::uuid[])`, [ids])).rows, { commit: true });
    assert.equal(again.length, 0);
  });
});
