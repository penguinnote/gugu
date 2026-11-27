/**
 * 앱 사용자는 리더·목사님·운영자뿐이다 (2026-09-27)
 *
 * 청년(양)에게는 앱을 공유하지 않기로 했다. 구분을 분명히:
 *   남는다   persons 의 청년 39명 (group_role = 'member') — 출석·기도제목 대상
 *   없어진다 앱 사용자로서의 청년 — users.role = 'member', 청년 로그인·신청·화면
 *
 * 따라서
 *   1) user_role enum 에 'member' 가 없다 (타입 교체)
 *   2) 청년 person 에는 계정을 붙일 수 없다 — DB 트리거. 리더를 청년으로 내리려면 먼저 뗀다
 *   3) 신청 대상은 명단상 리더뿐이다
 *   4) 승인·거절은 운영자만 한다. 목장 리더도 목사님도 아니다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, asAuthUser, attempt, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});

after(async () => {
  await ctx?.db?.close?.();
});

async function groupId(number) {
  const { rows } = await ctx.db.query(`select id from public.groups where number = $1`, [number]);
  return rows[0].id;
}
async function personId(name) {
  const { rows } = await ctx.db.query(`select id from public.persons where name = $1`, [name]);
  return rows[0].id;
}
async function ownerRollback(fn) {
  await ctx.db.exec("begin");
  try {
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}

describe("청년은 앱 사용자가 아니다", () => {
  it("user_role 에 'member' 가 없다 ★", async () => {
    const r = await attempt(ctx.db, `select 'member'::public.user_role`);
    assert.notEqual(r.error, null, "'member' 가 여전히 user_role 값이다");
    assert.equal(r.code, "22P02");
    const { rows } = await ctx.db.query(`select enum_range(null::public.user_role)::text[] as v`);
    assert.deepEqual(rows[0].v, ["pending", "leader", "pastor", "admin", "officer"]);
  });

  it("청년 person 에는 계정을 붙일 수 없다 — 소유자가 해도 트리거가 막는다 ★", async () => {
    const { rows } = await ctx.db.query(
      `select count(*)::int as n from public.persons where group_role = 'member' and user_id is not null`,
    );
    assert.equal(rows[0].n, 0, "청년 person 에 연결된 계정이 남아 있다");

    const pid = await personId("고은결"); // 3목장 청년
    const admin = (await ctx.db.query(`select id from public.users where name = '정다슬'`)).rows[0].id;
    const r = await ownerRollback((db) =>
      attempt(db, `update public.persons set user_id = $1 where id = $2`, [admin, pid]),
    );
    assert.notEqual(r.error, null, "청년 person 에 계정이 붙었다");
    assert.equal(r.code, "23514");
  });

  it("연결된 리더를 청년으로 내리려면 먼저 떼야 한다", async () => {
    const pid = await personId("김빛나"); // 3목장 리더, 계정 있음
    const r = await ownerRollback((db) =>
      attempt(db, `update public.persons set group_role = 'member' where id = $1`, [pid]),
    );
    assert.notEqual(r.error, null);
    assert.equal(r.code, "23514");
  });

  it("신청 목록에는 명단상 리더만 나온다 — 청년 이름은 없다 ★", async () => {
    const g3 = await groupId(3);
    const rows = await asUser(ctx, "한이음", async (db) => {
      const r = await db.query(`select name, claimed from public.list_claimable_persons($1)`, [g3]);
      return r.rows;
    });
    const names = rows.map((r) => r.name).sort();
    // 3목장 리더 4명. 청년(고은결·남시현·서다온)은 나오지 않는다.
    assert.deepEqual(names, ["권다움", "김빛나", "도하린", "류지호"]);
  });

  it("청년 person 으로는 신청할 수 없다", async () => {
    const pid = await personId("서다온");
    const r = await asUser(ctx, "한이음", (db) => attempt(db, `select public.apply_for_person($1)`, [pid]));
    assert.notEqual(r.error, null);
    assert.equal(r.code, "22023");
  });

  it("승인은 운영자만 — 목장 리더가 승인하면 거부된다 ★", async () => {
    // 시드: 3목장 리더 류지호는 계정이 없고, 박새벽이 신청해 두었다.
    const { rows } = await ctx.db.query(
      `select a.id from public.applications a join public.persons p on p.id = a.person_id
        where p.name = '류지호' and a.status = 'pending'`,
    );
    assert.equal(rows.length, 1, "시드에 류지호 신청이 있어야 한다");
    const appId = rows[0].id;

    for (const who of ["권다움", "임찬양"]) {
      const r = await asUser(ctx, who, (db) => attempt(db, `select public.approve_application($1)`, [appId]));
      assert.notEqual(r.error, null, `${who} 가 승인했다`);
      assert.equal(r.code, "42501", who);
      const rej = await asUser(ctx, who, (db) => attempt(db, `select public.reject_application($1)`, [appId]));
      assert.notEqual(rej.error, null, `${who} 가 거절했다`);
      assert.equal(rej.code, "42501", who);
    }

    // 목록도 운영자만 본다.
    const seenByLeader = await asUser(ctx, "권다움", async (db) => (await db.query(`select id from public.list_pending_applications()`)).rows);
    assert.equal(seenByLeader.length, 0, "목장 리더의 목록에 신청이 보인다");
    const seenByPastor = await asUser(ctx, "임찬양", async (db) => (await db.query(`select id from public.list_pending_applications()`)).rows);
    assert.equal(seenByPastor.length, 0, "목사님의 목록에 신청이 보인다");

    await asUser(ctx, "정다슬", (db) => db.query(`select public.approve_application($1)`, [appId]), { commit: true });
    const after = await ctx.db.query(
      `select u.role from public.persons p join public.users u on u.id = p.user_id where p.name = '류지호'`,
    );
    assert.equal(after.rows[0]?.role, "leader", "승인 결과는 곧바로 leader");
  });

  it("set_user_role 은 없다 — 리더는 승인으로만 생기고 내리는 건 unlink 다", async () => {
    const r = await attempt(ctx.db, `select proname from pg_proc where proname = 'set_user_role'`);
    assert.equal(r.rows.length, 0);
  });

  it("승인 대기 중인 리더(pending)는 보고서에 손대지 못한다", async () => {
    const auth = await createUnlinkedAuthUser(ctx, "google", "대기중");
    await asAuthUser(ctx, auth, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const g3 = await groupId(3);
    const r = await asAuthUser(ctx, auth, (db) =>
      attempt(db, `select public.open_report($1, '2026-09-27')`, [g3]),
    );
    assert.notEqual(r.error, null);
    const rows = await asAuthUser(ctx, auth, async (db) =>
      (await db.query(`select count(*)::int as n from public.weekly_records`)).rows[0].n);
    assert.equal(rows, 0, "미승인 계정에게는 빈 결과");
  });
});
