/**
 * AI 주간 정리 허점 고치기(2026-11-08)
 *
 *   빈 정리       제출된 보고서가 없는 주는 차지하지 않는다
 *   다시 만들기   만든 시각 · 보고서 수 · 목장 수 저장. 새로 내거나 고친 보고서가 있을 때만, 한 주 3번.
 *                 다시 만드는 동안 · 실패하면 앞의 정리를 그대로. 새 정리가 저장되면 그 주 피드백을 지운다
 *   틀린 내용     pastor_digest_feedback.wrong — 목사님 자기 것만
 *   소급 빼기     ai_excluded · 기록 제외가 켜지면 그 사람이 들어간 주의 정리를 지운다
 *   운영 카드     digest_health — 운영자만, 내용 없이
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx, LEADER, WEEK, WEEK2, reportId;
const PASTOR = "임찬양";
const ADMIN = "정다슬";
const EMPTY_WEEK = "2024-01-07"; // 오래전 일요일 — 보고서가 없다
const LONE_WEEK = "2024-01-14"; // 정리만 직접 넣어 두는 주(기록 없음)

before(async () => {
  ctx = await createTestDb();
  LEADER = (await ctx.db.query(
    `select u.name from public.users u join public.persons p on p.user_id = u.id
      where u.role = 'leader' and u.status = 'active' and p.group_role = 'leader' and p.status = 'active' limit 1`,
  )).rows[0].name;
  const weeks = (await ctx.db.query(
    `select distinct r.week_key::text as w from public.reports r
      where r.submitted_at is not null and ((r.week_key + 3)::timestamp at time zone 'Asia/Seoul') <= now()
      order by w desc limit 2`,
  )).rows.map((x) => x.w);
  [WEEK, WEEK2] = weeks;
  reportId = (await ctx.db.query(`select id from public.reports where week_key = $1 and submitted_at is not null limit 1`, [WEEK])).rows[0].id;
});
after(async () => { await ctx?.db?.close?.(); });

const claim = (who, week) => asUser(ctx, who, (db) => attempt(db, `select public.digest_claim($1) as ok`, [week]), { commit: true });
const regen = (who, week) => asUser(ctx, who, (db) => attempt(db, `select public.digest_regen($1) as ok`, [week]), { commit: true });
const save = (who, week, ok, content, counts = [null, null]) =>
  asUser(ctx, who, (db) => attempt(db,
    `select public.digest_save($1, $2, $3::jsonb, 'claude-sonnet-5-5', 100, 20, 1500, $4, $5, $6)`,
    [week, ok, content ? JSON.stringify(content) : null, ok ? null : "refusal", counts[0], counts[1]]), { commit: true });
const row = async (week) => (await ctx.db.query(
  `select status, content, fail_reason, generated_at, report_count, group_count, regen_count from public.pastor_digests where week_key = $1`, [week])).rows[0];
/** 리더가 보고서를 고친 것처럼 — 트리거가 updated_at 을 지금으로 */
const touchReport = () => ctx.db.query(`update public.reports set note = coalesce(note, '') || ' ' where id = $1`, [reportId]);
const DIGEST = (tag) => ({ v: 1, highlights: [{ text: tag, src: [] }], thanks: [], groups: [], intercession: [], sent: { records: 1, notes: 0 }, dropped: 2 });

describe("빈 정리", () => {
  it("제출된 보고서가 없는 주는 차지하지 않고 줄도 남기지 않는다", async () => {
    const r = await claim(PASTOR, EMPTY_WEEK);
    assert.equal(r.error, null);
    assert.equal(r.rows[0].ok, false);
    assert.equal(await row(EMPTY_WEEK), undefined);
  });
});

