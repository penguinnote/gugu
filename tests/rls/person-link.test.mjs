/**
 * 한 사람(persons)에 계정이 둘 붙지 않는다 — DB 가 막는다.
 *
 * 배경: Supabase 는 확인된 이메일이 같으면 구글·카카오 신원을 한 계정으로 합치지만,
 * 이메일이 다르면 계정이 둘로 갈린다. 갈린 두 번째 계정이 같은 사람에게 붙으면
 * 같은 목장 보고서를 두 계정이 쓰고, 승인 화면에 같은 이름이 두 번 뜨고, streak 이
 * 쪼개진다.
 *
 * 규칙
 *   1) persons.user_id 는 자리가 하나다 (스칼라).
 *   2) 연결은 빈 자리에만. 이미 찬 자리를 다른 계정으로 **덮을 수 없다** — 호출자가
 *      누구든(리더 직접 UPDATE·definer 함수·테이블 소유자) 트리거가 막는다.
 *   3) 옮기려면 운영자가 먼저 떼어낸다(unlink_person_account). 기록은 사람에 남는다.
 *
 * 애플리케이션 계층 없이 SQL 로만 검증한다 — 그래야 "DB 가 막는다" 가 증명된다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, asAuthUser, attempt, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;
let authA; // 구글, 류지호(3목장 리더, 계정 없음) 로 승인됨
let authB; // 카카오, 다른 이메일 — 같은 류지호 를 노린다

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
async function personUserId(name) {
  const { rows } = await ctx.db.query(`select user_id from public.persons where name = $1`, [name]);
  return rows[0].user_id;
}
async function appUserIdOf(authId) {
  const { rows } = await ctx.db.query(`select id from public.users where auth_user_id = $1`, [authId]);
  return rows[0]?.id ?? null;
}
async function userRow(userId) {
  const { rows } = await ctx.db.query(`select role, status from public.users where id = $1`, [userId]);
  return rows[0];
}
/** 정책을 우회하는 테이블 소유자로 실행하되, 결과는 남기지 않는다. */
async function asOwnerRollback(fn) {
  await ctx.db.exec("begin");
  try {
    return await fn(ctx.db);
  } finally {
    await ctx.db.exec("rollback");
  }
}

// ===========================================================================

describe("두 번째 계정이 같은 사람에게 붙으려 할 때", () => {
  it("A(구글)가 류지호로 신청하고 운영자가 승인한다", async () => {
    authA = await createUnlinkedAuthUser(ctx, "google", "A");
    await asAuthUser(ctx, authA, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const pid = await personId("류지호");
    const appId = await asAuthUser(
      ctx,
      authA,
      async (db) => (await db.query(`select public.apply_for_person($1) as id`, [pid])).rows[0].id,
      { commit: true },
    );
    await asUser(ctx, "정다슬", (db) => db.query(`select public.approve_application($1)`, [appId]), {
      commit: true,
    });
    assert.equal(await personUserId("류지호"), await appUserIdOf(authA));
  });

  it("B(카카오, 다른 이메일)가 같은 류지호로 신청하면 실패한다", async () => {
    authB = await createUnlinkedAuthUser(ctx, "kakao", "B");
    await asAuthUser(ctx, authB, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const pid = await personId("류지호");
    const r = await asAuthUser(ctx, authB, (db) => attempt(db, `select public.apply_for_person($1)`, [pid]));
    assert.notEqual(r.error, null, "점유된 사람에게 두 번째 신청이 통했다");
    assert.equal(await personUserId("류지호"), await appUserIdOf(authA), "연결이 바뀌면 안 된다");
  });

  it("3목장 리더가 persons.user_id 를 직접 고쳐 B 로 옮길 수 없다 ★", async () => {
    const pid = await personId("류지호");
    const bId = await appUserIdOf(authB);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `update public.persons set user_id = $1 where id = $2`, [bId, pid]),
    );
    assert.notEqual(r.error, null, "리더의 직접 UPDATE 로 연결이 옮겨졌다");
    assert.equal(r.code, "42501", "user_id 컬럼에는 UPDATE 권한이 없어야 한다");
  });

  it("리더는 user_id 를 비울 수도 없다 — 떼는 것도 운영자만", async () => {
    const pid = await personId("류지호");
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `update public.persons set user_id = null where id = $1`, [pid]),
    );
    assert.notEqual(r.error, null);
    assert.equal(r.code, "42501");
  });

  it("리더는 user_id 외의 컬럼은 여전히 고칠 수 있다 (권한 축소가 다른 기능을 깨지 않는다)", async () => {
    const pid = await personId("류지호");
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `update public.persons set birth_date = '2000-10-09' where id = $1`, [pid]),
    );
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.affected, 1);
  });

  it("정책을 우회한 테이블 소유자도 이미 연결된 사람의 user_id 를 다른 계정으로 덮을 수 없다 ★", async () => {
    const pid = await personId("류지호");
    const bId = await appUserIdOf(authB);
    const r = await asOwnerRollback((db) =>
      attempt(db, `update public.persons set user_id = $1 where id = $2`, [bId, pid]),
    );
    assert.notEqual(r.error, null, "RLS 없이도 DB 가 막아야 한다 — 이것이 '제약' 이다");
    assert.equal(r.code, "23505");
  });

  it("같은 값으로 다시 쓰는 것(시드 재실행)과 빈 자리에 붙이는 것은 허용된다", async () => {
    const pid = await personId("류지호");
    const aId = await appUserIdOf(authA);
    const same = await asOwnerRollback((db) =>
      attempt(db, `update public.persons set user_id = $1 where id = $2`, [aId, pid]),
    );
    assert.equal(same.error, null, same.error ?? "");

    const free = await asOwnerRollback(async (db) => {
      await db.query(`update public.persons set user_id = null where id = $1`, [pid]);
      return attempt(db, `update public.persons set user_id = $1 where id = $2`, [await appUserIdOf(authB), pid]);
    });
    assert.equal(free.error, null, free.error ?? "");
  });
});

