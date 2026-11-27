/**
 * 역할 4단계와 신청·승인 테스트 (Step 3.5 → 2026-09-27 리더 전용으로 축소)
 *
 *   pending  아무것도 못 본다 (신청 전·승인 대기 중인 리더, 청년부 프로필은 2026-11-26 지웠다)
 *   leader   자기 목장 주간기록 R/W · 목장 프로필 편집
 *   pastor   전체
 *   admin    관리 · 신청 승인·거절 · 연결 해제
 *
 * 청년은 앱을 쓰지 않는다 — persons.group_role = 'member' 로만 존재한다
 * (tests/rls/leaders-only.test.mjs). 미승인 계정에게는 출석·보고서의 존재가
 * 드러나면 안 된다 — 권한 오류(42501)가 아니라 빈 결과.
 *
 * 시드: 3목장 리더 류지호만 계정이 없고, 박새벽이 류지호로 신청해 둔 상태다.
 * 다른 리더 person 이 필요하면 freeLeader() 가 운영자로 연결을 떼어 만든다.
 *
 * 모든 테스트는 실제 RLS 가 적용된 상태에서 돈다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  asAnon,
  asAuthUser,
  asUser,
  attempt,
  createTestDb,
  createUnlinkedAuthUser,
} from "./harness.mjs";

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
async function userRole(name) {
  const { rows } = await ctx.db.query(`select role from public.users where name = $1`, [name]);
  return rows[0].role;
}
/**
 * 계정이 붙어 있는 목장장 아닌 리더 한 명을 운영자가 떼어 "계정 없는 리더" 로 만든다.
 * 신청 픽스처용. 3목장(다른 테스트가 쓴다)은 피한다.
 */
