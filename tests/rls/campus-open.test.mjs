/**
 * 캠퍼스 모임 명단 모두 공개(2026-11-26) — 리더도 attendance_people(이름 · 목장 · 캠퍼스)를 받는다.
 * 그래도 다른 목장 사람의 기도제목 · 빠진 사유 · 기록은 여전히 못 본다.
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

describe("캠퍼스 모임 — 리더", () => {
  it("리더가 캠퍼스 모임 명단(attendance_people)을 연다 — 모든 목장 사람 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select id, name, group_id, campus from public.attendance_people()`));
    assert.equal(r.error, null, r.error ?? "");
    const groups = new Set(r.rows.map((x) => x.group_id));
    assert.ok(groups.size > 1, "다른 목장 사람도 나온다");
  });

  it("다른 목장 사람의 기도제목 · 빠진 사유 · 기록은 여전히 못 본다 ★", async () => {
    const mine = (await ctx.db.query(`select p.group_id from public.persons p where p.name = '권다움'`)).rows[0].group_id;
    const others = (await ctx.db.query(`select count(*)::int n from public.weekly_records where group_id_at_write <> $1`, [mine])).rows[0].n;
    assert.ok(others > 0, "시드에 다른 목장 기록이 있어야 의미가 있다");
    const seen = await asUser(ctx, "권다움", async (db) => ({
      raw: (await db.query(`select count(*)::int n from public.weekly_records where group_id_at_write <> $1`, [mine])).rows[0].n,
      visible: (await db.query(`select count(*)::int n from public.weekly_records_visible where group_id_at_write <> $1 and (prayer_request is not null or absent_reason is not null or meeting_absent_reason is not null)`, [mine])).rows[0].n,
    }));
    assert.equal(seen.raw, 0);
    assert.equal(seen.visible, 0);
  });
});
