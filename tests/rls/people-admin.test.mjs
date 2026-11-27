/**
 * Step 9b 명단 관리(A-1) — 운영자 화면이 쓰는 쓰기 경로와 DB 가 막는 것 (2026-10-06)
 *
 * 화면은 있는 사람을 고친다: 소속 이동 · 리더↔청년 · 목장장 · 상태(활동/휴면/기록 제외/이탈) · 판정 태그 ·
 * 확인 필요 끄기 · 계정 연결 보기·해제. 등록은 Step 11.
 *
 *   · 이동·역할·목장장·상태      기존 컬럼 권한 + persons_update 정책(운영자)
 *   · 판정 태그 care_status      이번에 컬럼 권한을 연다. 처음엔 운영자만, 2026-11-17 부터 그 목장 리더 · 목사님도(트리거)
 *   · 확인 필요 needs_check      이번에 컬럼 권한을 연다. 리더도 내린다(04 v0.12 "리더가 내린다")
 *   · 목장장은 목장당 한 명       부분 유일 인덱스 — 둘이 되면 23505
 *   · 계정 붙은 리더 → 청년       23514 (기존 트리거) — 화면은 "먼저 연결을 해제하세요"
 *   · 기록 제외                   set_person_recording 으로만 (기존)
 *   · 연결 계정 보기             운영자는 users 의 이름·제공자를 읽는다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3, g7, member3, leaderLinked3, leaderFree3;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  member3 = (await db.query(`select id from public.persons where name = '서다온'`)).rows[0].id; // 3목장 청년
  leaderLinked3 = (await db.query(`select id from public.persons where name = '권다움'`)).rows[0].id; // 3목장 목장장, 계정 있음
  leaderFree3 = (await db.query(`select id from public.persons where name = '류지호'`)).rows[0].id; // 3목장 리더, 계정 없음
});

after(async () => {
  await ctx?.db?.close?.();
});

const upd = (who, sql, params) => asUser(ctx, who, (db) => attempt(db, sql, params));

describe("운영자의 명단 수정 — 기존 권한으로 성립하는 것", () => {
  it("소속 이동 · 역할 올리기 · 상태 휴면", async () => {
    const move = await upd("정다슬", `update public.persons set group_id = $2 where id = $1 returning group_id`, [member3, g7]);
    assert.equal(move.error, null, move.error ?? "");
    assert.equal(move.rows[0].group_id, g7);

    const promote = await upd("정다슬", `update public.persons set group_role = 'leader' where id = $1 returning group_role`, [member3]);
    assert.equal(promote.error, null, promote.error ?? "");

    const dormant = await upd("정다슬", `update public.persons set status = 'dormant' where id = $1 returning status`, [member3]);
    assert.equal(dormant.error, null, dormant.error ?? "");
  });

  it("계정 붙은 리더를 청년으로 내리면 23514 — 먼저 연결을 해제해야 한다", async () => {
    const r = await upd("정다슬", `update public.persons set group_role = 'member' where id = $1 returning id`, [leaderLinked3]);
    assert.equal(r.code, "23514", r.error ?? "통과해버렸다");
  });

  it("청년을 목장장으로 지정하면 23514 (목장장은 리더)", async () => {
    const r = await upd("정다슬", `update public.persons set is_group_head = true where id = $1 returning id`, [member3]);
    assert.equal(r.code, "23514", r.error ?? "통과해버렸다");
  });

  it("연결 계정 보기 — 운영자는 users 의 이름·제공자를 읽는다", async () => {
    const rows = await asUser(ctx, "정다슬", async (db) =>
      (await db.query(`select u.name, u.provider, u.role from public.persons p join public.users u on u.id = p.user_id where p.id = $1`, [leaderLinked3])).rows,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, "leader");
    assert.ok(rows[0].provider);
  });
});

describe("DB 가 막는 것 (people_admin)", () => {
  it("판정 태그 — 운영자는 바꾼다 ★", async () => {
    const r = await upd("정다슬", `update public.persons set care_status = 'military' where id = $1 returning care_status`, [member3]);
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows[0].care_status, "military");
  });

  it("판정 태그 — 그 목장 리더 · 목사님도 바꾸고(2026-11-17), 다른 목장 리더는 못 바꾼다", async () => {
    for (const who of ["권다움", "임찬양"]) {
      const r = await upd(who, `update public.persons set care_status = 'remote' where id = $1 returning id`, [member3]);
      assert.equal(r.error, null, `${who}: ${r.error}`);
      assert.equal(r.rows.length, 1, who);
    }
    const other = await upd("노해찬", `update public.persons set care_status = 'remote' where id = $1 returning id`, [member3]);
    assert.ok(other.error || other.rows.length === 0, "다른 목장 리더가 바꿨다");
  });

  it("확인 필요 끄기 — 운영자도, 자기 목장 리더도 내린다 ★", async () => {
    await asService(ctx, (db) => db.query(`update public.persons set needs_check = true where id = $1`, [member3]), { commit: true });
    const admin = await upd("정다슬", `update public.persons set needs_check = false where id = $1 returning needs_check`, [member3]);
    assert.equal(admin.error, null, admin.error ?? "");
    assert.equal(admin.rows[0].needs_check, false);

    const leader = await upd("권다움", `update public.persons set needs_check = false where id = $1 returning needs_check`, [member3]);
    assert.equal(leader.error, null, leader.error ?? "");
    const other = await upd("노해찬", `update public.persons set needs_check = false where id = $1 returning needs_check`, [member3]);
    assert.equal(other.error, null);
    assert.equal(other.rows.length, 0, "다른 목장 리더는 0행");
  });

  it("목장장은 목장당 한 명 ★ — 둘째를 지정하면 23505", async () => {
    // 3목장 목장장은 시드의 권다움. 류지호를 추가로 지정하면 막힌다
    const second = await upd("정다슬", `update public.persons set is_group_head = true where id = $1 returning id`, [leaderFree3]);
    assert.equal(second.code, "23505", second.error ?? "둘째 목장장이 들어갔다");
    // 먼저 내리고 올리면 된다 — 화면의 '목장장으로 지정' 이 이 순서로 한다
    const swap = await asUser(ctx, "정다슬", async (db) => {
      await db.query(`update public.persons set is_group_head = false where group_id = $1 and is_group_head`, [g3]);
      return attempt(db, `update public.persons set is_group_head = true where id = $1 returning id`, [leaderFree3]);
    });
    assert.equal(swap.error, null, swap.error ?? "");
  });

  it("기록 제외는 함수로만 — 활동 ↔ 기록 제외", async () => {
    const off = await asUser(ctx, "정다슬", async (db) => {
      await db.query(`update public.persons set status = 'active' where id = $1`, [member3]);
      await db.query(`select public.set_person_recording($1, false)`, [member3]);
      return (await db.query(`select status from public.persons where id = $1`, [member3])).rows[0].status;
    });
    assert.equal(off, "opted_out");
  });
});
