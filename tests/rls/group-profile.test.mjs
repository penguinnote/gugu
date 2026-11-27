/**
 * L-5a/L-5b 목장 프로필 — 화면이 쓰는 경로의 범위와 DB 가 막아주는 것 (Step 8, 2026-10-05)
 *
 * 읽기·쓰기 정책 자체는 rls.test.mjs 가 이미 고정한다(전원 읽기 · 자기 목장만 수정). 여기는 Step 8 화면이
 * 실제로 타는 경로를 본다.
 *   · 프로덕션에는 프로필 행이 0개다 — 첫 편집이 **insert** 다. 행이 없는 자기 목장에 리더가 넣을 수 있어야 한다 ★
 *   · 다른 목장에는 insert 도 못 한다
 *   · 목사님·운영자는 남의 프로필을 고치고 지운다 — 02 §4 '내리기 권한'
 *   · 멤버 목록의 출처는 persons_public — 리더가 다른 목장 사람의 이름까지 읽는다(이름·성별·역할뿐)
 *   · pending 은 0행
 *
 * 그리고 이번에 DB 에 넣는 보호 둘 (마이그레이션 group_profile_guards):
 *   · updated_by 는 클라이언트가 보낸 값이 아니라 **세션 사용자**다 — 트리거가 덮어쓴다
 *   · 길이·개수·원소 꼴 — 소개 100자 · 자유 글 1000자 · 디데이 10개 {title,date} · 찬양 5개 {title,url(http)}
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3, g7;
let uid = {};

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  for (const name of ["권다움", "노해찬", "임찬양", "정다슬"]) {
    uid[name] = (await db.query(`select id from public.users where name = $1`, [name])).rows[0].id;
  }
});

after(async () => {
  await ctx?.db?.close?.();
});

const profileOf = (db, g) =>
  db.query(`select group_id, intro, free_text, ddays, theme_songs, updated_by from public.group_profiles where group_id = $1`, [g]);

describe("프로필 쓰기 경로", () => {
  it("행이 없는 자기 목장에 리더가 insert 한다 ★ (프로덕션의 첫 편집)", async () => {
    // 시드는 12행을 다 만들어 두므로 3목장 것을 먼저 비운다 — 프로덕션 상태(0행)와 같게.
    await asService(ctx, async (db) => db.query(`delete from public.group_profiles where group_id = $1`, [g3]), { commit: true });

    const r = await asUser(
      ctx,
      "권다움",
      async (db) =>
        attempt(
          db,
          `insert into public.group_profiles (group_id, intro, ddays, theme_songs)
           values ($1, '세 번째 목장입니다', '[{"title":"목장 MT","date":"2026-11-07"}]', '[{"title":"주 안에","url":"https://example.invalid/x"}]')
           returning group_id, updated_by`,
          [g3],
        ),
      { commit: true },
    );
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].updated_by, uid["권다움"], "updated_by 는 넣은 사람");
  });

  it("다른 목장에는 insert 못 한다", async () => {
    await asService(ctx, async (db) => db.query(`delete from public.group_profiles where group_id = $1`, [g7]), { commit: true });
    const r = await asUser(ctx, "권다움", async (db) =>
      attempt(db, `insert into public.group_profiles (group_id, intro) values ($1, '침입') returning group_id`, [g7]),
    );
    assert.equal(r.code, "42501", "RLS 가 막는다");
    const n = await asService(ctx, async (db) => (await profileOf(db, g7)).rows.length);
    assert.equal(n, 0);
    // 7목장 리더가 자기 것을 다시 만든다 — 아래 테스트가 쓴다
    const mine = await asUser(
      ctx,
      "노해찬",
      async (db) =>
        attempt(db, `insert into public.group_profiles (group_id, free_text) values ($1, '질문 많이 해주세요.') returning group_id`, [g7]),
      { commit: true },
    );
    assert.equal(mine.error, null, mine.error ?? "");
  });

  it("목사님은 남의 프로필을 고치고(내리기) 운영자는 지운다", async () => {
    const byPastor = await asUser(ctx, "임찬양", async (db) =>
      attempt(db, `update public.group_profiles set free_text = null where group_id = $1 returning group_id, free_text`, [g7]),
    );
    assert.equal(byPastor.error, null, byPastor.error ?? "");
    assert.equal(byPastor.rows.length, 1);
    assert.equal(byPastor.rows[0].free_text, null);

    const byAdmin = await asUser(ctx, "정다슬", async (db) =>
      attempt(db, `delete from public.group_profiles where group_id = $1 returning group_id`, [g7]),
    );
    assert.equal(byAdmin.error, null, byAdmin.error ?? "");
    assert.equal(byAdmin.rows.length, 1);

    // 운영자는 고치지 못한다(2026-11-26) — 0행, 새로 넣기도 막힌다
    const adminUpdate = await asUser(ctx, "정다슬", async (db) =>
      attempt(db, `update public.group_profiles set free_text = '운영자' where group_id = $1 returning group_id`, [g3]),
    );
    assert.equal(adminUpdate.error, null);
    assert.equal(adminUpdate.rows.length, 0);
    const adminInsert = await asUser(ctx, "정다슬", async (db) =>
      attempt(db, `insert into public.group_profiles (group_id, intro) values ($1, '운영자') returning group_id`, [g7]),
    );
    assert.equal(adminInsert.code, "42501", adminInsert.error ?? "운영자가 목장 프로필을 넣었다");

    // 리더는 지우지 못한다 — 0행
    const byLeader = await asUser(ctx, "권다움", async (db) =>
      attempt(db, `delete from public.group_profiles where group_id = $1 returning group_id`, [g3]),
    );
    assert.equal(byLeader.error, null);
    assert.equal(byLeader.rows.length, 0);
  });

  it("멤버 목록 — 리더가 persons_public 로 다른 목장 사람의 이름을 읽는다 (이름·성별·역할뿐)", async () => {
    const expected = await asService(ctx, async (db) =>
      Number((await db.query(`select count(*)::int as n from public.persons where group_id = $1 and status <> 'left'`, [g7])).rows[0].n),
    );
    const rows = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select name, group_role, is_group_head from public.persons_public where group_id = $1`, [g7])).rows,
    );
    assert.ok(expected > 0);
    assert.equal(rows.length, expected);
    assert.ok(rows.some((r) => r.is_group_head), "목장장이 표시된다");
  });

  it("pending 은 프로필도 명단도 0행", async () => {
    const r = await asUser(ctx, "박새벽", async (db) => ({
      profiles: (await db.query(`select group_id from public.group_profiles`)).rows.length,
      persons: (await db.query(`select id from public.persons_public`)).rows.length,
    }));
    assert.deepEqual(r, { profiles: 0, persons: 0 });
  });
});

describe("DB 가 막는 것 (group_profile_guards)", () => {
  it("updated_by 는 클라이언트 값이 아니라 세션 사용자다 ★", async () => {
    const r = await asUser(ctx, "권다움", async (db) =>
      attempt(
        db,
        `update public.group_profiles set intro = '고침', updated_by = $2 where group_id = $1 returning updated_by`,
        [g3, uid["임찬양"]],
      ),
    );
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows[0].updated_by, uid["권다움"], "남의 id 를 보내도 세션 사용자로 덮인다");
  });

  const rejects = [
    ["소개 101자", `update public.group_profiles set intro = repeat('가', 101) where group_id = $1`],
    ["자유 글 1001자", `update public.group_profiles set free_text = repeat('가', 1001) where group_id = $1`],
    ["디데이 11개", `update public.group_profiles set ddays = (select jsonb_agg(jsonb_build_object('title','t','date','2026-12-01')) from generate_series(1, 11)) where group_id = $1`],
    ["디데이 날짜 없음", `update public.group_profiles set ddays = '[{"title":"MT"}]' where group_id = $1`],
    ["디데이 날짜 꼴 아님", `update public.group_profiles set ddays = '[{"title":"MT","date":"11월 7일"}]' where group_id = $1`],
    ["디데이 제목 빈칸", `update public.group_profiles set ddays = '[{"title":"  ","date":"2026-11-07"}]' where group_id = $1`],
    ["찬양 6개", `update public.group_profiles set theme_songs = (select jsonb_agg(jsonb_build_object('title','t','url','https://example.invalid/')) from generate_series(1, 6)) where group_id = $1`],
    ["찬양 링크가 http 가 아님", `update public.group_profiles set theme_songs = '[{"title":"x","url":"javascript:alert(1)"}]' where group_id = $1`],
    ["찬양 원소가 객체가 아님", `update public.group_profiles set theme_songs = '["x"]' where group_id = $1`],
  ];
  for (const [label, sql] of rejects) {
    it(`거부 — ${label}`, async () => {
      const r = await asUser(ctx, "권다움", async (db) => attempt(db, sql, [g3]));
      assert.ok(r.error, `${label} 이 들어갔다`);
      assert.equal(r.code, "23514", `check 제약이어야 한다: ${r.error}`);
    });
  }

  it("허용 — 경계값 (소개 100자 · 디데이 10개 · 찬양 5개)", async () => {
    const r = await asUser(ctx, "권다움", async (db) =>
      attempt(
        db,
        `update public.group_profiles
            set intro = repeat('가', 100),
                free_text = repeat('나', 1000),
                ddays = (select jsonb_agg(jsonb_build_object('title','t','date','2026-12-01')) from generate_series(1, 10)),
                theme_songs = (select jsonb_agg(jsonb_build_object('title','t','url','http://example.invalid/')) from generate_series(1, 5))
          where group_id = $1 returning group_id`,
        [g3],
      ),
    );
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows.length, 1);
  });

});
