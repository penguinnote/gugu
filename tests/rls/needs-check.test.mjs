/**
 * needs_check_people() — 리더도 보는 '확인 필요' (2026-10-14)
 * roster_people()      — 리더 · 목사님도 보는 전체 명단(운영자 명단과 같은 꼴, 보기만)
 *
 *   명단 도입 때 확인 필요로 표시된 활동 중인 사람을 전체 목장에서 — 이름 · 목장 · 리더/양만.
 *   persons 는 RLS 로 리더에게 자기 목장만 보이지만, 이 목록은 전체 목장이 보인다(사용자 결정).
 *   앱 사용자(리더 · 목사님 · 운영자)만. 미승인은 42501. 보기만 — 표시를 지우는 길은 그대로 운영자.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let other; // 7목장 양 — 3목장 리더에게는 persons 로 보이지 않는 사람

before(async () => {
  ctx = await createTestDb();
  other = (await ctx.db.query(`select id from public.persons where name = '오시온'`)).rows[0].id;
  await ctx.db.query(`update public.persons set needs_check = true where id = $1`, [other]);
});

after(async () => {
  await ctx?.db?.close?.();
});

const list = (who) => asUser(ctx, who, (db) => attempt(db, `select * from public.needs_check_people()`));

describe("needs_check_people()", () => {
  it("리더는 다른 목장의 확인 필요도 본다 — 이름 · 목장 · 리더/양만 ★", async () => {
    const r = await list("권다움");
    assert.equal(r.error, null, r.error ?? "");
    const row = r.rows.find((x) => x.person_id === other);
    assert.ok(row, "다른 목장 사람이 목록에 없다");
    assert.deepEqual(Object.keys(row).sort(), ["group_id", "group_name", "group_number", "group_role", "name", "person_id"]);
    assert.equal(row.group_number, 7);
  });

  it("리더에게 persons 로는 여전히 다른 목장이 안 보인다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select id from public.persons where id = $1`, [other]));
    assert.equal(r.rows.length, 0);
  });

  it("목사님 · 운영자도 본다", async () => {
    for (const who of ["임찬양", "정다슬"]) {
      const r = await list(who);
      assert.equal(r.error, null, r.error ?? "");
      assert.ok(r.rows.some((x) => x.person_id === other), `${who} 목록에 없다`);
    }
  });

  it("미승인은 못 본다 (42501)", async () => {
    const r = await list("박새벽");
    assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
  });

  it("목장 번호 순, 표시 없는 사람은 없다", async () => {
    const r = await list("권다움");
    const nums = r.rows.map((x) => x.group_number);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    const flagged = (await ctx.db.query(`select count(*)::int as n from public.persons where needs_check and status = 'active'`)).rows[0].n;
    assert.equal(r.rows.length, flagged);
  });
});

const roster = (who) => asUser(ctx, who, (db) => attempt(db, `select * from public.roster_people()`));

describe("roster_people()", () => {
  it("리더는 전체 목장 명단을 본다 — 연락처 · 생년 · 계정 id 없이 ★", async () => {
    const r = await roster("권다움");
    assert.equal(r.error, null, r.error ?? "");
    const row = r.rows.find((x) => x.id === other);
    assert.ok(row, "다른 목장 사람이 명단에 없다");
    assert.deepEqual(Object.keys(row).sort(), ["care_status", "group_id", "group_role", "has_account", "id", "is_group_head", "name", "needs_check", "status"]);
    assert.equal(row.needs_check, true);
    const total = (await ctx.db.query(`select count(*)::int as n from public.persons p join public.groups g on g.id = p.group_id where g.status = 'active'`)).rows[0].n;
    assert.equal(r.rows.length, total);
  });

  it("계정이 붙은 리더는 has_account 참", async () => {
    const r = await roster("권다움");
    const me = r.rows.find((x) => x.name === "권다움");
    assert.equal(me.has_account, true);
  });

  it("미승인은 못 본다 (42501)", async () => {
    const r = await roster("박새벽");
    assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
  });
});
