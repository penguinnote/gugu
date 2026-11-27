/**
 * 명단의 나머지 칸 · 섬김 부서 · 명단 엑셀 로그 (2026-10-28)
 *
 *   · 리더는 자기 목장 사람의 모든 칸(훈련단계 · 출생년도 · 직업 · 소속 · 회원 둘 · 비고)을 고친다 — 다른 목장은 못 본다(0행)
 *   · 마을은 set_group_village — 그 목장 리더 · 목사님 · 운영자
 *   · 섬김 부서(person_ministries)는 여럿 — 넣기 · 빼기는 그 사람 목장 리더 · 목사님 · 운영자, 읽기는 그 사람을 볼 수 있는 사람
 *   · 명단 엑셀 로그 log_roster_export — 전체 명단은 목사님 · 운영자만, 목장 명단은 그 목장 리더도
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx, g3, g7, own, other, ministry;
const LEADER = "권다움"; // 3목장 리더
const PASTOR = "임찬양";
const ADMIN = "정다슬";

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
  own = (await ctx.db.query(`select id from public.persons where group_id = $1 and group_role = 'member' order by name limit 1`, [g3])).rows[0].id;
  other = (await ctx.db.query(`select id from public.persons where group_id = $1 and group_role = 'member' order by name limit 1`, [g7])).rows[0].id;
  ministry = (await ctx.db.query(`select id from public.ministries order by sort limit 1`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const details = (db, id) =>
  attempt(
    db,
    `update public.persons set training_stage = '제자반', birth_year = 2001, occupation = '대학생', affiliation = '한빛대',
            youth_member = true, assembly_member = true, note = '새벽 예배 섬김'
      where id = $1 returning occupation, youth_member`,
    [id],
  );

describe("사람의 나머지 칸", () => {
  it("리더는 자기 목장 사람의 모든 칸을 고친다 ★", async () => {
    const r = await asUser(ctx, LEADER, (db) => details(db, own));
    assert.equal(r.error, null, r.error ?? "");
    assert.deepEqual(r.rows, [{ occupation: "대학생", youth_member: true }]);
  });

  it("다른 목장 사람은 고치지 못한다 — 0행", async () => {
    const r = await asUser(ctx, LEADER, (db) => details(db, other));
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows.length, 0);
  });

  it("목사님 · 운영자는 누구든 고친다", async () => {
    for (const who of [PASTOR, ADMIN]) {
      const r = await asUser(ctx, who, (db) => details(db, other));
      assert.equal(r.rows?.length, 1, `${who}: ${r.error ?? "0행"}`);
    }
  });

  it("앞뒤 공백 · 너무 긴 값은 거부 (23514)", async () => {
    for (const [col, v] of [["occupation", " 대학생"], ["affiliation", "가".repeat(41)], ["note", ""], ["training_stage", "양 "]]) {
      const r = await asUser(ctx, LEADER, (db) => attempt(db, `update public.persons set ${col} = $2 where id = $1`, [own, v]));
      assert.equal(r.code, "23514", `${col}: ${r.error ?? "통과"}`);
    }
  });
});

describe("마을", () => {
  const set = (who, group, v) => asUser(ctx, who, (db) => attempt(db, `select public.set_group_village($1, $2)`, [group, v]));

  it("자기 목장 리더가 바꾼다 — 빈 값은 비움", async () => {
    const after = (v) =>
      asUser(ctx, LEADER, async (db) => {
        await db.query(`select public.set_group_village($1, $2)`, [g3, v]);
        return (await db.query(`select village from public.groups where id = $1`, [g3])).rows[0].village;
      });
    assert.equal(await after(" 믿음 "), "믿음");
    assert.equal(await after(""), null);
  });

  it("다른 목장은 못 바꾼다 (42501) · 목사님 · 운영자는 된다", async () => {
    assert.equal((await set(LEADER, g7, "믿음")).code, "42501");
    assert.equal((await set(PASTOR, g7, "믿음")).error, null);
    assert.equal((await set(ADMIN, g7, "믿음")).error, null);
  });

  it("21자는 거부 (22023)", async () => {
    assert.equal((await set(LEADER, g3, "가".repeat(21))).code, "22023");
  });
});

describe("섬김 부서", () => {
  it("부서 목록 13곳이 엑셀 순서로 있다", async () => {
    const r = await asUser(ctx, LEADER, (db) => db.query(`select name from public.ministries order by sort`));
    assert.equal(r.rows.length, 13);
    assert.deepEqual([r.rows[0].name, r.rows[12].name], ["찬양팀", "새가족 안내"]);
  });

  it("리더는 자기 목장 사람에게 여러 부서를 넣고 뺀다 ★", async () => {
    const r = await asUser(ctx, LEADER, async (db) => {
      const ids = (await db.query(`select id from public.ministries order by sort limit 3`)).rows.map((x) => x.id);
      for (const m of ids) await db.query(`insert into public.person_ministries (person_id, ministry_id) values ($1, $2)`, [own, m]);
      const n = (await db.query(`select count(*)::int as n from public.person_ministries where person_id = $1`, [own])).rows[0].n;
      const del = await db.query(`delete from public.person_ministries where person_id = $1 and ministry_id = $2`, [own, ids[0]]);
      return { n, deleted: del.affectedRows };
    });
    assert.deepEqual(r, { n: 3, deleted: 1 });
  });

  it("다른 목장 사람에게는 넣지 못한다 (42501)", async () => {
    const r = await asUser(ctx, LEADER, (db) => attempt(db, `insert into public.person_ministries (person_id, ministry_id) values ($1, $2)`, [other, ministry]));
    assert.equal(r.code, "42501", r.error ?? "들어갔다");
  });

  it("읽기 — 리더는 자기 목장 사람 것만, 목사님은 전부", async () => {
    const r = await asUser(ctx, PASTOR, async (db) => {
      await db.query(`insert into public.person_ministries (person_id, ministry_id) values ($1, $3), ($2, $3)`, [own, other, ministry]);
      const pastorSees = (await db.query(`select count(*)::int as n from public.person_ministries`)).rows[0].n;
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ctx.authIdByName[LEADER], role: "authenticated" })]);
      const leaderSees = (await db.query(`select person_id from public.person_ministries`)).rows.map((x) => x.person_id);
      const leaderDeletesOther = (await db.query(`delete from public.person_ministries where person_id = $1`, [other])).affectedRows;
      return { pastorSees, leaderSees, leaderDeletesOther };
    });
    assert.equal(r.pastorSees, 2);
    assert.deepEqual(r.leaderSees, [own]);
    assert.equal(r.leaderDeletesOther, 0);
  });

  it("같은 부서를 두 번 넣으면 23505", async () => {
    const r = await asUser(ctx, LEADER, async (db) => {
      await db.query(`insert into public.person_ministries (person_id, ministry_id) values ($1, $2)`, [own, ministry]);
      return attempt(db, `insert into public.person_ministries (person_id, ministry_id) values ($1, $2)`, [own, ministry]);
    });
    assert.equal(r.code, "23505");
  });
});

describe("명단 엑셀 로그", () => {
  it("목사님 · 운영자는 로그를 남긴다 — format roster, 범위 없음", async () => {
    for (const who of [PASTOR, ADMIN]) {
      const id = await asUser(ctx, who, async (db) => (await db.query(`select public.log_roster_export() as id`)).rows[0].id, { commit: true });
      const r = (await ctx.db.query(`select format::text, range_start, group_ids from public.export_logs where id = $1`, [id])).rows[0];
      assert.deepEqual(r, { format: "roster", range_start: null, group_ids: null }, who);
    }
  });

  it("리더는 전체 명단을 못 받는다 (42501)", async () => {
    const r = await asUser(ctx, LEADER, (db) => attempt(db, `select public.log_roster_export()`));
    assert.equal(r.code, "42501");
  });

  it("목장 명단 — 리더는 자기 목장, 로그에 그 목장이 남는다 ★", async () => {
    const id = await asUser(ctx, LEADER, async (db) => (await db.query(`select public.log_roster_export($1) as id`, [g3])).rows[0].id, { commit: true });
    const r = (await ctx.db.query(`select format::text, group_ids from public.export_logs where id = $1`, [id])).rows[0];
    assert.deepEqual(r, { format: "roster", group_ids: [g3] });
  });

  it("목장 명단 — 리더는 다른 목장을 못 받는다 (42501), 목사님 · 운영자는 어느 목장이든", async () => {
    const r = await asUser(ctx, LEADER, (db) => attempt(db, `select public.log_roster_export($1)`, [g7]));
    assert.equal(r.code, "42501");
    for (const who of [PASTOR, ADMIN]) {
      const ok = await asUser(ctx, who, (db) => attempt(db, `select public.log_roster_export($1) as id`, [g7]));
      assert.equal(ok.error, null, `${who}: ${ok.error}`);
    }
  });

  it("목장 명단 — 없는 목장은 22023", async () => {
    const r = await asUser(ctx, ADMIN, (db) => attempt(db, `select public.log_roster_export(gen_random_uuid())`));
    assert.equal(r.code, "22023");
  });
});
