/**
 * 목사님 — 한마디(스탬프) 없는 지난 보고서 모아 보기(2026-11-26), 몇 주 전 보고서에도 한마디 · 메모가 된다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
before(async () => {
  ctx = await createTestDb();
});
after(async () => {
  await ctx?.db?.close?.();
});

const list = (who, limit = 100, offset = 0) =>
  asUser(ctx, who, async (db) => (await db.query(`select * from public.unstamped_reports($1, $2)`, [limit, offset])).rows);

describe("한마디 안 남긴 보고서", () => {
  it("제출됐고 스탬프가 없는 보고서가 최근 주부터 나오고, 한마디를 남기면 빠진다 ★", async () => {
    const rows = await list("임찬양");
    assert.ok(rows.length > 0, "시드에 제출된 보고서가 있어야 한다");
    const weeks = rows.map((r) => r.week_key.toISOString?.() ?? String(r.week_key));
    assert.deepEqual([...weeks].sort().reverse(), weeks, "최근 주부터");
    const oldest = rows[rows.length - 1];
    const st = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.set_report_stamp($1, 'pray')`, [oldest.report_id]), { commit: true });
    assert.equal(st.error, null, st.error ?? "");
    const after1 = await list("임찬양");
    assert.equal(after1.length, rows.length - 1);
    assert.ok(!after1.some((r) => r.report_id === oldest.report_id));
    assert.equal(Number(after1[0].total), rows.length - 1);
  });

  it("나눠 부른다 — limit · offset, total 은 전체 수", async () => {
    const all = await list("임찬양");
    const page = await list("임찬양", 2, 1);
    assert.equal(page.length, Math.min(2, all.length - 1));
    assert.equal(page[0].report_id, all[1].report_id);
    assert.equal(Number(page[0].total), all.length);
  });

  it("목사님만 — 리더 · 운영자에게는 빈 결과", async () => {
    assert.equal((await list("권다움")).length, 0);
    assert.equal((await list("정다슬")).length, 0);
  });

  it("몇 주 전 보고서에도 한마디와 메모가 된다(기한 없음) ★", async () => {
    // 가장 오래된 제출 보고서(시드의 첫 주 — 몇 주 전)
    const r = (await ctx.db.query(`select r.id from public.reports r left join public.report_reviews rr on rr.report_id = r.id
       where r.submitted_at is not null and rr.stamp is null order by r.week_key limit 1`)).rows[0];
    const stamp = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.set_report_stamp($1, 'pray')`, [r.id]), { commit: true });
    assert.equal(stamp.error, null, stamp.error ?? "");
    const note = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.set_report_note($1, '수고 많았어요')`, [r.id]), { commit: true });
    assert.equal(note.error, null, note.error ?? "");
    const rv = (await ctx.db.query(`select stamp, note from public.report_reviews where report_id = $1`, [r.id])).rows[0];
    assert.equal(rv.note, "수고 많았어요");
    assert.ok(rv.stamp);
  });
});
