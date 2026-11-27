/**
 * 구구 챗봇 질문 횟수(2026-11-12) — 리더 한 달 20번 · 추가 신청
 *
 * 시드 기준: 운영자 정다슬 · 목사님 임찬양 · 3목장 리더 권다움 · 김빛나
 */

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});
after(async () => {
  await ctx?.db?.close?.();
});
beforeEach(async () => {
  await ctx.db.exec(`delete from public.chat_quota_holds; delete from public.chat_quota_requests; delete from public.chat_quota_months;`);
});

const uid = async (name) =>
  (await ctx.db.query(`select u.id from public.users u left join public.persons p on p.user_id = u.id where u.name = $1 or p.name = $1 limit 1`, [name])).rows[0].id;
const run = (who, sql, params = []) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });
const reserve = async (who) => (await run(who, `select * from public.chat_quota_reserve()`)).rows?.[0];
const ask = async (who) => {
  const r = await reserve(who);
  if (!r?.hold_id) return r;
  await run(who, `select * from public.chat_quota_commit($1)`, [r.hold_id]);
  return r;
};
const status = async (who) => (await run(who, `select * from public.chat_quota_status()`)).rows?.[0];
const useUp = async (who, n = 20) => {
  for (let i = 0; i < n; i++) await ask(who);
};

describe("세기", () => {
  it("20번째까지 되고 21번째는 막힌다 ★", async () => {
    await useUp("권다움", 19);
    const twentieth = await reserve("권다움");
    assert.ok(twentieth.hold_id, "20번째는 예약된다");
    await run("권다움", `select * from public.chat_quota_commit($1)`, [twentieth.hold_id]);
    const s = await status("권다움");
    assert.equal(s.used, 20);
    assert.equal(s.quota, 20);
    const over = await reserve("권다움");
    assert.equal(over.hold_id, null, "21번째는 예약되지 않는다");
  });

  it("답을 못 받은 질문(취소)은 세지 않는다 ★", async () => {
    const r = await reserve("권다움");
    await run("권다움", `select public.chat_quota_release($1)`, [r.hold_id]);
    assert.equal((await status("권다움")).used, 0);
  });

  it("동시에 보내도 한도를 넘지 않는다 — 확정 전 예약도 자리를 차지한다 ★", async () => {
    await useUp("권다움", 18);
    const a = await reserve("권다움");
    const b = await reserve("권다움");
    const c = await reserve("권다움");
    assert.ok(a.hold_id && b.hold_id, "남은 두 자리는 예약된다");
    assert.equal(c.hold_id, null, "세 번째 동시 요청은 막힌다");
    for (const h of [a, b]) await run("권다움", `select * from public.chat_quota_commit($1)`, [h.hold_id]);
    assert.equal((await status("권다움")).used, 20);
  });

  it("3분 지난 예약은 자리를 차지하지 않고, 늦게 확정해도 세지 않는다", async () => {
    await useUp("권다움", 19);
    const r = await reserve("권다움");
    await ctx.db.query(`update public.chat_quota_holds set created_at = now() - interval '4 minutes' where id = $1`, [r.hold_id]);
    const again = await reserve("권다움");
    assert.ok(again.hold_id, "무효가 된 예약 자리는 다시 쓸 수 있다");
    await run("권다움", `select * from public.chat_quota_commit($1)`, [r.hold_id]);
    assert.equal((await status("권다움")).used, 19, "늦은 확정은 세지 않는다");
  });

  it("남의 예약은 확정할 수 없다", async () => {
    const r = await reserve("권다움");
    await run("김빛나", `select * from public.chat_quota_commit($1)`, [r.hold_id]);
    assert.equal((await status("권다움")).used, 0);
    assert.equal((await status("김빛나")).used, 0);
  });

  it("목사님은 세지 않는다 — 행도 만들지 않는다 ★", async () => {
    const r = await reserve("임찬양");
    assert.equal(r.unlimited, true);
    assert.equal(r.hold_id, null);
    assert.equal((await status("임찬양")).unlimited, true);
    const rows = (await ctx.db.query(`select count(*)::int n from public.chat_quota_months where user_id = $1`, [await uid("임찬양")])).rows[0].n;
    assert.equal(rows, 0);
  });

  it("리더가 아닌 계정(운영자만)은 쓸 수 없다", async () => {
    const r = await run("정다슬", `select * from public.chat_quota_reserve()`);
    assert.match(r.error ?? "", /쓸 수 없는/);
  });

  it("달이 바뀌면 새로 — 지난달(한국 시간) 기록은 이번 달에 넘어오지 않는다 ★", async () => {
    const me = await uid("권다움");
    await ctx.db.query(
      `insert into public.chat_quota_months (user_id, month, used, bonus)
       values ($1, (public.chat_month_of(now()) - interval '1 month')::date, 25, 5)`, [me]);
    const s = await status("권다움");
    assert.equal(s.used, 0);
    assert.equal(s.quota, 20);
  });

  it("달 경계는 한국 시간 1일 0시", async () => {
    const q = async (at) => (await ctx.db.query(`select public.chat_month_of($1::timestamptz)::text m`, [at])).rows[0].m;
    assert.equal(await q("2026-11-30T14:59:59Z"), "2026-11-01", "한국 11월 30일 23:59:59");
    assert.equal(await q("2026-11-30T15:00:00Z"), "2026-12-01", "한국 12월 1일 0시");
  });
});

