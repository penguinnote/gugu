/**
 * 리더 추가는 목사님도, 양을 리더로 올리기는 목사님 · 운영자만(2026-11-26 사용자 결정)
 *   · persons_insert — 목사님은 어느 목장이든 리더로 넣는다(계정 없음 · 활동 · 목장장 아님). 리더는 양으로만
 *   · persons_staff_only — 양 → 리더는 목사님 · 운영자만. 리더 → 양은 지금 규칙 그대로(목사님 · 운영자)
 * 시드 기준: 3목장(다솜) 리더 권다움 / 목사님 임찬양 / 운영자 정다슬
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;
let g7;
before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
});
after(async () => {
  await ctx?.db?.close?.();
});

const run = (who, sql, params) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });
const insert = (who, group, role, name, extra = "") =>
  run(who, `insert into public.persons (name, group_id, group_role, status, joined_at${extra ? ", is_group_head" : ""}) values ($1, $2, $3, 'active', current_date${extra ? ", true" : ""}) returning id, group_role`, [name, group, role]);
let n = 0;
const newMember = async () =>
  (await ctx.db.query(`insert into public.persons (name, group_id, group_role, status, joined_at) values ($1, $2, 'member', 'active', date '2026-09-28') returning id`, [`올림양${++n}`, g3])).rows[0].id;

describe("새 사람 넣기", () => {
  it("목사님은 어느 목장에든 리더를 넣는다 ★", async () => {
    for (const g of [g3, g7]) {
      const r = await insert("임찬양", g, "leader", `목사님리더${g.slice(0, 4)}`);
      assert.equal(r.error, null, r.error ?? "");
      assert.equal(r.rows[0].group_role, "leader");
    }
  });

  it("목사님도 목장장으로 바로 넣지는 못한다(지금 규칙)", async () => {
    const r = await insert("임찬양", g7, "leader", "목장장리더", "head");
    assert.equal(r.code, "42501");
  });

  it("리더는 새 사람을 리더로 넣지 못한다 — 양은 된다 ★", async () => {
    assert.equal((await insert("권다움", g3, "leader", "몰래리더")).code, "42501");
    assert.equal((await insert("권다움", g3, "member", "새양하나")).error, null);
  });

  it("운영자는 그대로 리더를 넣는다", async () => {
    assert.equal((await insert("정다슬", g7, "leader", "운영자리더")).error, null);
  });
});

describe("양 → 리더 올리기", () => {
  it("리더는 양을 리더로 올리지 못한다 ★", async () => {
    const p = await newMember();
    const r = await run("권다움", `update public.persons set group_role = 'leader' where id = $1`, [p]);
    assert.match(r.error ?? "", /리더로 바꾸는 것은 목사님 · 운영자에게 부탁해 주세요/);
  });

  it("목사님 · 운영자는 올린다 ★", async () => {
    for (const who of ["임찬양", "정다슬"]) {
      const p = await newMember();
      assert.equal((await run(who, `update public.persons set group_role = 'leader' where id = $1`, [p])).error, null, who);
    }
  });

  it("리더 → 양 내리기는 지금 규칙 그대로(리더는 못 하고 목사님은 한다)", async () => {
    const free = (await ctx.db.query(`insert into public.persons (name, group_id, group_role, status, joined_at) values ('내릴리더', $1, 'leader', 'active', date '2026-09-28') returning id`, [g3])).rows[0].id;
    assert.match((await run("권다움", `update public.persons set group_role = 'member' where id = $1`, [free])).error ?? "", /목사님 · 운영자/);
    assert.equal((await run("임찬양", `update public.persons set group_role = 'member' where id = $1`, [free])).error, null);
  });
});
