/**
 * 이번 주 제출 수(2026-11-13) — week_submission_count. 운영자 홈 카드가 쓴다. 숫자 두 개만, 앱 사용자 누구나.
 *
 * 시드 기준: 운영자 정다슬 · 목사님 임찬양 · 3목장 리더 권다움
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let week;
let expected;

before(async () => {
  ctx = await createTestDb();
  week = (await ctx.db.query(`select week_key::text as w from public.reports where submitted_at is not null order by week_key desc limit 1`)).rows[0].w;
  expected = (
    await ctx.db.query(
      `select (select count(*) from public.groups where status = 'active')::int as total,
              (select count(*) from public.reports r join public.groups g on g.id = r.group_id and g.status = 'active'
                where r.week_key = $1 and r.submitted_at is not null)::int as submitted`,
      [week],
    )
  ).rows[0];
});
after(async () => {
  await ctx?.db?.close?.();
});

const count = (who) => asUser(ctx, who, (db) => attempt(db, `select * from public.week_submission_count($1)`, [week]));

describe("이번 주 제출 수", () => {
  it("운영자도 숫자를 받는다 — 보고서는 못 읽어도 ★", async () => {
    const r = await count("정다슬");
    assert.equal(r.error, null);
    assert.deepEqual(r.rows[0], expected);
    assert.ok(expected.submitted > 0);
    const own = await asUser(ctx, "정다슬", (db) => attempt(db, `select count(*)::int as n from public.reports where week_key = $1`, [week]));
    assert.equal(own.rows[0].n, 0, "운영자는 reports 를 직접 읽지 못한다");
  });

  it("목사님 · 리더도 같은 숫자", async () => {
    for (const who of ["임찬양", "권다움"]) assert.deepEqual((await count(who)).rows[0], expected, who);
  });

  it("로그인 안 했으면 부를 수 없다", async () => {
    const r = await asAnon(ctx, (db) => attempt(db, `select * from public.week_submission_count($1)`, [week]));
    assert.ok(r.error);
  });
});
