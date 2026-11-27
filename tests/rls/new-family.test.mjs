/**
 * 보고서 화면 새가족 추가(2026-11-26) — DB 쪽.
 *   · 리더가 이름만으로 양을 넣으면 그 주 명단에 들어가 이번 주 출석부터 적힌다
 *   · 같은 이름 확인(same_name_persons) — 다른 목장 · 떠난 사람 포함, 이름 · 목장 · 상태만
 *   · 새로 넣은 사람은 AI 동의가 없어 AI 에서 빠진다(ai_excluded)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;
let week;
before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  week = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
});
after(async () => {
  await ctx?.db?.close?.();
});
const run = (who, sql, params) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });

describe("새가족", () => {
  it("이름만으로 넣으면 이번 주 보고서에 출석을 적을 수 있고, AI 에서 빠진다 ★", async () => {
    const ins = await run("권다움", `insert into public.persons (name, group_id, group_role, status, joined_at) values ('새가족하나', $1, 'member', 'active', $2::date) returning id, ai_excluded, ai_consented_at`, [g3, week]);
    assert.equal(ins.error, null, ins.error ?? "");
    const { id, ai_excluded, ai_consented_at } = ins.rows[0];
    assert.equal(ai_consented_at, null);
    assert.equal(ai_excluded, true, "AI 동의가 없으면 AI 에서 빠져야 한다");
    const rid = (await run("권다움", `select public.open_report($1, $2::date) as id`, [g3, week])).rows[0].id;
    const put = await run("권다움", `select public.submit_report($1, $2::jsonb, null, false, null, false, false)`, [
      rid, JSON.stringify([{ person_id: id, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: true } }]),
    ]);
    assert.equal(put.error, null, put.error ?? "");
  });

  it("같은 이름 확인 — 다른 목장 · 떠난 사람도 이름 · 목장 · 상태로 나온다", async () => {
    const other = (await ctx.db.query(`select p.name, g.name as g from public.persons p join public.groups g on g.id = p.group_id where g.number = 9 and p.group_role = 'member' limit 1`)).rows[0];
    const r = await run("권다움", `select group_name, status from public.same_name_persons($1)`, [other.name]);
    assert.equal(r.error, null);
    assert.ok(r.rows.some((x) => x.group_name === other.g && x.status === "active"));
    const cols = Object.keys(r.rows[0]);
    assert.deepEqual(cols.sort(), ["group_name", "status"].sort());
    assert.equal((await run("권다움", `select * from public.same_name_persons('   ')`)).rows.length, 0);
  });

  it("우리 목장에 같은 이름이 있으면 넣지 못한다", async () => {
    const mine = (await ctx.db.query(`select name from public.persons where group_id = $1 and status <> 'left' limit 1`, [g3])).rows[0].name;
    const r = await run("권다움", `insert into public.persons (name, group_id, group_role, status) values ($1, $2, 'member', 'active')`, [mine, g3]);
    assert.equal(r.code, "23505");
  });
});
