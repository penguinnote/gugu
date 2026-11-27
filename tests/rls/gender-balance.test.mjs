/**
 * Step 6 — 성별 수급 균형 (2026-10-03, 03-metrics §3.4)
 *
 * care_gender_balance() — 목장 × 성별 한 줄. 동성 리더 1인당 담당할 동성 청년 수.
 *   · 청년(분자)  group_role = member ∧ status = active ∧ care_status ∈ {active, long_absent} — 사각지대와 같은 판정 대상.
 *                리더끼리는 서로 돌보므로 분자에 넣지 않는다
 *   · 리더(분모)  group_role = leader ∧ status = active ∧ care_status ∈ {active, long_absent} — 명단 기준, 계정 무관.
 *                군 복무·원거리 리더는 지금 돌볼 수 없다
 *   · 경보        동성 리더가 0 인데 동성 청년이 있으면 no_leader(지표가 아니라 경보), 1인당 6 이상이면 overload
 *   · 기록 무관   명단 구성만 본다 — 창도 집계 중도 없다
 *   · 범위        목사님·운영자 전체(운영자가 리더 배치를 한다), 리더 자기 목장, 미승인 0행
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3, g4, g5;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  const id = async (n) => (await db.query(`select id from public.groups where number = $1`, [n])).rows[0].id;
  g3 = await id(3);
  g4 = await id(4);
  g5 = await id(5);
});

after(async () => {
  await ctx?.db?.close?.();
});

async function balance(who = "임찬양") {
  return asUser(ctx, who, async (db) => (await db.query(`select * from public.care_gender_balance()`)).rows);
}

async function of(groupId, gender, who) {
  return (await balance(who)).find((r) => r.group_id === groupId && r.gender === gender) ?? null;
}

async function personId(name) {
  return (await ctx.db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;
}

describe("계산 — 시드에서 손으로 센 값", () => {
  // 3목장: 리더 권다움(남) 김빛나(여) 도하린(여) 류지호(남) · 청년 고은결(여) 남시현(남) 서다온(여)
  it("3목장 자매: 청년 2 / 리더 2 = 1, 형제: 1 / 2 = 0.5 ★", async () => {
    const f = await of(g3, "female");
    assert.equal(f.members, 2);
    assert.equal(f.leaders, 2);
    assert.equal(Number(f.per_leader), 1);
    assert.equal(f.alert, null);
    const m = await of(g3, "male");
    assert.equal(m.members, 1);
    assert.equal(m.leaders, 2);
    assert.equal(Number(m.per_leader), 0.5);
  });

  // 4목장: 리더 반하늘(여) 엄나래(남) 주보라(남) · 청년 홍새롬 한다움 진이슬 차해오름(전부 남)
  it("4목장 형제 4 / 2 = 2, 자매 청년 0 / 리더 1 = 0 — 경보 없음", async () => {
    const m = await of(g4, "male");
    assert.equal(Number(m.per_leader), 2);
    const f = await of(g4, "female");
    assert.equal(f.members, 0);
    assert.equal(f.leaders, 1);
    assert.equal(Number(f.per_leader), 0);
    assert.equal(f.alert, null);
  });

  it("목장마다 형제·자매 두 줄 — 12목장 × 2 = 24줄, 형제가 먼저", async () => {
    const rows = await balance();
    assert.equal(rows.length, 24);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.gender), ["male", "female"]);
  });
});

describe("경보", () => {
  it("동성 리더가 0 인데 동성 청년이 있으면 no_leader, 1인당 값은 없다 ★", async () => {
    const id = await personId("안해찬"); // 5목장 유일한 자매 리더
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [id]);
    try {
      const f = await of(g5, "female");
      assert.equal(f.leaders, 0);
      assert.ok(f.members > 0);
      assert.equal(f.per_leader, null);
      assert.equal(f.alert, "no_leader");
    } finally {
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [id]);
    }
  });

  it("동성 청년도 리더도 없으면 경보가 아니다", async () => {
    const id = await personId("반하늘"); // 4목장 유일한 자매 리더, 자매 청년 0
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [id]);
    try {
      const f = await of(g4, "female");
      assert.equal(f.members, 0);
      assert.equal(f.leaders, 0);
      assert.equal(f.alert, null);
    } finally {
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [id]);
    }
  });

  it("1인당 6 이상이면 overload — 경계 6 은 포함 ★", async () => {
    // 4목장 형제: 청년 4 + 2명 추가 = 6, 리더 주보라를 휴면으로 → 1명. 6 / 1 = 6
    const lead = await personId("주보라");
    const added = [];
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [lead]);
    try {
      for (const name of ["임시형제1", "임시형제2"]) {
        const r = await ctx.db.query(
          `insert into public.persons (group_id, name, gender, group_role, joined_at) values ($1, $2, 'male', 'member', current_date) returning id`,
          [g4, name]);
        added.push(r.rows[0].id);
      }
      const m = await of(g4, "male");
      assert.equal(m.members, 6);
      assert.equal(m.leaders, 1);
      assert.equal(Number(m.per_leader), 6);
      assert.equal(m.alert, "overload");

      await ctx.db.query(`delete from public.persons where id = $1`, [added.pop()]);
      const m5 = await of(g4, "male");
      assert.equal(Number(m5.per_leader), 5);
      assert.equal(m5.alert, null);
    } finally {
      for (const id of added) await ctx.db.query(`delete from public.persons where id = $1`, [id]);
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [lead]);
    }
  });
});

describe("누가 세어지는가", () => {
  it("판정 제외 청년(군 복무 등)은 분자에서 빠진다", async () => {
    const id = await personId("서다온");
    await ctx.db.query(`update public.persons set care_status = 'military' where id = $1`, [id]);
    try {
      assert.equal((await of(g3, "female")).members, 1);
    } finally {
      await ctx.db.query(`update public.persons set care_status = 'active' where id = $1`, [id]);
    }
  });

  it("판정 제외 리더(원거리 등)는 분모에서 빠진다 — 지금 돌볼 수 없다", async () => {
    const id = await personId("김빛나");
    await ctx.db.query(`update public.persons set care_status = 'remote' where id = $1`, [id]);
    try {
      assert.equal((await of(g3, "female")).leaders, 1);
    } finally {
      await ctx.db.query(`update public.persons set care_status = 'active' where id = $1`, [id]);
    }
  });

  it("계정 없는 리더(류지호)도 분모에 든다", async () => {
    const m = await of(g3, "male");
    assert.equal(m.leaders, 2);
  });
});

describe("누가 무엇을 보는가", () => {
  it("운영자도 전체를 본다 — 리더 배치를 한다", async () => {
    assert.equal((await balance("정다슬")).length, 24);
  });

  it("리더는 자기 목장 두 줄만 ★", async () => {
    const rows = await balance("권다움");
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.group_id === g3));
  });

  it("미승인은 0행", async () => {
    const r = await asUser(ctx, "한이음", (db) => attempt(db, `select * from public.care_gender_balance()`));
    if (r.error === null) assert.equal(r.rows.length, 0);
  });

  it("결과에는 숫자만 — 이름이 없다", async () => {
    const [row] = await balance();
    assert.deepEqual(Object.keys(row).sort(), ["alert", "gender", "group_id", "leaders", "members", "per_leader"]);
  });
});