async function freeLeader() {
  const { rows } = await ctx.db.query(
    `select p.id, p.name, g.number as group_number
       from public.persons p join public.groups g on g.id = p.group_id
      where g.number <> 3 and p.group_role = 'leader' and p.status = 'active'
        and p.user_id is not null and not p.is_group_head
      order by g.number, p.name limit 1`,
  );
  if (!rows[0]) throw new Error("떼어낼 리더가 없다");
  await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1)`, [rows[0].id]), {
    commit: true,
  });
  return rows[0];
}
async function pendingApplicationOf(name) {
  const { rows } = await ctx.db.query(
    `select a.id from public.applications a join public.users u on u.id = a.user_id
      where u.name = $1 and a.status = 'pending'`,
    [name],
  );
  return rows[0]?.id ?? null;
}

// ===========================================================================
describe("pending — 미승인 사용자", () => {
  it("아무것도 보지 못한다(청년부 프로필은 2026-11-26 지웠다) ★", async () => {
    const seen = await asUser(ctx, "한이음", async (db) => ({
      groups: (await db.query(`select id from public.groups where status = 'active'`)).rows.length,
      groupProfiles: (await db.query(`select group_id from public.group_profiles`)).rows.length,
      personsPublic: (await db.query(`select id from public.persons_public`)).rows.length,
      persons: (await db.query(`select id from public.persons`)).rows.length,
      records: (await db.query(`select id from public.weekly_records_visible`)).rows.length,
      reports: (await db.query(`select id from public.reports`)).rows.length,
      applications: (await db.query(`select id from public.applications`)).rows.length,
      users: (await db.query(`select id from public.users`)).rows.length,
    }));
    assert.deepEqual(seen, {
      groups: 0,
      groupProfiles: 0,
      personsPublic: 0,
      persons: 0,
      records: 0,
      reports: 0,
      applications: 0,     // 한이음은 아직 신청하지 않았다
      users: 1,            // 본인 행
    });
  });

  it("자기 신청은 본다", async () => {
    const rows = await asUser(ctx, "박새벽", async (db) => {
      const r = await db.query(`select status from public.applications`);
      return r.rows;
    });
    assert.deepEqual(rows, [{ status: "pending" }]);
  });

  it("신청 목록에서 다른 사람의 신청은 보이지 않는다", async () => {
    const n = await asUser(ctx, "한이음", async (db) => {
      const r = await db.query(`select id from public.applications`);
      return r.rows.length;
    });
    assert.equal(n, 0);
  });
});

// ===========================================================================
// 청년(member) 계정 테스트는 2026-09-27 에 삭제했다 — 청년은 앱을 쓰지 않는다.
// 남은 관심사(미승인 계정의 빈 결과, 청년 person 에 계정 불가)는 leaders-only.test.mjs 가 맡는다.

// ===========================================================================
describe("첫 로그인 — ensure_user", () => {
  it("낯선 auth 계정에 pending 앱 계정을 만든다", async () => {
    const before = (await ctx.db.query(`select count(*)::int as n from public.users`)).rows[0].n;
    const authId = await createUnlinkedAuthUser(ctx, "google", "새로운사람");

    const role = await asAuthUser(
      ctx,
      authId,
      async (db) => (await db.query(`select public.ensure_user() as role`)).rows[0].role,
      { commit: true },
    );
    assert.equal(role, "pending");

    const { rows } = await ctx.db.query(
      `select name, role, provider from public.users where auth_user_id = $1`,
      [authId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "새로운사람", "이름은 제공자 메타데이터에서 가져온다");
    assert.equal(rows[0].provider, "google");
    assert.equal(
      (await ctx.db.query(`select count(*)::int as n from public.users`)).rows[0].n,
      before + 1,
    );

    // 두 번 불러도 하나다
    const again = await asAuthUser(
      ctx,
      authId,
      async (db) => (await db.query(`select public.ensure_user() as role`)).rows[0].role,
      { commit: true },
    );
    assert.equal(again, "pending");
    assert.equal(
      (await ctx.db.query(`select count(*)::int as n from public.users where auth_user_id = $1`, [authId]))
        .rows[0].n,
      1,
    );
  });


  it("비로그인은 계정을 만들 수 없다", async () => {
    const r = await asAnon(ctx, (db) => attempt(db, `select public.ensure_user()`));
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================
describe("신청", () => {
  it("신청 목록에는 명단상 리더만 나오고, 이미 연결된 사람은 점유 표시가 붙는다 ★", async () => {
    // 2026-09-27: 청년은 나오지 않는다. 연결된 리더는 지우지 않고 점유 표시 —
    // 빼면 본인이 자기 이름을 못 찾아 더 혼란스럽다(person-link.test.mjs).
    const g3 = await groupId(3);
    const rows = await asUser(ctx, "한이음", async (db) => {
      const r = await db.query(
        `select name, birth_year, group_role, claimed, claimed_provider from public.list_claimable_persons($1)`,
        [g3],
      );
      return r.rows;
    });
    assert.ok(rows.every((r) => r.group_role === "leader"), "청년 이름이 목록에 있다");
    const free = rows.filter((r) => !r.claimed).map((r) => r.name).sort();
    const taken = rows.filter((r) => r.claimed).map((r) => r.name).sort();
    assert.deepEqual(free, ["류지호"]);
    assert.deepEqual(taken, ["권다움", "김빛나", "도하린"]);
    assert.ok(rows.filter((r) => r.claimed).every((r) => r.claimed_provider !== null), "점유자의 제공자가 있어야 한다");
    assert.ok(rows.every((r) => r.birth_date !== null), "동명이인 구분용 생년월일이 있어야 한다");
  });

  it("목록은 로그인해야 볼 수 있다", async () => {
    const g3 = await groupId(3);
    const r = await asAnon(ctx, (db) =>
      attempt(db, `select * from public.list_claimable_persons($1)`, [g3]),
    );
    assert.notEqual(r.error, null);
  });

  it("pending 사용자가 신청하면 대기 건이 생긴다", async () => {
    const pid = await personId("류지호");
    const appId = await asUser(
      ctx,
      "한이음",
      async (db) => (await db.query(`select public.apply_for_person($1) as id`, [pid])).rows[0].id,
      { commit: true },
    );
    assert.ok(appId);
    const { rows } = await ctx.db.query(`select status, group_id from public.applications where id = $1`, [appId]);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].group_id, await groupId(3));
  });

  it("동시에 두 건을 걸 수 없다", async () => {
    const pid = await personId("류지호");
    const r = await asUser(ctx, "한이음", (db) =>
      attempt(db, `select public.apply_for_person($1)`, [pid]),
    );
    assert.notEqual(r.error, null, "이미 대기 중인데 두 번째 신청이 통했다");
  });

  it("이미 연결된 사람으로는 신청할 수 없다", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "kakao", "가로채기");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const pid = await personId("권다움");
    const r = await asAuthUser(ctx, authId, (db) =>
      attempt(db, `select public.apply_for_person($1)`, [pid]),
    );
    assert.notEqual(r.error, null);
  });

  it("승인된 사용자는 신청할 수 없다", async () => {
    const pid = await personId("류지호");
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.apply_for_person($1)`, [pid]),
    );
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================
describe("승인 — 운영자만", () => {
  it("목장 리더는 승인하지 못한다 — 같은 목장이어도 ★", async () => {
    const appId = await pendingApplicationOf("박새벽"); // 3목장 류지호 신청
    for (const who of ["김빛나", "노해찬"]) {
      const r = await asUser(ctx, who, (db) =>
        attempt(db, `select public.approve_application($1)`, [appId]),
      );
      assert.notEqual(r.error, null, `${who} 가 승인했다`);
      assert.equal(r.code, "42501", who);
    }
    assert.equal(await userRole("박새벽"), "pending");
  });

  it("운영자가 승인하면 leader 가 되고 명단과 연결된다 ★", async () => {
    const appId = await pendingApplicationOf("박새벽");
    const r = await asUser(
      ctx,
      "정다슬",
      (db) => attempt(db, `select public.approve_application($1)`, [appId]),
      { commit: true },
    );
    assert.equal(r.error, null, `승인이 실패했다: ${r.error}`);

    assert.equal(await userRole("박새벽"), "leader");
    const { rows } = await ctx.db.query(
      `select p.name from public.persons p join public.users u on u.id = p.user_id where u.name = '박새벽'`,
    );
    assert.deepEqual(rows, [{ name: "류지호" }]);
    const { rows: app } = await ctx.db.query(
      `select status, decided_at is not null as decided from public.applications where id = $1`,
      [appId],
    );
    assert.deepEqual(app[0], { status: "approved", decided: true });
  });

  it("승인된 리더는 자기 목장의 범위를 본다", async () => {
    const seen = await asUser(ctx, "박새벽", async (db) => ({
      groups: (await db.query(`select id from public.groups where status = 'active'`)).rows.length,
      personsPublic: (await db.query(`select id from public.persons_public`)).rows.length,
      records: (await db.query(`select id from public.weekly_records_visible`)).rows.length,
    }));
    assert.deepEqual(seen, { groups: 12, personsPublic: 80, records: 28 });
  });

  it("같은 신청을 두 번 승인할 수 없다", async () => {
    const { rows } = await ctx.db.query(
      `select a.id from public.applications a join public.users u on u.id = a.user_id
        where u.name = '박새벽' and a.status = 'approved'`,
    );
    const r = await asUser(ctx, "정다슬", (db) =>
      attempt(db, `select public.approve_application($1)`, [rows[0].id]),
    );
    assert.notEqual(r.error, null);
  });

  it("목사님은 승인하지 않는다 — 쓰지 않을 권한은 주지 않는다", async () => {
    const target = await freeLeader();
    const authId = await createUnlinkedAuthUser(ctx, "google", "목사님앞");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const appId = await asAuthUser(
      ctx,
      authId,
      async (db) => (await db.query(`select public.apply_for_person($1) as id`, [target.id])).rows[0].id,
      { commit: true },
    );
    const r = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.approve_application($1)`, [appId]));
    assert.notEqual(r.error, null);
    assert.equal(r.code, "42501");
    // 정리: 운영자가 거절
    await asUser(ctx, "정다슬", (db) => db.query(`select public.reject_application($1)`, [appId]), { commit: true });
  });

  it("거절도 운영자만 — 거절되면 pending 으로 남고 다시 신청할 수 있다", async () => {
    const target = await freeLeader();
    const authId = await createUnlinkedAuthUser(ctx, "google", "거절될사람");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const appId = await asAuthUser(
      ctx,
      authId,
      async (db) => (await db.query(`select public.apply_for_person($1) as id`, [target.id])).rows[0].id,
      { commit: true },
    );

    const wrong = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.reject_application($1)`, [appId]),
    );
    assert.notEqual(wrong.error, null, "목장 리더가 거절했다");
    assert.equal(wrong.code, "42501");

    const ok = await asUser(
      ctx,
      "정다슬",
      (db) => attempt(db, `select public.reject_application($1)`, [appId]),
      { commit: true },
    );
    assert.equal(ok.error, null, ok.error);

    const { rows } = await ctx.db.query(`select status from public.applications where id = $1`, [appId]);
    assert.equal(rows[0].status, "rejected");
    const { rows: u } = await ctx.db.query(`select role from public.users where auth_user_id = $1`, [authId]);
    assert.equal(u[0].role, "pending");

    const again = await asAuthUser(ctx, authId, (db) =>
      attempt(db, `select public.apply_for_person($1)`, [target.id]),
    );
    assert.equal(again.error, null, "거절 후 재신청이 막혔다");
  });

  it("같은 사람을 노린 두 신청 중 하나를 승인하면 나머지는 닫힌다", async () => {
    const target = await freeLeader();
    const a = await createUnlinkedAuthUser(ctx, "google", "경쟁자A");
    const b = await createUnlinkedAuthUser(ctx, "google", "경쟁자B");
    for (const id of [a, b]) {
      await asAuthUser(ctx, id, (db) => db.query(`select public.ensure_user()`), { commit: true });
    }
    const appA = await asAuthUser(ctx, a, async (db) =>
      (await db.query(`select public.apply_for_person($1) as id`, [target.id])).rows[0].id, { commit: true });
    const appB = await asAuthUser(ctx, b, async (db) =>
      (await db.query(`select public.apply_for_person($1) as id`, [target.id])).rows[0].id, { commit: true });

    await asUser(ctx, "정다슬", (db) => db.query(`select public.approve_application($1)`, [appA]), { commit: true });

    const { rows } = await ctx.db.query(
      `select id, status from public.applications where id in ($1, $2) order by status`,
      [appA, appB],
    );
    assert.deepEqual(rows.map((r) => r.status).sort(), ["approved", "rejected"]);
    const late = await asUser(ctx, "정다슬", (db) =>
      attempt(db, `select public.approve_application($1)`, [appB]),
    );
    assert.notEqual(late.error, null, "이미 연결된 사람을 두 번째 계정에 또 연결했다");
  });
});

