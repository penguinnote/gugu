/**
 * 첫 접속 동의(2026-11-13) — agree_terms · current_user_context.terms_version
 *
 * 시드 기준: 운영자 정다슬 · 목사님 임찬양 · 3목장 리더 권다움 · 김빛나
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});
after(async () => {
  await ctx?.db?.close?.();
});

const run = (who, sql, params = []) => asUser(ctx, who, (db) => attempt(db, sql, params), { commit: true });
const termsOf = async (who) => (await run(who, `select terms_version from public.current_user_context()`)).rows?.[0]?.terms_version ?? null;

describe("첫 접속 동의", () => {
  it("처음에는 동의 전(null)이고, 동의하면 그 버전이 남는다 ★", async () => {
    assert.equal(await termsOf("권다움"), null);
    assert.equal((await run("권다움", `select public.agree_terms('2026-11-13')`)).error, null);
    assert.equal(await termsOf("권다움"), "2026-11-13");
    const at = (await ctx.db.query(`select u.terms_agreed_at from public.users u join public.persons p on p.user_id = u.id where p.name = '권다움'`)).rows[0].terms_agreed_at;
    assert.ok(at, "시각도 남는다");
  });

  it("본인 것만 바뀐다 — 다른 사람은 여전히 동의 전", async () => {
    await run("임찬양", `select public.agree_terms('2026-11-13')`);
    assert.equal(await termsOf("임찬양"), "2026-11-13");
    assert.equal(await termsOf("김빛나"), null);
  });

  it("버전 모양이 틀리면 거절한다", async () => {
    for (const v of ["", "v1", "2026-1-1", "2026-11-13; drop"]) {
      const r = await run("김빛나", `select public.agree_terms($1)`, [v]);
      assert.match(r.error ?? "", /버전/, v);
    }
    assert.equal(await termsOf("김빛나"), null);
  });

  it("로그인하지 않은 사람은 부를 수 없다 ★", async () => {
    const r = await asAnon(ctx, (db) => attempt(db, `select public.agree_terms('2026-11-13')`));
    assert.ok(r.error, "anon 은 실행 권한이 없다");
  });
});
