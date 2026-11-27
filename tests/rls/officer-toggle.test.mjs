/**
 * 임원진 맡기기를 명단 화면에서(2026-11-26) — 사람 화면의 켜고 끄기는 계정 권한과 같은 admin_update_account 를 부른다.
 *   · 켜면 그 리더가 전체 명단 엑셀(log_roster_export(null))을 받고, 끄면 못 받는다
 *   · 임원진이 아닌 리더는 자기 목장 엑셀만
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

const who = "김여울";
const userId = async () => (await ctx.db.query(`select user_id from public.persons where name = $1`, [who])).rows[0].user_id;
const groupOf = async (name) => (await ctx.db.query(`select id from public.groups where name = $1`, [name])).rows[0].id;
const toggle = (uid, on) => asUser(ctx, "정다슬", (db) => attempt(db, `select public.admin_update_account($1, $2)`, [uid, on ? "officer_on" : "officer_off"]), { commit: true });
const fullExport = () => asUser(ctx, who, (db) => attempt(db, `select public.log_roster_export(null)`));
const groupExport = (gid) => asUser(ctx, who, (db) => attempt(db, `select public.log_roster_export($1)`, [gid]));

describe("명단 화면의 임원진 켜고 끄기", () => {
  it("임원진이 아닌 리더는 자기 목장 엑셀만 — 전체 · 남의 목장은 막힌다 ★", async () => {
    assert.equal((await fullExport()).code, "42501");
    assert.equal((await groupExport(await groupOf("자람"))).error, null);
    assert.equal((await groupExport(await groupOf("가온"))).code, "42501");
  });

  it("켜면 전체 명단 엑셀을 받고, 끄면 다시 못 받는다 ★", async () => {
    const uid = await userId();
    assert.equal((await toggle(uid, true)).error, null);
    assert.equal((await fullExport()).error, null);
    assert.equal((await toggle(uid, false)).error, null);
    assert.equal((await fullExport()).code, "42501");
  });

  it("운영자만 켠다", async () => {
    const uid = await userId();
    const r = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.admin_update_account($1, 'officer_on')`, [uid]));
    assert.match(r.error ?? "", /운영자만/);
  });
});