describe("신청 목록", () => {
  it("점유된 사람은 지워지지 않고 어느 로그인 방법이 잡고 있는지와 함께 나온다 ★", async () => {
    const g3 = await groupId(3);
    const rows = await asAuthUser(ctx, authB, async (db) => {
      const r = await db.query(
        `select name, claimed, claimed_provider from public.list_claimable_persons($1) order by name`,
        [g3],
      );
      return r.rows;
    });
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    // 3목장 리더 전원이 보인다 — 빠지는 사람이 없어야 본인이 자기 이름을 찾는다. 청년은 없다.
    assert.deepEqual(Object.keys(byName).sort(), ["권다움", "김빛나", "도하린", "류지호"]);
    assert.equal(byName["류지호"].claimed, true);
    assert.equal(byName["류지호"].claimed_provider, "google", "A 가 구글로 처음 썼다");
    assert.equal(byName["도하린"].claimed_provider, "kakao");
  });
});

describe("운영자의 연결 해제 — unlink_person_account", () => {
  it("리더와 목사님은 부를 수 없다", async () => {
    const pid = await personId("류지호");
    for (const who of ["권다움", "임찬양"]) {
      const r = await asUser(ctx, who, (db) => attempt(db, `select public.unlink_person_account($1)`, [pid]));
      assert.notEqual(r.error, null, `${who} 가 연결을 해제했다`);
      assert.equal(r.code, "42501", who);
    }
    assert.equal(await personUserId("류지호"), await appUserIdOf(authA));
  });

  it("떼면 user_id 가 비고, 계정은 pending 이 되고, 리더 권한도 사라진다", async () => {
    // 리더 계정이 붙은 사람으로 확인한다 — 명단 연결이 리더 권한의 근거였다.
    const pid = await personId("도하린");
    const uid = await personUserId("도하린");
    assert.equal((await userRow(uid)).role, "leader");

    await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1)`, [pid]), {
      commit: true,
    });

    assert.equal(await personUserId("도하린"), null);
    assert.deepEqual(await userRow(uid), { role: "pending", status: "active" });

    const { rows } = await ctx.db.query(
      `select user_id, person_id, group_id from public.events where type = 'account_unlinked' order by id desc limit 1`,
    );
    assert.equal(rows.length, 1, "account_unlinked 이벤트가 남아야 한다");
    assert.equal(rows[0].person_id, pid);
    assert.equal(rows[0].group_id, await groupId(3));
    const admin = await ctx.db.query(`select id from public.users where name = '정다슬'`);
    assert.equal(rows[0].user_id, admin.rows[0].id, "누가 했는지");
  });

  it("주간기록은 사람에 남아 보존된다 — 계정을 떼도 streak 의 재료는 그대로", async () => {
    const pid = await personId("도하린");
    const { rows } = await ctx.db.query(
      `select count(*)::int as n from public.weekly_records where person_id = $1`,
      [pid],
    );
    assert.ok(rows[0].n > 0, "시드에 도하린의 기록이 있어야 이 테스트가 뜻이 있다");
    const before = rows[0].n;
    // 떼어낸 뒤에도(위 테스트) 같은 수. 사람이 남아 있으니 당연하지만, 그것이 규칙이다.
    const after = await ctx.db.query(`select count(*)::int as n from public.weekly_records where person_id = $1`, [pid]);
    assert.equal(after.rows[0].n, before);
    const gone = await ctx.db.query(`select 1 from public.persons where id = $1`, [pid]);
    assert.equal(gone.rows.length, 1, "사람 행은 지워지지 않는다");
  });

  it("뗀 뒤에는 다른 계정으로 다시 붙일 수 있다", async () => {
    // 류지호: A 를 떼고 B 를 붙인다.
    const pid = await personId("류지호");
    await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1)`, [pid]), {
      commit: true,
    });
    assert.equal(await personUserId("류지호"), null);
    assert.equal((await userRow(await appUserIdOf(authA))).role, "pending");

    const appId = await asAuthUser(
      ctx,
      authB,
      async (db) => (await db.query(`select public.apply_for_person($1) as id`, [pid])).rows[0].id,
      { commit: true },
    );
    await asUser(ctx, "정다슬", (db) => db.query(`select public.approve_application($1)`, [appId]), {
      commit: true,
    });
    assert.equal(await personUserId("류지호"), await appUserIdOf(authB));
  });

  it("p_disable 이면 계정을 잠근다 — 남의 계정이 붙었던 경우", async () => {
    const pid = await personId("류지호");
    const bId = await appUserIdOf(authB);
    await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1, true)`, [pid]), {
      commit: true,
    });
    assert.deepEqual(await userRow(bId), { role: "pending", status: "inactive" });
    // 잠긴 계정은 앱 계정으로 인식되지 않는다.
    const r = await asAuthUser(ctx, authB, (db) => attempt(db, `select public.apply_for_person($1)`, [pid]));
    assert.notEqual(r.error, null);
  });

  it("연결된 계정이 없으면 거부한다", async () => {
    const pid = await personId("남시현");
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.unlink_person_account($1)`, [pid]));
    assert.notEqual(r.error, null);
    assert.equal(r.code, "22023");
  });
});