describe("요청할 때 만들기 (2026-11-08)", () => {
  it("마감 전인 이번 주도 제출된 보고서가 있으면 차지한다", async () => {
    const week = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
    const leaderUser = (await ctx.db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
    // 이번 주 보고서 하나를 제출된 것으로(시드 상태와 상관없이)
    await ctx.db.query(
      `update public.reports set submitted_at = now(), submitted_by = $2
        where id = (select id from public.reports where week_key = $1 order by id limit 1)`, [week, leaderUser]);
    const r = await claim(PASTOR, week);
    assert.equal(r.error, null);
    assert.equal(r.rows[0].ok, true);
    await ctx.db.query(`delete from public.pastor_digests where week_key = $1`, [week]);
  });
});

describe("다시 만들기", () => {
  it("저장하면 만든 시각 · 보고서 수 · 목장 수가 남는다", async () => {
    assert.equal((await claim(PASTOR, WEEK)).rows[0].ok, true);
    assert.equal((await save(PASTOR, WEEK, true, DIGEST("첫 정리"), [9, 12])).error, null);
    const r = await row(WEEK);
    assert.equal(r.status, "ready");
    assert.ok(r.generated_at);
    assert.deepEqual([r.report_count, r.group_count, r.regen_count], [9, 12, 0]);
  });

  it("새로 내거나 고친 보고서가 없으면 다시 만들 수 없다", async () => {
    assert.match((await regen(PASTOR, WEEK)).error ?? "", /새로 들어온/);
  });

  it("운영자 · 리더는 다시 만들지 못한다", async () => {
    await touchReport();
    for (const who of [ADMIN, LEADER]) assert.ok((await regen(who, WEEK)).error, who);
  });

  it("고친 보고서가 있으면 차지한다 — 앞의 정리는 그대로 남고 횟수가 하나 는다", async () => {
    await asUser(ctx, PASTOR, (db) => db.query(
      `insert into public.pastor_digest_feedback (week_key, item_key, helpful) values ($1, 'h:0', true)`, [WEEK]), { commit: true });
    const r = await regen(PASTOR, WEEK);
    assert.equal(r.error, null);
    assert.equal(r.rows[0].ok, true);
    const d = await row(WEEK);
    assert.equal(d.status, "pending");
    assert.equal(d.content.highlights[0].text, "첫 정리");
    assert.equal(d.regen_count, 1);
    // 만드는 중에 또 누르면 false
    assert.equal((await regen(PASTOR, WEEK)).rows[0].ok, false);
  });

  it("다시 만들다 실패하면 앞의 정리를 다시 보여 주고 까닭만 남긴다 — 피드백도 그대로", async () => {
    assert.equal((await save(PASTOR, WEEK, false, null)).error, null);
    const d = await row(WEEK);
    assert.equal(d.status, "ready");
    assert.equal(d.content.highlights[0].text, "첫 정리");
    assert.equal(d.fail_reason, "refusal");
    assert.deepEqual([d.report_count, d.group_count], [9, 12]);
    const fb = (await ctx.db.query(`select count(*)::int as n from public.pastor_digest_feedback where week_key = $1`, [WEEK])).rows[0].n;
    assert.equal(fb, 1);
  });

  it("다시 만들어 저장하면 새 정리 · 새 시각, 그 주 피드백은 지운다", async () => {
    const before = (await row(WEEK)).generated_at;
    assert.equal((await regen(PASTOR, WEEK)).rows[0].ok, true);
    assert.equal((await save(PASTOR, WEEK, true, DIGEST("새 정리"), [11, 12])).error, null);
    const d = await row(WEEK);
    assert.equal(d.content.highlights[0].text, "새 정리");
    assert.equal(d.fail_reason, null);
    assert.ok(new Date(d.generated_at) > new Date(before));
    assert.deepEqual([d.report_count, d.regen_count], [11, 2]);
    const fb = (await ctx.db.query(`select count(*)::int as n from public.pastor_digest_feedback where week_key = $1`, [WEEK])).rows[0].n;
    assert.equal(fb, 0);
  });

  it("한 주에 세 번까지", async () => {
    await touchReport();
    assert.equal((await regen(PASTOR, WEEK)).rows[0].ok, true);
    assert.equal((await save(PASTOR, WEEK, true, DIGEST("셋째"), [12, 12])).error, null);
    assert.equal((await row(WEEK)).regen_count, 3);
    await touchReport();
    assert.match((await regen(PASTOR, WEEK)).error ?? "", /세 번/);
  });

  it("처음 만들기 실패는 지금처럼 failed · 내용 없음", async () => {
    assert.equal((await claim(PASTOR, WEEK2)).rows[0].ok, true);
    assert.equal((await save(PASTOR, WEEK2, false, null)).error, null);
    const d = await row(WEEK2);
    assert.deepEqual([d.status, d.content, d.fail_reason], ["failed", null, "refusal"]);
  });
});

describe("틀린 내용", () => {
  const put = (who, wrong) => asUser(ctx, who, (db) => attempt(db,
    `insert into public.pastor_digest_feedback (week_key, item_key, wrong) values ($1, 'h:1', $2)
     on conflict (week_key, item_key, user_id) do update set wrong = excluded.wrong, updated_at = now()`, [WEEK, wrong]), { commit: true });

  it("목사님은 도움 됨 없이 틀린 내용만 남기고 끈다", async () => {
    assert.equal((await put(PASTOR, true)).error, null);
    let r = (await ctx.db.query(`select helpful, wrong from public.pastor_digest_feedback where week_key = $1 and item_key = 'h:1'`, [WEEK])).rows;
    assert.deepEqual(r, [{ helpful: null, wrong: true }]);
    assert.equal((await put(PASTOR, false)).error, null);
    r = (await ctx.db.query(`select wrong from public.pastor_digest_feedback where week_key = $1 and item_key = 'h:1'`, [WEEK])).rows;
    assert.deepEqual(r, [{ wrong: false }]);
  });

  it("운영자 · 리더는 넣지도 읽지도 못한다", async () => {
    for (const who of [ADMIN, LEADER]) {
      assert.ok((await put(who, true)).error, who);
      const n = await asUser(ctx, who, async (db) => (await db.query(`select count(*)::int as n from public.pastor_digest_feedback`)).rows[0].n);
      assert.equal(n, 0, who);
    }
  });
});

describe("AI 에서 빼기 소급", () => {
  /** WEEK 에 글이 있는 기록의 주인(제출된 보고서) */
  const writerOf = async (week) => (await ctx.db.query(
    `select wr.person_id as id from public.weekly_records wr join public.reports r on r.id = wr.report_id
      where wr.week_key = $1 and r.submitted_at is not null and nullif(btrim(coalesce(wr.prayer_request, '')), '') is not null
      order by wr.person_id limit 1`, [week])).rows[0].id;
  const putDigest = (week, content) => ctx.db.query(
    `insert into public.pastor_digests (week_key, status, content, generated_at) values ($1, 'ready', $2::jsonb, now())
     on conflict (week_key) do update set status = 'ready', content = excluded.content`, [week, JSON.stringify(content)]);
  const exists = async (week) => !!(await row(week));

  it("그 사람 글이 보내진 주의 정리를 통째로 지운다 — 다른 주는 그대로", async () => {
    const who = await writerOf(WEEK);
    await putDigest(LONE_WEEK, DIGEST("상관없는 주"));
    assert.ok(await exists(WEEK));
    const r = await asUser(ctx, PASTOR, (db) => attempt(db, `update public.persons set ai_consented_at = null where id = $1`, [who]), { commit: true });
    assert.equal(r.error, null);
    assert.equal(await exists(WEEK), false);
    assert.equal(await exists(LONE_WEEK), true);
  });

  it("정리에 그 사람이 나오면(자리표시) 기록이 없던 주라도 지운다 — 운영자가 켜도", async () => {
    const other = (await ctx.db.query(`select id from public.persons where status = 'active' and not ai_excluded order by id desc limit 1`)).rows[0].id;
    await putDigest(LONE_WEEK, { ...DIGEST("x"), highlights: [{ text: `{{p:${other}}} 소식`, src: [] }] });
    const r = await asUser(ctx, ADMIN, (db) => attempt(db, `update public.persons set ai_consented_at = null where id = $1`, [other]), { commit: true });
    assert.equal(r.error, null);
    assert.equal(await exists(LONE_WEEK), false);
  });

  it("기록 제외(opted_out)가 되어도 같다", async () => {
    const other = (await ctx.db.query(`select id from public.persons where status = 'active' and not ai_excluded and group_role = 'member' order by id limit 1`)).rows[0].id;
    await putDigest(LONE_WEEK, { ...DIGEST("x"), thanks: [{ text: `{{p:${other}}} 감사`, src: [] }] });
    const r = await asUser(ctx, ADMIN, (db) => attempt(db, `select public.set_person_recording($1, false)`, [other]), { commit: true });
    assert.equal(r.error, null);
    assert.equal(await exists(LONE_WEEK), false);
  });

  it("끄는 것은 아무것도 지우지 않는다", async () => {
    await putDigest(LONE_WEEK, DIGEST("남는다"));
    const who = (await ctx.db.query(`select id from public.persons where ai_excluded limit 1`)).rows[0].id;
    await asUser(ctx, PASTOR, (db) => db.query(`update public.persons set ai_consented_at = now() where id = $1`, [who]), { commit: true });
    assert.equal(await exists(LONE_WEEK), true);
  });
});

describe("운영 카드", () => {
  const health = (who) => asUser(ctx, who, (db) => attempt(db, `select * from public.digest_health()`));

  it("운영자는 이번 주부터 4주를 받는다 — 내용 칸은 없다", async () => {
    const recent = (await ctx.db.query(
      `select (public.kst_current_week() - 7 * i)::date::text as w from generate_series(0, 3) i order by w desc`,
    )).rows.map((x) => x.w);
    await ctx.db.query(
      `insert into public.pastor_digests (week_key, status, fail_reason) values ($1, 'failed', 'too_many_dropped')
       on conflict (week_key) do update set status = 'failed', content = null, fail_reason = 'too_many_dropped'`, [recent[0]]);
    const r = await health(ADMIN);
    assert.equal(r.error, null);
    assert.deepEqual(r.rows.map((x) => String(x.week_key instanceof Date ? x.week_key.toISOString().slice(0, 10) : x.week_key)), recent);
    assert.deepEqual(Object.keys(r.rows[0]).sort(), ["dropped", "fail_reason", "generated_at", "group_count", "regen_count", "report_count", "skipped", "status", "week_key"]);
    assert.equal(r.rows[0].status, "failed");
    assert.equal(r.rows[0].fail_reason, "too_many_dropped");
  });

  it("성공한 주는 버린 수 · 보고서 수가 온다", async () => {
    const week = (await health(ADMIN)).rows[1].week_key;
    await ctx.db.query(
      `insert into public.pastor_digests (week_key, status, content, generated_at, report_count, group_count)
       values ($1, 'ready', $2::jsonb, now(), 10, 12)
       on conflict (week_key) do update set status = 'ready', content = excluded.content, report_count = 10, group_count = 12`,
      [week, JSON.stringify({ ...DIGEST("x"), dropped: 3 })]);
    const r = (await health(ADMIN)).rows[1];
    assert.deepEqual([r.status, r.dropped, r.report_count, r.group_count], ["ready", 3, 10, 12]);
  });

  it("목사님 · 리더는 0행", async () => {
    for (const who of [PASTOR, LEADER]) {
      const r = await health(who);
      assert.equal(r.error, null);
      assert.equal(r.rows.length, 0, who);
    }
  });
});
