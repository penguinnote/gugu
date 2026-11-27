/**
 * Step 11 새 사람 등록 — 운영자 화면이 쓰는 insert 와 DB 가 지키는 이름 규칙 (2026-10-06)
 *
 *   · 등록은 운영자, 그리고 자기 목장에 양을 넣는 리더(2026-10-28)와 어느 목장이든 목사님(2026-10-29) — 둘은 활동 · 양 · 계정 없음으로만
 *   · 같은 목장 안에 같은 이름은 하나 — 이탈한 사람은 빼고 센다. 명단 도입 때의 규칙을 DB 가 이어받는다
 *     (persons_unique_name_in_group). 다른 목장의 같은 이름은 허용. 9b 의 목장 이동도 같은 규칙에 걸린다
 *   · 이름은 앞뒤 공백 없이 1~20자 (persons_name_ck)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3, g7;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const insert = (who, group, name, opts) =>
  asUser(
    ctx,
    who,
    (db) =>
      attempt(
        db,
        `insert into public.persons (group_id, name, gender, group_role, joined_at, birth_year)
         values ($1, $2, 'male', 'member', (now() at time zone 'Asia/Seoul')::date, 2003) returning id, status, care_status, is_group_head`,
        [group, name],
      ),
    opts,
  );

describe("누가 등록하나", () => {
  it("운영자는 등록한다 — 기본값은 활동·재적·목장장 아님 ★", async () => {
    const r = await insert("정다슬", g3, "새사람");
    assert.equal(r.error, null, r.error ?? "");
    assert.deepEqual({ status: r.rows[0].status, care: r.rows[0].care_status, head: r.rows[0].is_group_head }, { status: "active", care: "active", head: false });
  });

  it("목장 리더는 자기 목장에 양을 등록한다 — 활동 · 목장장 아님 (2026-10-28)", async () => {
    const r = await insert("권다움", g3, "새사람");
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows[0].status, "active");
  });

  it("리더는 다른 목장에는 등록하지 못한다 (42501)", async () => {
    const r = await insert("권다움", g7, "새사람");
    assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
  });

  it("리더는 리더 · 다른 상태로는 등록하지 못한다 (42501)", async () => {
    for (const [role, status] of [["leader", "active"], ["member", "dormant"]]) {
      const r = await asUser(ctx, "권다움", (db) =>
        attempt(
          db,
          `insert into public.persons (group_id, name, gender, group_role, joined_at, status) values ($1, '새사람', 'male', $2, current_date, $3)`,
          [g3, role, status],
        ),
      );
      assert.equal(r.code, "42501", r.error ?? `${role}/${status} 가 들어갔다`);
    }
  });

  it("목사님은 어느 목장에든 양을 넣는다 (2026-10-29)", async () => {
    for (const g of [g3, g7]) {
      const r = await asUser(ctx, "임찬양", (db) =>
        attempt(db, `insert into public.persons (group_id, name, gender, group_role, joined_at, status) values ($1, '목사님추가', 'female', 'member', current_date, 'active') returning id`, [g]),
      );
      assert.equal(r.error, null, r.error ?? "");
    }
  });

  it("목사님도 다른 상태 · 목장 없이는 넣지 못한다 (42501) — 리더로 넣기는 2026-11-26 부터 된다(leader-add.test)", async () => {
    for (const [g, role, status] of [[g3, "member", "dormant"], [null, "member", "active"], [null, "leader", "active"]]) {
      const r = await asUser(ctx, "임찬양", (db) =>
        attempt(db, `insert into public.persons (group_id, name, gender, group_role, joined_at, status) values ($1, '목사님추가2', 'male', $2, current_date, $3)`, [g, role, status]),
      );
      assert.equal(r.code, "42501", r.error ?? `${role}/${status} 가 들어갔다`);
    }
  });
});

describe("같은 목장 같은 이름은 하나", () => {
  it("같은 목장에 있는 이름으로 등록하면 23505 ★", async () => {
    const r = await insert("정다슬", g3, "서다온");
    assert.equal(r.code, "23505", r.error ?? "동명이인이 들어갔다");
    assert.match(r.error, /persons_unique_name_in_group/);
  });

  it("다른 목장이면 같은 이름도 된다", async () => {
    const r = await insert("정다슬", g7, "서다온");
    assert.equal(r.error, null, r.error ?? "");
  });

  it("이탈한 사람과 같은 이름으로는 다시 등록할 수 있다", async () => {
    const r = await asService(ctx, async (db) => {
      const sid = (await db.query(`select id from public.persons where name = '서다온' and group_id = $1`, [g3])).rows[0].id;
      await db.query(`update public.persons set status = 'left' where id = $1`, [sid]);
      return attempt(
        db,
        `insert into public.persons (group_id, name, gender, group_role, joined_at) values ($1, '서다온', 'female', 'member', current_date) returning id`,
        [g3],
      );
    });
    assert.equal(r.error, null, r.error ?? "");
  });

  it("같은 이름이 있는 목장으로 옮기면 23505 (9b 이동도 같은 규칙) ★", async () => {
    const r = await asUser(ctx, "정다슬", async (db) => {
      const a = (await db.query(
        `insert into public.persons (group_id, name, gender, group_role, joined_at) values ($1, '같은이름', 'male', 'member', current_date) returning id`,
        [g3],
      )).rows[0].id;
      await db.query(`insert into public.persons (group_id, name, gender, group_role, joined_at) values ($1, '같은이름', 'female', 'member', current_date)`, [g7]);
      return attempt(db, `update public.persons set group_id = $2 where id = $1 returning id`, [a, g7]);
    });
    assert.equal(r.code, "23505", r.error ?? "이동이 통과했다");
    assert.match(r.error, /persons_unique_name_in_group/);
  });
});

describe("이름 꼴 (persons_name_ck)", () => {
  for (const [label, name] of [
    ["빈 이름", "   "],
    ["앞뒤 공백", " 새사람 "],
    ["21자", "가".repeat(21)],
  ]) {
    it(`거부 — ${label} (23514)`, async () => {
      const r = await insert("정다슬", g3, name);
      assert.equal(r.code, "23514", r.error ?? "통과해버렸다");
    });
  }

  it("허용 — 20자", async () => {
    const r = await insert("정다슬", g3, "나".repeat(20));
    assert.equal(r.error, null, r.error ?? "");
  });
});