// ===========================================================================
// set_user_role 은 2026-09-27 에 삭제했다 — 리더는 승인으로만 생기고, 내리는 건 unlink 다
// (leaders-only.test.mjs · person-link.test.mjs).

// ===========================================================================
describe("본인 정보 조회 (current_user_context)", () => {
  it("리더는 역할·소속·목장 내 역할을 받는다", async () => {
    const me = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select * from public.current_user_context()`)).rows[0]);
    assert.equal(me.role, "leader");
    assert.equal(me.group_number, 3);
    assert.equal(me.group_role, "leader");
    assert.equal(me.is_group_head, true);
  });

  it("미승인 사용자는 소속이 비고 신청 상태가 함께 온다", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "google", "상태확인");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const me = await asAuthUser(ctx, authId, async (db) =>
      (await db.query(`select * from public.current_user_context()`)).rows[0]);
    assert.equal(me.role, "pending");
    assert.equal(me.group_id, null);
    assert.equal(me.application_status, null);
  });

  it("목사님과 운영자는 소속 목장이 없다", async () => {
    for (const [who, role] of [["임찬양", "pastor"], ["정다슬", "admin"]]) {
      const me = await asUser(ctx, who, async (db) =>
        (await db.query(`select * from public.current_user_context()`)).rows[0]);
      assert.equal(me.role, role);
      assert.equal(me.group_id, null);
    }
  });
});

// ===========================================================================
describe("신청·승인 화면용 보조 함수", () => {
  it("pending 사용자도 목장 번호·이름은 받는다 (테이블은 여전히 못 읽는다)", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "google", "목장고르기");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const seen = await asAuthUser(ctx, authId, async (db) => ({
      viaRpc: (await db.query(`select number, name from public.list_application_groups()`)).rows.length,
      viaTable: (await db.query(`select id from public.groups`)).rows.length,
    }));
    assert.deepEqual(seen, { viaRpc: 12, viaTable: 0 });
  });

  it("비로그인은 목장 목록도 받지 못한다", async () => {
    const r = await asAnon(ctx, (db) => attempt(db, `select * from public.list_application_groups()`));
    assert.notEqual(r.error, null);
  });

  it("대기 목록은 운영자만 받는다 — 리더·목사님에게는 빈 결과", async () => {
    const target = await freeLeader();
    const authId = await createUnlinkedAuthUser(ctx, "google", "대기자");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    await asAuthUser(ctx, authId, (db) => db.query(`select public.apply_for_person($1)`, [target.id]), { commit: true });

    const forAdmin = await asUser(ctx, "정다슬", async (db) =>
      (await db.query(`select applicant_name, person_name from public.list_pending_applications()`)).rows);
    assert.ok(forAdmin.some((r) => r.applicant_name === "대기자" && r.person_name === target.name));

    for (const who of ["반석호", "권다움", "임찬양"]) {
      const n = await asUser(ctx, who, async (db) =>
        (await db.query(`select id from public.list_pending_applications()`)).rows.length);
      assert.equal(n, 0, `${who} 에게 대기 목록이 보인다`);
    }
  });

  it("대기 중인 신청의 대상 이름이 본인 정보에 함께 온다", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "google", "대기표시");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const target = await freeLeader();
    await asAuthUser(ctx, authId, (db) => db.query(`select public.apply_for_person($1)`, [target.id]), { commit: true });
    const me = await asAuthUser(ctx, authId, async (db) =>
      (await db.query(`select * from public.current_user_context()`)).rows[0]);
    assert.equal(me.application_status, "pending");
    assert.equal(me.pending_person_name, target.name);
    assert.equal(me.pending_group_number, target.group_number);
  });
});
