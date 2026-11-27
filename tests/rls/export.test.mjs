/**
 * Step 10 내보내기 — 로그가 통제의 중심이다 (02 §3.3, PRD §6.5)
 *
 *   log_export(format, start, end, group_ids)  목사님만. 범위를 검증하고 로그 id 를 돌려준다.
 *                                              내보내기 화면·Excel 경로는 이것이 성공해야 내보낸다.
 *     · 시작·끝은 주차 키(일요일), 시작 ≤ 끝, 최대 52주
 *     · group_ids 는 null(전체 목장) 또는 운영 중인 목장 id 1개 이상 — 빈 배열·모르는 id 는 거부
 *   export_logs 직접 쓰기는 닫는다 — 지금까지는 아무 로그인 사용자나 자기 이름으로 넣을 수 있었다.
 *   읽기는 목사님·운영자 (기존 정책). 지우기·고치기는 누구도 (영구 보존).
 *   데이터 읽기 경로 — 목사님은 범위 안의 보고서·주간기록 본문을 전부 읽는다(weekly_records_visible).
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let w3, g3, g7, pastorId;

const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  w3 = (await db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  pastorId = (await db.query(`select id from public.users where name = '임찬양'`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const log = (who, args, opts) =>
  asUser(ctx, who, (db) => attempt(db, `select public.log_export($1::public.export_format, $2::date, $3::date, $4::uuid[]) as id`, args), opts);

describe("log_export() — 누가", () => {
  it("목사님은 남긴다 — 로그의 user_id 는 목사님 ★", async () => {
    const r = await log("임찬양", ["xlsx", addDays(w3, -21), w3, [g3, g7]], { commit: true });
    assert.equal(r.error, null, r.error ?? "");
    const row = await asService(ctx, async (db) => (await db.query(`select * from public.export_logs where id = $1`, [r.rows[0].id])).rows[0]);
    assert.equal(row.user_id, pastorId);
    assert.equal(row.format, "xlsx");
    assert.deepEqual([...row.group_ids].sort(), [g3, g7].sort());
  });

  // 리더(권다움 = 3목장)는 자기 목장 하나로만 남긴다(2026-10-14) — 전체(null)는 여기서 막힌다
  it("리더는 자기 목장 하나만 남긴다 — 로그의 group_ids 는 [자기 목장] ★", async () => {
    const r = await log("권다움", ["xlsx", addDays(w3, -21), w3, [g3]], { commit: true });
    assert.equal(r.error, null, r.error ?? "");
    const row = await asService(ctx, async (db) => (await db.query(`select group_ids from public.export_logs where id = $1`, [r.rows[0].id])).rows[0]);
    assert.deepEqual([...row.group_ids], [g3]);
  });
  for (const [label, ids] of [["다른 목장", () => [g7]], ["자기 목장 + 다른 목장", () => [g3, g7]]]) {
    it(`리더는 ${label}을 못 남긴다 (42501)`, async () => {
      const r = await log("권다움", ["print", w3, w3, ids()]);
      assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
    });
  }

  for (const who of ["정다슬", "권다움", "박새벽"]) {
    it(`${who === "정다슬" ? "운영자" : who === "권다움" ? "리더(전체 목장)" : "미승인"}는 못 남긴다 (42501)`, async () => {
      const r = await log(who, ["print", w3, w3, null]);
      assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
    });
  }
});

describe("log_export() — 범위 검증 (22023)", () => {
  const bad = [
    ["시작이 일요일이 아님", () => [addDays(w3, 1), w3, null]],
    ["끝이 일요일이 아님", () => [w3, addDays(w3, 2), null]],
    ["시작 > 끝", () => [w3, addDays(w3, -7), null]],
    ["53주", () => [addDays(w3, -7 * 52), w3, null]],
    ["빈 목장 배열", () => [w3, w3, []]],
    ["모르는 목장 id", () => [w3, w3, ["00000000-0000-0000-0000-000000000000"]]],
  ];
  for (const [label, args] of bad) {
    it(`거부 — ${label}`, async () => {
      const r = await log("임찬양", ["xlsx", ...args()]);
      assert.equal(r.code, "22023", `${label}: ${r.error ?? "통과"}`);
    });
  }

  it("허용 — 52주 · 전체 목장(null)", async () => {
    const r = await log("임찬양", ["print", addDays(w3, -7 * 51), w3, null]);
    assert.equal(r.error, null, r.error ?? "");
  });
});

describe("export_logs 직접 접근", () => {
  it("누구도 직접 insert 못 한다 — 목사님도 함수로만 ★", async () => {
    for (const who of ["임찬양", "권다움"]) {
      const r = await asUser(ctx, who, (db) =>
        attempt(db, `insert into public.export_logs (user_id, format) values (public.current_user_id(), 'xlsx') returning id`),
      );
      assert.equal(r.code, "42501", `${who}: ${r.error ?? "통과"}`);
    }
  });

  it("읽기는 목사님·운영자, 리더는 0행", async () => {
    const n = async (who) => asUser(ctx, who, async (db) => (await db.query(`select id from public.export_logs`)).rows.length);
    assert.ok((await n("임찬양")) >= 1);
    assert.ok((await n("정다슬")) >= 1);
    assert.equal(await n("권다움"), 0);
  });

  it("고치기·지우기는 운영자도 못 한다 (영구 보존)", async () => {
    const u = await asUser(ctx, "정다슬", (db) => attempt(db, `update public.export_logs set format = 'print' returning id`));
    const d = await asUser(ctx, "정다슬", (db) => attempt(db, `delete from public.export_logs returning id`));
    assert.ok(u.error || u.rows.length === 0, "운영자가 로그를 고쳤다");
    assert.ok(d.error || d.rows.length === 0, "운영자가 로그를 지웠다");
  });
});

describe("내보내기 데이터 읽기 경로", () => {
  it("목사님은 범위 안 두 목장의 보고서·기도제목 본문을 읽는다", async () => {
    const r = await asUser(ctx, "임찬양", async (db) => ({
      reports: (await db.query(`select count(*)::int n from public.reports where group_id = any($1) and week_key between $2 and $3`, [[g3, g7], addDays(w3, -21), w3])).rows[0].n,
      prayers: (await db.query(
        `select count(*)::int n from public.weekly_records_visible where group_id_at_write = any($1) and week_key between $2 and $3 and prayer_request is not null`,
        [[g3, g7], addDays(w3, -21), w3],
      )).rows[0].n,
    }));
    assert.ok(r.reports > 0);
    assert.ok(r.prayers > 0, "본문이 가려져 있다");
  });
});
