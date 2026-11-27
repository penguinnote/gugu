/**
 * L-4a / P-4a 사람 상세 — 화면이 쓰는 읽기 경로의 범위 (2026-10-03, 02 §4)
 *
 * "같은 화면이지만 보이는 범위가 다르다. 리더는 자기 목장 소속인 기간의 기록만, 목사님은 전체."
 * 새 함수 없이 기존 경로로 성립한다 — 이 테스트는 그 계약을 고정한다.
 *   · 사람 행        persons — 리더는 **지금** 자기 목장 사람만(없으면 화면은 404)
 *   · 기록           weekly_records_visible — 리더는 자기 목장에서 쓰인 기록(group_id_at_write)만
 *   · 목장을 옮기면  새 목장 리더는 사람은 보지만 옛 목장에서 쓰인 기록은 못 본다
 *   · 운영자         사람 행은 보지만(명단 관리) 기록은 0 — 화면은 404 (requireReportAccess)
 *   · 운영자 겸 리더 다른 목장 사람 행도 보인다 — 화면이 group_id 로 다시 걸러 404
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, createTestDb } from "./harness.mjs";

let ctx;
let g3, g7, sid;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  sid = (await db.query(`select id from public.persons where name = '서다온'`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

async function view(who, personId = sid) {
  return asUser(ctx, who, async (db) => ({
    person: (await db.query(`select id, name from public.persons where id = $1`, [personId])).rows[0] ?? null,
    records: (await db.query(
      `select week_key, prayer_request from public.weekly_records_visible where person_id = $1 order by week_key desc`, [personId])).rows,
  }));
}

describe("사람 상세의 읽기 범위", () => {
  it("목사님은 사람과 전체 기록 4주", async () => {
    const v = await view("임찬양");
    assert.ok(v.person);
    assert.equal(v.records.length, 4);
  });

  it("자기 목장 리더는 사람과 그 목장에서 쓰인 기록 ★", async () => {
    const v = await view("권다움");
    assert.ok(v.person);
    assert.equal(v.records.length, 4);
  });

  it("다른 목장 리더는 사람도 기록도 없다 ★", async () => {
    const v = await view("노해찬");
    assert.equal(v.person, null);
    assert.equal(v.records.length, 0);
  });

  it("운영자는 사람 행은 보지만 기록은 0", async () => {
    const v = await view("정다슬");
    assert.ok(v.person);
    assert.equal(v.records.length, 0);
  });
});

describe("운영자 겸 리더", () => {
  it("다른 목장 사람 행이 보인다(명단 관리) — 그래서 화면이 소속 목장을 다시 거른다. 기록은 0 ★", async () => {
    const uid = (await ctx.db.query(`select id from public.users where name = '노해찬'`)).rows[0].id;
    await ctx.db.query(`update public.users set role = 'admin' where id = $1`, [uid]);
    try {
      const v = await view("노해찬");
      assert.ok(v.person, "persons RLS 는 운영자에게 전체를 연다 — 화면의 group_id 확인이 필요한 이유");
      assert.equal(v.records.length, 0, "기록은 여전히 자기 목장에서 쓰인 것만");
    } finally {
      await ctx.db.query(`update public.users set role = 'leader' where id = $1`, [uid]);
    }
  });
});

describe("목장을 옮긴 사람", () => {
  it("새 목장 리더는 사람은 보지만 옛 목장에서 쓰인 기록은 못 본다 ★", async () => {
    await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [sid, g7]);
    try {
      const v7 = await view("노해찬");
      assert.ok(v7.person);
      assert.equal(v7.records.length, 0);

      const v3 = await view("권다움");
      assert.equal(v3.person, null, "옛 목장 리더에게는 사람 행이 없다 — 화면은 404");

      const pastor = await view("임찬양");
      assert.equal(pastor.records.length, 4, "목사님은 그대로 전체");
    } finally {
      await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [sid, g3]);
    }
  });
});
