/**
 * 목사님 주간 정리 v2 — AI 정리 저장(2026-11-07)
 *
 *   읽기     pastor_digests 는 목사님만(운영자 · 리더 0행)
 *   만들기   digest_claim — 목사님만, 이번 주까지(마감 전에도 — 2026-11-08), 처음 한 번 true · 두 번째 false. digest_save 는 차지한 줄만
 *   피드백   자기 것만 넣고 읽는다
 *   빼기     persons.ai_consented_at(옵트인, 2026-11-13) → ai_excluded — 리더는 못 바꾸고 목사님 · 운영자는 바꾼다
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx, LEADER, memberId, WEEK, WEEK2;
const PASTOR = "임찬양";
const ADMIN = "정다슬";
const FUTURE = "2099-01-04";

before(async () => {
  ctx = await createTestDb();
  const r = (await ctx.db.query(
    `select u.name, p.group_id from public.users u join public.persons p on p.user_id = u.id
      where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active' limit 1`,
  )).rows[0];
  LEADER = r.name;
  memberId = (await ctx.db.query(`select id from public.persons where group_id = $1 and group_role = 'member' and status = 'active' limit 1`, [r.group_id])).rows[0].id;
  // 마감이 지났고 제출된 보고서가 있는 주 둘(시드는 최근 4주) — 제출된 보고서가 없는 주는 차지하지 않는다(2026-11-08)
  const weeks = (await ctx.db.query(
    `select distinct r.week_key::text as w from public.reports r
      where r.submitted_at is not null and ((r.week_key + 3)::timestamp at time zone 'Asia/Seoul') <= now()
      order by w desc limit 2`,
  )).rows.map((x) => x.w);
  [WEEK, WEEK2] = weeks;
});
after(async () => { await ctx?.db?.close?.(); });

const claim = (who, week) => asUser(ctx, who, (db) => attempt(db, `select public.digest_claim($1) as ok`, [week]), { commit: true });
const save = (who, week, ok, content) =>
  asUser(ctx, who, (db) => attempt(db, `select public.digest_save($1, $2, $3::jsonb, 'claude-sonnet-5-5', 100, 20, 1500, $4)`, [week, ok, content ? JSON.stringify(content) : null, ok ? null : "refusal"]), { commit: true });

describe("만들기", () => {
  it("목사님만 차지한다 — 운영자 · 리더는 막힌다", async () => {
    for (const who of [ADMIN, LEADER]) assert.ok((await claim(who, WEEK)).error, who);
  });

  it("이번 주보다 뒤 · 주 시작일이 아닌 날은 막힌다", async () => {
    assert.match((await claim(PASTOR, FUTURE)).error ?? "", /이번 주까지/);
    assert.match((await claim(PASTOR, "2026-10-05")).error ?? "", /일요일/);
  });

  it("처음 한 번 true, 그다음은 false", async () => {
    const a = await claim(PASTOR, WEEK);
    assert.equal(a.error, null);
    assert.equal(a.rows[0].ok, true);
    assert.equal((await claim(PASTOR, WEEK)).rows[0].ok, false);
  });

  it("저장하면 ready, 다시 저장은 막힌다", async () => {
    assert.equal((await save(PASTOR, WEEK, true, { v: 1, highlights: [] })).error, null);
    assert.ok((await save(PASTOR, WEEK, true, { v: 1 })).error);
    const row = (await ctx.db.query(`select status, model, fail_reason from public.pastor_digests where week_key = $1`, [WEEK])).rows[0];
    assert.deepEqual(row, { status: "ready", model: "claude-sonnet-5-5", fail_reason: null });
  });

  it("실패는 10분 뒤 다시 차지할 수 있다", async () => {
    const w = WEEK2;
    await claim(PASTOR, w);
    assert.equal((await save(PASTOR, w, false, null)).error, null);
    assert.equal((await claim(PASTOR, w)).rows[0].ok, false);
    await ctx.db.query(`update public.pastor_digests set updated_at = now() - interval '11 minutes' where week_key = $1`, [w]);
    assert.equal((await claim(PASTOR, w)).rows[0].ok, true);
  });

  it("앱에서 직접 쓰지 못한다", async () => {
    const r = await asUser(ctx, PASTOR, (db) => attempt(db, `insert into public.pastor_digests (week_key, status) values ('2026-09-20', 'pending')`));
    assert.ok(r.error);
  });
});

describe("읽기", () => {
  it("목사님만 읽는다 — 운영자 · 리더는 0행", async () => {
    const n = (who) => asUser(ctx, who, async (db) => (await db.query(`select count(*)::int as n from public.pastor_digests`)).rows[0].n);
    assert.ok((await n(PASTOR)) >= 1);
    assert.equal(await n(ADMIN), 0);
    assert.equal(await n(LEADER), 0);
  });
});

describe("피드백", () => {
  it("목사님은 자기 것을 넣고 바꾼다, 운영자는 못 넣는다", async () => {
    const put = (who, helpful) => asUser(ctx, who, (db) => attempt(db,
      `insert into public.pastor_digest_feedback (week_key, item_key, helpful) values ($1, 'h:0', $2)
       on conflict (week_key, item_key, user_id) do update set helpful = excluded.helpful, updated_at = now()`, [WEEK, helpful]), { commit: true });
    assert.equal((await put(PASTOR, true)).error, null);
    assert.equal((await put(PASTOR, false)).error, null);
    assert.ok((await put(ADMIN, true)).error);
    const rows = (await ctx.db.query(`select helpful from public.pastor_digest_feedback where week_key = $1`, [WEEK])).rows;
    assert.deepEqual(rows, [{ helpful: false }]);
  });
});

describe("AI 에서 빼기", () => {
  const set = (who, on) => asUser(ctx, who, (db) => attempt(db, `update public.persons set ai_consented_at = case when $2::boolean then null else now() end where id = $1`, [memberId, on]));
  it("리더는 못 바꾼다", async () => {
    assert.match((await set(LEADER, true)).error ?? "", /AI 동의/);
  });
  it("목사님 · 운영자는 바꾼다", async () => {
    assert.equal((await set(PASTOR, true)).error, null);
    assert.equal((await set(ADMIN, true)).error, null);
  });
});
