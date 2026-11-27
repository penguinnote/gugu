/**
 * 명단 도입 — 상태 태그(care_status)와 needs_check (2026-09-30)
 *
 * 가짜 명단으로 scripts/lib/roster.mjs 의 순수 함수를 PGlite 위에서 돌린다. 실명은 없다.
 *
 *   ★ 재도입해도 needs_check 는 리셋되지 않는다 — 리더가 확인해 false 로 바꾼 것은 그대로.
 *     (이번 단계에서 가장 중요한 테스트. 수정 전 실패를 먼저 본다.)
 *   · 명단 재도입은 회원 칸(2026-10-28 부터 앱이 원본)을 덮지 않고, 공개 뷰에도 보이지 않는다
 *   · 상태 태그는 설정(overrides)으로만. 판정 제외 태그면 needs_check 는 false
 *   · 리더 해제 + 기록 제외 설정은 group_role=member, status=opted_out 으로
 *   · RLS: 다른 목장 리더에게 care_status·needs_check 가 보이지 않는다. 공개 뷰에는 컬럼 자체가 없다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";
import { buildImportSql, normalizeRows, summarize } from "../../scripts/lib/roster.mjs";

let ctx;

// 가짜 명단 두 목장. member = '청년대학부 회원' 셀.
const ROWS = [
  { r: 4, group: "가온", name: "테스트리더1", kind: "리더", stage: "목자", birth: "1999", gender: "남", member: "O" },
  { r: 5, group: "가온", name: "테스트리더2", kind: "리더", stage: "목동", birth: "2000", gender: "여", member: "O" },
  { r: 6, group: "가온", name: "테스트양1", kind: "양", stage: "새가족반", birth: "2003", gender: "남", member: "" },   // needs_check
  { r: 7, group: "가온", name: "테스트양2", kind: "양", stage: "-", birth: "2002", gender: "여", member: "O" },
  { r: 8, group: "가온", name: "테스트양3", kind: " 양", stage: "", birth: "", gender: "", member: "" },              // 공백 trim, needs_check
  { r: 9, group: "나래", name: "테스트리더3", kind: "리더", stage: "목자", birth: "1998", gender: "남", member: "O" },
  { r: 10, group: "나래", name: "테스트양4", kind: "양", stage: "양", birth: "2004", gender: "여", member: "" },       // military → false
  { r: 11, group: "나래", name: "테스트양5", kind: "양", stage: "양", birth: "2001", gender: "남", member: "" },       // long_absent → true
];
const OVERRIDES = {
  care_status: { military: ["테스트양4"], long_absent: ["테스트양5"], other_church: ["나래/테스트리더3"] },
  demote_leaders: ["나래/테스트리더3"],
  opt_out: ["나래/테스트리더3"],
};
const trimmed = ROWS.map((x) => ({ ...x, kind: x.kind.trim(), group: x.group.trim(), name: x.name.trim() }));

before(async () => {
  ctx = await createTestDb();
  // 실명단 위의 재도입처럼 돌린다 — 첫 도입 경로(기록·계정 삭제)를 타지 않게.
  await ctx.db.query(`insert into public.app_meta (key, value) values ('roster_source', 'real') on conflict (key) do update set value = 'real'`);
});

after(async () => {
  await ctx?.db?.close?.();
});

async function importOnce(expectNeedsCheck = null) {
  const { people, groups, errors } = normalizeRows(trimmed, OVERRIDES);
  assert.deepEqual(errors, []);
  const realAccounts = (await ctx.db.query(`select count(*)::int as n from public.users where auth_user_id is not null`)).rows[0].n;
  const sql = buildImportSql({ people, groups, rekeys: [], firstImport: false, realAccounts, expectNeedsCheck });
  // 여러 문장이라 exec 로 보낸다(준비문은 한 문장만 받는다). 실패하면 트랜잭션이 남아 있으므로 되돌린다.
  let r;
  try {
    await ctx.db.exec(sql);
    r = { error: null };
  } catch (e) {
    r = { error: e.message };
    await ctx.db.exec("rollback").catch(() => {});
  }
  return { r, people };
}
async function person(name) {
  return (await ctx.db.query(`select group_role, status, care_status, needs_check from public.persons where name = $1`, [name])).rows[0];
}

describe("normalizeRows — 정제와 태그", () => {
  it("구분 공백을 trim 하고, 회원 빈칸인 판정 대상만 needs_check 다", () => {
    const { people, errors } = normalizeRows(trimmed, OVERRIDES);
    assert.deepEqual(errors, []);
    const s = summarize(people);
    // 양1(빈칸·active) · 양3(빈칸·active) · 양5(빈칸·long_absent) = 3. 양4 는 military 라 제외.
    assert.equal(s.needsCheckTotal, 3);
    assert.deepEqual(s.needsCheckByGroup, { 가온: 2, 나래: 1 });
    assert.deepEqual(s.byStatus, { active: 5, military: 1, long_absent: 1, other_church: 1 });
    assert.equal(people.find((p) => p.name === "테스트리더3").groupRole, "member", "리더 해제");
  });

  it("설정의 이름이 명단에 없거나 동명이인이면 거부한다 — 위치만 알려준다", () => {
    const { errors } = normalizeRows(trimmed, { care_status: { remote: ["없는사람"] } });
    assert.deepEqual(errors, ["overrides.care_status.remote[0]: 명단에 없는 이름"]);
  });
});

describe("도입 — needs_check 는 처음 한 번만 ★", () => {
  it("첫 도입: 회원 빈칸인 판정 대상이 needs_check=true, 기대 수와 다르면 멈춘다", async () => {
    const wrong = await importOnce(99);
    assert.notEqual(wrong.r.error, null, "기대 수(99)와 다른데 통과했다");
    assert.match(wrong.r.error, /needs_check 수 불일치/);

    const ok = await importOnce(3);
    assert.equal(ok.r.error, null, ok.r.error ?? "");
    assert.equal((await person("테스트양1")).needs_check, true);
    assert.equal((await person("테스트양2")).needs_check, false);
    assert.equal((await person("테스트양4")).needs_check, false, "military 는 판정 제외");
    assert.equal((await person("테스트양5")).needs_check, true, "long_absent 는 판정 대상");
    assert.equal((await person("테스트양4")).care_status, "military");
  });

  it("리더가 확인해 false 로 바꾼 뒤 재도입해도 되돌아가지 않는다 ★", async () => {
    await ctx.db.query(`update public.persons set needs_check = false where name = '테스트양1'`);
    const again = await importOnce(null);
    assert.equal(again.r.error, null, again.r.error ?? "");
    assert.equal((await person("테스트양1")).needs_check, false, "재도입이 needs_check 를 리셋했다");
    assert.equal((await person("테스트양5")).needs_check, true, "손대지 않은 행은 그대로");
  });

  it("리더 해제 + 기록 제외 설정 — group_role=member, status=opted_out, care_status=other_church", async () => {
    const p = await person("테스트리더3");
    assert.deepEqual(p, { group_role: "member", status: "opted_out", care_status: "other_church", needs_check: false });
  });

  it("명단 재도입은 회원 칸을 쓰지 않는다 — 2026-10-28 부터 회원 칸의 원본은 앱(리더가 고친다, roster:details 가 한 번 옮긴다)", async () => {
    const { people, groups } = normalizeRows(trimmed, OVERRIDES);
    const sql = buildImportSql({ people, groups, rekeys: [], firstImport: false, realAccounts: 0 });
    assert.ok(!/youth_member|assembly_member|occupation|affiliation|note\b/.test(sql), "재도입 SQL 이 앱에서 고치는 칸을 덮는다");
    const cols = (await ctx.db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'persons_public'`)).rows.map((r) => r.column_name);
    assert.ok(!cols.some((c) => /member|assembly|occupation|affiliation|note/i.test(c)), `공개 뷰에 새 칸이 보인다: ${cols.join(",")}`);
  });
});

describe("RLS — 상태 태그는 다른 목장에 보이지 않는다", () => {
  it("다른 목장 리더의 persons 조회에는 그 목장 행이 없고, 공개 뷰에는 컬럼 자체가 없다 ★", async () => {
    // 가온 = 1번 목장(시드 이름). 시드의 다른 목장 리더 노해찬(7번)으로 본다.
    const g1 = (await ctx.db.query(`select id from public.groups where name = '가온'`)).rows[0].id;
    const rows = await asUser(ctx, "노해찬", async (db) =>
      (await db.query(`select care_status, needs_check from public.persons where group_id = $1`, [g1])).rows);
    assert.equal(rows.length, 0);
    const pub = await asUser(ctx, "노해찬", (db) => attempt(db, `select needs_check from public.persons_public limit 1`));
    assert.notEqual(pub.error, null, "공개 뷰에 needs_check 가 있다");
    const pub2 = await asUser(ctx, "노해찬", (db) => attempt(db, `select care_status from public.persons_public limit 1`));
    assert.notEqual(pub2.error, null, "공개 뷰에 care_status 가 있다");
  });

  it("목사님은 전체를 본다 — 목장별로 갈라서 (가짜 명단의 리더는 계정이 없어 리더 시점은 위 테스트로 대신한다)", async () => {
    // 재도입으로 시드 가명 인원은 left 가 됐고(명단에 없으니까), needs_check 는 null 이라 세지 않는다.
    const rows = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(
        `select g.name, count(*) filter (where p.needs_check)::int as n
           from public.persons p join public.groups g on g.id = p.group_id
          where p.status <> 'left' group by g.name order by g.name`)).rows);
    assert.deepEqual(rows, [{ name: "가온", n: 1 }, { name: "나래", n: 1 }]); // 양1 은 리더가 false 로 바꿨다
  });
});