describe("추가 신청", () => {
  it("다 쓰기 전에는 신청할 수 없다", async () => {
    await useUp("권다움", 19);
    const r = await run("권다움", `select * from public.request_chat_quota(null)`);
    assert.match(r.error ?? "", /남아 있습니다/);
  });

  it("그달 첫 신청은 바로 +5 ★", async () => {
    await useUp("권다움");
    const r = await run("권다움", `select * from public.request_chat_quota(null)`);
    assert.equal(r.rows[0].status, "auto");
    const s = await status("권다움");
    assert.equal(s.quota, 25);
    assert.equal(s.can_auto, false);
    assert.ok((await reserve("권다움")).hold_id, "바로 이어서 물을 수 있다");
  });

  it("두 번째 신청은 대기, 승인하면 한도가 늘고 거절하면 그대로 ★", async () => {
    await useUp("권다움");
    await run("권다움", `select * from public.request_chat_quota(null)`);
    await useUp("권다움", 5);
    const second = await run("권다움", `select * from public.request_chat_quota($1)`, ["행사 준비로 질문이 많았어요"]);
    assert.equal(second.rows[0].status, "pending");
    assert.equal((await status("권다움")).has_pending, true);
    const dup = await run("권다움", `select * from public.request_chat_quota(null)`);
    assert.match(dup.error ?? "", /이미 신청/);

    const list = (await run("정다슬", `select * from public.list_chat_quota_requests()`)).rows;
    assert.equal(list.length, 1);
    assert.equal(list[0].used, 25);
    assert.equal(list[0].quota, 25);
    assert.equal(list[0].reason, "행사 준비로 질문이 많았어요");
    assert.equal((await run("정다슬", `select public.chat_quota_pending_count() n`)).rows[0].n, 1);

    const decided = await run("정다슬", `select public.decide_chat_quota_request($1, 10) u`, [second.rows[0].request_id]);
    assert.equal(decided.rows[0].u, await uid("권다움"), "신청자를 돌려준다(웹 푸시)");
    assert.equal((await status("권다움")).quota, 35);

    // 다시 다 쓰고 신청 → 거절하면 그대로
    await useUp("권다움", 10);
    const third = await run("권다움", `select * from public.request_chat_quota(null)`);
    await run("정다슬", `select public.decide_chat_quota_request($1, null)`, [third.rows[0].request_id]);
    const s = await status("권다움");
    assert.equal(s.quota, 35);
    assert.equal(s.last_status, "rejected");
  });

  it("운영자만 처리하고, 추가 수는 5 · 10 · 20 중 하나", async () => {
    await useUp("권다움");
    await run("권다움", `select * from public.request_chat_quota(null)`);
    await useUp("권다움", 5);
    const req = (await run("권다움", `select * from public.request_chat_quota(null)`)).rows[0].request_id;
    for (const who of ["권다움", "김빛나", "임찬양"]) {
      const r = await run(who, `select public.decide_chat_quota_request($1, 5)`, [req]);
      assert.match(r.error ?? "", /운영자만/, who);
    }
    const bad = await run("정다슬", `select public.decide_chat_quota_request($1, 7)`, [req]);
    assert.match(bad.error ?? "", /5 · 10 · 20/);
    assert.match((await run("권다움", `select * from public.list_chat_quota_requests()`)).error ?? "", /운영자만/);
  });

  it("운영자 겸 리더는 자기 신청을 처리할 수 없다 ★", async () => {
    const admin = await uid("정다슬");
    const leader = await uid("권다움");
    const person = (await ctx.db.query(`select id from public.persons where user_id = $1`, [leader])).rows[0].id;
    // 운영자를 그 리더 자리에 잠시 잇는다
    await ctx.db.query(`update public.persons set user_id = null where id = $1`, [person]);
    await ctx.db.query(`update public.persons set user_id = $1 where id = $2`, [admin, person]);
    try {
      await useUp("정다슬");
      await run("정다슬", `select * from public.request_chat_quota(null)`);
      await useUp("정다슬", 5);
      const req = (await run("정다슬", `select * from public.request_chat_quota(null)`)).rows[0].request_id;
      const r = await run("정다슬", `select public.decide_chat_quota_request($1, 20)`, [req]);
      assert.match(r.error ?? "", /본인 신청/);
      const row = (await run("정다슬", `select * from public.list_chat_quota_requests()`)).rows.find((x) => x.id === req);
      assert.equal(row.mine, true);
    } finally {
      await ctx.db.query(`update public.persons set user_id = null where id = $1`, [person]);
      await ctx.db.query(`update public.persons set user_id = $1 where id = $2`, [leader, person]);
    }
  });

  it("사유는 100자까지, 지난달 사유는 신청 · 처리 때 지운다", async () => {
    await useUp("권다움");
    await run("권다움", `select * from public.request_chat_quota(null)`);
    await useUp("권다움", 5);
    const long = await run("권다움", `select * from public.request_chat_quota($1)`, ["가".repeat(101)]);
    assert.match(long.error ?? "", /100자/);

    const other = await uid("김빛나");
    await ctx.db.query(
      `insert into public.chat_quota_requests (user_id, month, status, reason)
       values ($1, (public.chat_month_of(now()) - interval '1 month')::date, 'rejected', '지난달 사유')`, [other]);
    await run("권다움", `select * from public.request_chat_quota(null)`);
    const left = (await ctx.db.query(`select reason from public.chat_quota_requests where user_id = $1`, [other])).rows[0].reason;
    assert.equal(left, null);
  });

  it("지난달 대기 신청은 목록에 없고 처리할 수 없다", async () => {
    const me = await uid("권다움");
    const id = (await ctx.db.query(
      `insert into public.chat_quota_requests (user_id, month, status)
       values ($1, (public.chat_month_of(now()) - interval '1 month')::date, 'pending') returning id`, [me])).rows[0].id;
    assert.equal((await run("정다슬", `select * from public.list_chat_quota_requests()`)).rows.length, 0);
    const r = await run("정다슬", `select public.decide_chat_quota_request($1, 5)`, [id]);
    assert.match(r.error ?? "", /지난달/);
  });
});

describe("읽기 권한", () => {
  it("리더는 자기 것만 읽고, 직접 쓸 수 없다 ★", async () => {
    await useUp("권다움", 3);
    await useUp("김빛나", 2);
    const mine = (await run("권다움", `select user_id, used from public.chat_quota_months`)).rows;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].used, 3);
    const w = await run("권다움", `update public.chat_quota_months set used = 0`);
    assert.ok(w.error || w.affected === 0, "직접 고칠 수 없다");
    const holds = await run("권다움", `select * from public.chat_quota_holds`);
    assert.ok(holds.error || holds.rows.length === 0, "예약은 아무도 직접 못 읽는다");
  });
});
