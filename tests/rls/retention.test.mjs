/**
 * Step 9c — 2년 보관 자동 정리 (07 §0 공지의 약속, 04 §7)
 *
 *   purge_expired_records()  만료 주차(retention_cutoff() 이전)의 주간기록·보고서를 지운다. 보고서에 딸린
 *                            확인·현재 열람·코멘트는 cascade, 이벤트·내보내기 로그의 보고서 참조는 null.
 *                            지운 수와 시각을 app_meta 에 남긴다 — 운영 홈이 "마지막 정리" 로 보여준다.
 *   실행 권한               pg_cron(postgres)과 서버 키만. 앱 사용자는 운영자도 실행하지 못한다 —
 *                            지우는 버튼이 화면에 생기면 안 된다.
 *   경계                    cutoff 주차 자체는 남고, 그 전 주부터 지운다(records_past_retention 과 같은 기준).
 *   pg_cron                 PGlite 에는 없다 — 마이그레이션이 확장 유무를 보고 건너뛴다(여기서 통과하는 것 자체가 확인).
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let cutoff, before1, g3, leaderUser, pastorUser, person3;

const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  cutoff = (await db.query(`select public.retention_cutoff()::text as c`)).rows[0].c;
  before1 = addDays(cutoff, -7);
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  leaderUser = (await db.query(`select id from public.users where name = '권다움'`)).rows[0].id;
  pastorUser = (await db.query(`select id from public.users where name = '임찬양'`)).rows[0].id;
  person3 = (await db.query(`select id from public.persons where name = '서다온'`)).rows[0].id;

  // 만료 직전(cutoff 주) 하나와 만료(그 전 주) 하나를 넣는다. 각각 보고서 + 주간기록 + 확인 + 이벤트
  await asService(
    ctx,
    async (db) => {
      for (const w of [cutoff, before1]) {
        const r = (await db.query(
          `insert into public.reports (group_id, week_key, submitted_at, submitted_by) values ($1, $2, $2::date + 1, $3) returning id`,
          [g3, w, leaderUser],
        )).rows[0].id;
        await db.query(
          `insert into public.weekly_records (report_id, person_id, author_id, week_key, group_id_at_write, worship_attended)
           values ($1, $2, $3, $4, $5, true)`,
          [r, person3, leaderUser, w, g3],
        );
        await db.query(
          `insert into public.report_reviews (report_id, reviewer_id, first_read_at, last_read_at, read_count) values ($1, $2, now(), now(), 1)`,
          [r, pastorUser],
        );
        await db.query(`insert into public.events (user_id, type, group_id, report_id) values ($1, 'report_submitted', $2, $3)`, [leaderUser, g3, r]);
      }
    },
    { commit: true },
  );
});

after(async () => {
  await ctx?.db?.close?.();
});

const counts = (db) =>
  db.query(
    `select (select count(*)::int from public.reports) as reports,
            (select count(*)::int from public.weekly_records) as records,
            (select count(*)::int from public.reports where week_key < public.retention_cutoff()) as old_reports,
            (select count(*)::int from public.weekly_records where week_key < public.retention_cutoff()) as old_records,
            (select count(*)::int from public.reports where week_key = public.retention_cutoff()) as edge_reports`,
  ).then((r) => r.rows[0]);

describe("retention_cutoff()", () => {
  it("records_past_retention 의 cutoff_week 와 같다", async () => {
    const r = await asUser(ctx, "정다슬", async (db) => (await db.query(`select cutoff_week::text as c from public.records_past_retention()`)).rows[0].c);
    assert.equal(r, cutoff);
  });
  it("일요일이고, 오늘(KST)로부터 대략 24개월 전이다", async () => {
    assert.equal(new Date(`${cutoff}T00:00:00Z`).getUTCDay(), 0);
    const days = (Date.now() - Date.parse(`${cutoff}T00:00:00Z`)) / 86_400_000;
    assert.ok(days > 720 && days < 740, `${days}일`);
  });
});

describe("purge_expired_records() 실행 권한", () => {
  for (const who of ["정다슬", "임찬양", "권다움"]) {
    it(`${who === "정다슬" ? "운영자" : who === "임찬양" ? "목사님" : "리더"}는 실행하지 못한다 (42501) ★`, async () => {
      const r = await asUser(ctx, who, (db) => attempt(db, `select * from public.purge_expired_records()`));
      assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
    });
  }
});

describe("purge_expired_records() 동작", () => {
  it("만료 주차만 지우고 cutoff 주차·최근 기록은 남긴다 ★", async () => {
    const pre = await asService(ctx, counts);
    assert.equal(pre.old_reports, 1);
    assert.equal(pre.old_records, 1);
    assert.equal(pre.edge_reports, 1);

    const res = await asService(ctx, async (db) => (await db.query(`select * from public.purge_expired_records()`)).rows[0], { commit: true });
    assert.equal(Number(res.deleted_records), 1);
    assert.equal(Number(res.deleted_reports), 1);

    const post = await asService(ctx, counts);
    assert.equal(post.old_reports, 0);
    assert.equal(post.old_records, 0);
    assert.equal(post.edge_reports, 1, "cutoff 주차는 남는다");
    assert.equal(post.reports, pre.reports - 1);
    assert.equal(post.records, pre.records - 1);
  });

  it("딸린 확인은 같이 지워지고, 이벤트는 남되 보고서 참조만 비워진다", async () => {
    const r = await asService(ctx, async (db) => ({
      orphanReviews: (await db.query(`select count(*)::int n from public.report_reviews rr where not exists (select 1 from public.reports r where r.id = rr.report_id)`)).rows[0].n,
      nullEvents: (await db.query(`select count(*)::int n from public.events where report_id is null and type = 'report_submitted'`)).rows[0].n,
    }));
    assert.equal(r.orphanReviews, 0);
    assert.ok(r.nullEvents >= 1);
  });

  it("마지막 정리 시각과 지운 수가 app_meta 에 남고, 운영 홈의 만료 수는 0 이 된다", async () => {
    const meta = await asService(ctx, async (db) =>
      Object.fromEntries((await db.query(`select key, value from public.app_meta where key like 'retention_last_%'`)).rows.map((m) => [m.key, m.value])),
    );
    assert.ok(meta.retention_last_run, "retention_last_run");
    assert.equal(meta.retention_last_deleted, "records=1 reports=1");
    const left = await asUser(ctx, "정다슬", async (db) => (await db.query(`select expired_records from public.records_past_retention()`)).rows[0].expired_records);
    assert.equal(Number(left), 0);
  });

  it("다시 돌려도 안전하다 — 0건을 지우고 시각만 갱신", async () => {
    const res = await asService(ctx, async (db) => (await db.query(`select * from public.purge_expired_records()`)).rows[0], { commit: true });
    assert.equal(Number(res.deleted_records), 0);
    assert.equal(Number(res.deleted_reports), 0);
  });
});
