/**
 * Step 9c — 프리뷰 쓰기 차단의 분류표가 DB 와 맞는가.
 *
 * 프리뷰에서 rpc 는 src/lib/rpc-classes.json 의 readOnly·session 만 통과한다(src/lib/preview-guard.ts).
 * readOnly 로 분류한 함수가 실제로 쓰기를 하면 차단이 뚫린다 — 그래서 DB 에서 volatile 이 아닌지 본다.
 * (stable/immutable 함수 안에서는 Postgres 가 insert·update·delete 를 거부한다.)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createTestDb } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const classes = JSON.parse(readFileSync(path.join(ROOT, "src/lib/rpc-classes.json"), "utf8"));

let ctx;
before(async () => {
  ctx = await createTestDb();
});
after(async () => {
  await ctx?.db?.close?.();
});

const volatility = async (name) =>
  (await ctx.db.query(`select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name])).rows.map((r) => r.provolatile);

describe("rpc 분류표 ↔ DB", () => {
  it("분류표의 함수는 전부 DB 에 있다", async () => {
    for (const name of [...classes.readOnly, ...classes.session, ...classes.write]) {
      const v = await volatility(name);
      assert.ok(v.length > 0, `${name} 이 DB 에 없다`);
    }
  });

  it("readOnly 는 전부 stable/immutable — 쓰기를 할 수 없다 ★", async () => {
    for (const name of classes.readOnly) {
      const v = await volatility(name);
      assert.ok(v.every((x) => x === "s" || x === "i"), `${name} 이 volatile 이다 — 프리뷰에서 쓰기가 샌다`);
    }
  });
});
