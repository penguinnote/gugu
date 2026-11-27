/**
 * Step 6 — 관계 밀도 (2026-10-03, 03-metrics §3.3)
 *
 * care_density(p_week_key, p_now) — 목장 한 줄. 목장 안에서 실제로 이어진 (사람 × 리더) 1대1 연결 비율.
 *   · 창          사각지대와 같다 — 마감이 지난 최근 4주, 휴주 제외 (care_window)
 *   · 분자        이 목장에서 쓰인 기록(group_id_at_write) 중 1대1 접촉의 서로 다른 (사람, 작성 리더) 쌍.
 *                 사람은 지금 이 목장의 판정 대상, 작성자는 지금 이 목장의 리더일 때만
 *   · 분모        판정 대상 수 × 리더 수 − (리더이면서 판정 대상인 사람 수) — 자기 자신과는 연결이 없다
 *   · 판정 대상   persons.status = active ∧ care_status ∈ {active, long_absent} (사각지대와 같다)
 *   · 리더        이 목장의 활동 중 리더(명단 기준). 앱 계정이 없어도 센다 — 아직 기록하지 않는 리더도 빈 연결이다
 *   · 보류        창이 데이터 시작보다 앞서면 collecting, density = null. 분모 0 이면 null
 *   · 범위        목사님 전체, 리더 자기 목장, 운영자·미승인 0행. 순위는 없다 — 같은 목장의 추이로 읽는다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let weeks;
let g3, g7;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  weeks = (await db.query(`select distinct week_key::text as w from public.reports order by 1`)).rows.map((r) => r.w);
  assert.equal(weeks.length, 4);
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

function plusDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const AFTER = () => `${plusDays(weeks[3], 3)}T09:00:00+09:00`;

async function density(who = "임찬양", weekKey = weeks[3], now = AFTER()) {
  return asUser(ctx, who, async (db) =>
    (await db.query(`select * from public.care_density($1::date, $2::timestamptz)`, [weekKey, now])).rows);
}

async function of(groupId, ...args) {
  return (await density(...args)).find((r) => r.group_id === groupId) ?? null;
}

async function personId(name) {
  return (await ctx.db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;
}

describe("계산 — 시드 3목장을 손으로 센 값", () => {
  // 3목장: 판정 대상 7명(리더 4 · 청년 3), 리더 4명(류지호는 계정 없음).
  // 작성자는 주마다 돌아간다 — w0 권다움, w1 김빛나, w2 도하린, w3 권다움.
  // 이어진 쌍: 권다움←김빛나, 김빛나←권다움, 도하린←권다움, 류지호←권다움(2회), 고은결←권다움, 고은결←김빛나, 남시현←도하린 = 7
  // 자기 자신 체크(권다움 w0 · 김빛나 w1 · 도하린 w2)는 트리거가 지웠다.
  it("대상 7 · 리더 4 · 가능 24쌍(7×4−4) · 이어진 7쌍 → 7/24 ★", async () => {
    const d = await of(g3);
    assert.equal(d.state, "judged");
    assert.equal(d.targets, 7);
    assert.equal(d.leaders, 4);
    assert.equal(d.possible_pairs, 24);
    assert.equal(d.connected_pairs, 7);
    assert.ok(Math.abs(Number(d.density) - 7 / 24) < 0.001, `density ${d.density}`);
  });

  it("같은 쌍은 여러 번 접촉해도 한 번이다", async () => {
    const id = await personId("고은결");
    const rec = (await ctx.db.query(
      `select id from public.weekly_records where person_id = $1 and week_key = $2`, [id, weeks[3]])).rows[0].id;
    await ctx.db.query(`update public.weekly_records set one_on_one_contacted = true where id = $1`, [rec]); // w3 작성자 권다움 — 이미 있는 쌍
    try {
      assert.equal((await of(g3)).connected_pairs, 7);
    } finally {
      await ctx.db.query(`update public.weekly_records set one_on_one_contacted = false where id = $1`, [rec]);
    }
  });

  it("창과 경계를 돌려준다", async () => {
    const d = await of(g3);
    const ymd = (v) => (v instanceof Date
      ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
      : v);
    assert.equal(ymd(d.window_start), weeks[0]);
    assert.equal(ymd(d.window_end), weeks[3]);
  });
});

describe("구성이 바뀔 때", () => {
  it("사람이 옮기면 옛 목장 분자·분모에서 빠지고, 새 목장에는 옛 목장에서 쓰인 접촉이 들어가지 않는다 ★", async () => {
    const id = await personId("고은결");
    const before7 = await of(g7);
    await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [id, g7]);
    try {
      const d3 = await of(g3);
      assert.equal(d3.targets, 6);
      assert.equal(d3.possible_pairs, 20);
      assert.equal(d3.connected_pairs, 5, "고은결의 두 쌍이 빠진다");

      const d7 = await of(g7);
      assert.equal(d7.targets, before7.targets + 1);
      assert.equal(d7.connected_pairs, before7.connected_pairs, "3목장에서 쓰인 기록은 7목장의 연결이 아니다");
    } finally {
      await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [id, g3]);
    }
  });

  it("판정 제외(care_status)는 분자·분모 모두에서 빠진다", async () => {
    const id = await personId("고은결");
    await ctx.db.query(`update public.persons set care_status = 'military' where id = $1`, [id]);
    try {
      const d = await of(g3);
      assert.equal(d.targets, 6);
      assert.equal(d.possible_pairs, 20);
      assert.equal(d.connected_pairs, 5);
    } finally {
      await ctx.db.query(`update public.persons set care_status = 'active' where id = $1`, [id]);
    }
  });

  it("리더가 휴면이 되면 대상·리더에서 빠지고 그 리더가 쓴 쌍도 빠진다", async () => {
    const id = await personId("도하린");
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [id]);
    try {
      const d = await of(g3);
      assert.equal(d.targets, 6);
      assert.equal(d.leaders, 3);
      // 대상 6 × 리더 3 − 리더이면서 대상 3 = 15. 도하린←권다움 · 남시현←도하린 이 빠진다
      assert.equal(d.possible_pairs, 15);
      assert.equal(d.connected_pairs, 5);
    } finally {
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [id]);
    }
  });

  it("계정 없는 리더도 분모에 든다 — 류지호를 청년으로 내리면 가능한 쌍이 준다", async () => {
    const id = await personId("류지호");
    await ctx.db.query(`update public.persons set group_role = 'member' where id = $1`, [id]);
    try {
      const d = await of(g3);
      assert.equal(d.leaders, 3);
      assert.equal(d.possible_pairs, 18); // 7 × 3 − 3
      assert.equal(d.connected_pairs, 7, "류지호←권다움 은 대상 쪽이라 남는다");
    } finally {
      await ctx.db.query(`update public.persons set group_role = 'leader' where id = $1`, [id]);
    }
  });
});

describe("보류", () => {
  it("창이 데이터 시작보다 앞서면 collecting, density 는 null ★", async () => {
    const rows = await density("임찬양", weeks[2], `${plusDays(weeks[2], 3)}T09:00:00+09:00`);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.state === "collecting" && r.density === null));
  });

  it("휴주가 끼면 창이 더 거슬러 가고, 데이터보다 앞서 collecting", async () => {
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '수련회')`, [weeks[1]]);
    try {
      assert.equal((await of(g3)).state, "collecting");
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [weeks[1]]);
    }
  });

  it("p_week_key 는 일요일이어야 한다", async () => {
    const r = await asUser(ctx, "임찬양", (db) =>
      attempt(db, `select * from public.care_density($1::date, $2::timestamptz)`, [plusDays(weeks[3], 1), AFTER()]));
    assert.notEqual(r.error, null);
  });
});

describe("누가 무엇을 보는가 — 순위는 없다", () => {
  it("목사님은 12개 목장 전부", async () => {
    assert.equal((await density()).length, 12);
  });

  it("리더는 자기 목장 한 줄만 ★", async () => {
    const rows = await density("권다움");
    assert.deepEqual(rows.map((r) => r.group_id), [g3]);
  });

  it("운영자와 미승인은 0행", async () => {
    assert.equal((await density("정다슬")).length, 0);
    const pending = await asUser(ctx, "한이음", (db) =>
      attempt(db, `select * from public.care_density($1::date, $2::timestamptz)`, [weeks[3], AFTER()]));
    if (pending.error === null) assert.equal(pending.rows.length, 0);
  });

  it("결과에는 숫자만 — 사람·쌍 목록이 없다", async () => {
    const [row] = await density();
    assert.deepEqual(Object.keys(row).sort(), [
      "connected_pairs", "density", "group_id", "leaders", "possible_pairs",
      "state", "targets", "window_end", "window_start",
    ]);
  });
});
