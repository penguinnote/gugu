/**
 * 리더는 역할이 아니라 명단에서 온다 (2026-09-27)
 *
 * A. 겸임 — 운영자(admin)이면서 명단상 리더인 사람은 자기 목장의 주간기록을 리더로서
 *    읽고 쓴다. users.role 은 값 하나라 admin 이 leader 를 대체하는데, 그러면 운영자가
 *    자기 목장 보고서를 못 쓴다. 그래서 is_leader_of() 는 "role 이 leader 또는 admin"
 *    이고 "연결된 사람이 그 목장의 활동 중 리더" 일 때 참이다.
 *      - 운영자라도 명단에서 리더가 아니면 얻는 게 없다 — "운영자는 본문을 못 본다" 유지
 *      - 명단에서 리더를 내리면 앱 권한도 그 즉시 끝난다 — 임명은 명단이 하고 앱은 따른다
 *
 * (B 승인 주체 테스트는 2026-09-27 청년 계정 폐지로 leaders-only.test.mjs 로 옮겼다 —
 *  이제 신청은 리더뿐이고 승인·거절은 운영자만 한다.)
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

async function groupId(number) {
  const { rows } = await ctx.db.query(`select id from public.groups where number = $1`, [number]);
  return rows[0].id;
}
async function personId(name) {
  const { rows } = await ctx.db.query(`select id from public.persons where name = $1`, [name]);
  return rows[0].id;
}
async function userIdByName(name) {
  const { rows } = await ctx.db.query(`select id from public.users where name = $1`, [name]);
  return rows[0].id;
}
/** 정책을 우회하는 소유자로 실행하고 결과를 남긴다 — 테스트 전제를 만들 때만 쓴다. */
async function asOwner(fn) {
  return fn(ctx.db);
}
async function recordCount(db, groupNumber) {
  const gid = await groupId(groupNumber);
  const r = await db.query(
    `select count(*)::int as n from public.weekly_records where group_id_at_write = $1`,
    [gid],
  );
  return r.rows[0].n;
}

// ===========================================================================

describe("A. 운영자이면서 명단상 리더", () => {
  it("전제: 운영자 정다슬을 3목장 리더 류지호(시드에서 계정 없음)에 연결한다", async () => {
    const pid = await personId("류지호");
    // 빈 자리에 붙이는 것은 허용된다(person-link 테스트). 운영자는 신청→승인 경로가 없으므로 소유자가 직접 붙인다.
    const adminId = await userIdByName("정다슬");
    await asOwner((db) => db.query(`update public.persons set user_id = $1 where id = $2`, [adminId, pid]));
    const { rows } = await ctx.db.query(`select role from public.users where id = $1`, [adminId]);
    assert.equal(rows[0].role, "admin", "역할은 그대로 admin 이어야 한다 — 겸임의 전제");
  });

  it("자기 목장(3목장)의 주간기록을 본다 ★", async () => {
    const n = await asUser(ctx, "정다슬", (db) => recordCount(db, 3));
    assert.ok(n > 0, `운영자+명단 리더인데 3목장 기록이 0행이다`);
  });

  it("다른 목장(1목장)의 주간기록은 여전히 0행 — 운영자 권한으로는 본문을 못 본다", async () => {
    const n = await asUser(ctx, "정다슬", (db) => recordCount(db, 1));
    assert.equal(n, 0);
  });

  it("자기 목장의 보고서를 열고 쓸 수 있다 ★", async () => {
    const g3 = await groupId(3);
    const r = await asUser(ctx, "정다슬", (db) =>
      // 이번 주 — 날짜를 박아 두면 그 주가 '이번 주 앞 3주' 밖으로 밀려 새로 쓸 수 없게 된다(2026-11-04)
      attempt(db, `select public.open_report($1, public.kst_current_week()) as id`, [g3]),
    );
    assert.equal(r.error, null, r.error ?? "");
    assert.ok(r.rows[0].id);
  });

  it("다른 목장의 보고서는 열 수 없다", async () => {
    const g1 = await groupId(1);
    const r = await asUser(ctx, "정다슬", (db) =>
      attempt(db, `select public.open_report($1, public.kst_current_week()) as id`, [g1]),
    );
    assert.notEqual(r.error, null);
  });

  it("운영자 권한은 그대로다 — 전체 목장의 대기 건을 본다", async () => {
    const rows = await asUser(ctx, "정다슬", async (db) => (await db.query(`select group_number from public.list_pending_applications()`)).rows);
    assert.ok(rows.length >= 1);
  });

  it("운영자를 명단상 청년에게 붙이는 것 자체가 막힌다 — 청년은 앱 계정이 없다", async () => {
    const adminId = await userIdByName("정다슬");
    const ryu = await personId("류지호");
    const ko = await personId("고은결");
    await ctx.db.exec("begin");
    try {
      await ctx.db.query(`update public.persons set user_id = null where id = $1`, [ryu]);
      const r = await attempt(ctx.db, `update public.persons set user_id = $1 where id = $2`, [adminId, ko]);
      assert.notEqual(r.error, null, "청년 person 에 운영자 계정이 붙었다");
      assert.equal(r.code, "23514");
    } finally {
      await ctx.db.exec("rollback");
    }
  });

  it("명단에서 리더를 내리려면 먼저 계정을 떼야 하고, 떼는 순간 권한이 끝난다 ★ — 임명은 명단이 한다", async () => {
    // 1목장 구소리(리더, 목장장 아님, 계정 있음). 계정이 붙은 채로는 내릴 수 없다.
    const pid = await personId("구소리");
    const blocked = await ctx.db.exec("begin").then(async () => {
      try {
        return await attempt(ctx.db, `update public.persons set group_role = 'member' where id = $1`, [pid]);
      } finally {
        await ctx.db.exec("rollback");
      }
    });
    assert.notEqual(blocked.error, null, "계정이 붙은 리더가 명단에서 바로 내려갔다");
    assert.equal(blocked.code, "23514");

    // 운영자가 떼면 계정은 pending 이 되어 1목장 기록을 못 본다.
    const g1 = await groupId(1); // 역할을 바꾸기 전에 읽는다 — pending 은 groups 를 못 본다
    await ctx.db.exec("begin");
    try {
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ctx.authIdByName["정다슬"], role: "authenticated" }),
      ]);
      await ctx.db.exec(`set local role authenticated`);
      await ctx.db.query(`select public.unlink_person_account($1)`, [pid]);
      await ctx.db.exec(`reset role`);
      await ctx.db.query(`update public.persons set group_role = 'member' where id = $1`, [pid]); // 이제는 된다
      await ctx.db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ctx.authIdByName["구소리"], role: "authenticated" }),
      ]);
      await ctx.db.exec(`set local role authenticated`);
      const n = (await ctx.db.query(
        `select count(*)::int as n from public.weekly_records where group_id_at_write = $1`, [g1],
      )).rows[0].n;
      assert.equal(n, 0, "떼어낸 사람이 여전히 1목장 기록을 본다");
      const role = (await ctx.db.query(`select public.current_app_role() as r`)).rows[0].r;
      assert.equal(role, "pending");
    } finally {
      await ctx.db.exec("rollback");
    }
  });

});
