/**
 * Step 9a 운영 화면 — DB 가 정하는 것 (2026-10-06)
 *
 *   A-1c 푸시 현황   운영자는 남의 구독을 못 읽는다(발송 비밀). 이름·목장·기기 수만 돌려주는 함수
 *                    push_registration_status() — 운영자 전용. 계정 있는 앱 사용자 전원(기기 0 포함).
 *   A-1b 휴주        쓰기는 운영자만(기존 정책). 2026-11-26 — 지난 주 · 마감 지난 이번 주도 정한다(늦게 정해도 휴주). 예전: **이번 주부터만** — 지난 주차를
 *                    휴주로 넣거나 빼면 streak·제출률이 소급해서 바뀐다(2026-10-06 결정). 트리거가 막는다.
 *   L-5c 청년부 프로필  2026-11-26 표째 지웠다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asService, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let thisWeek;

before(async () => {
  ctx = await createTestDb();
  // 가장 최근 일요일 — KST. 테스트 DB 의 now() 로 계산해 DB 쪽 규칙과 같은 기준을 쓴다.
  thisWeek = (await ctx.db.query(
    `select (date_trunc('week', (now() at time zone 'Asia/Seoul')::date + 1)::date - 1)::text as w`,
  )).rows[0].w;
});

after(async () => {
  await ctx?.db?.close?.();
});

const addWeeks = (w, n) => {
  const d = new Date(`${w}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};

describe("A-1c 푸시 현황 — push_registration_status()", () => {
  it("운영자는 계정 있는 앱 사용자 전원과 기기 수를 본다 (기기 0 포함) ★", async () => {
    const expected = await asService(ctx, async (db) => ({
      users: Number((await db.query(`select count(*)::int n from public.users where role in ('leader','pastor','admin')`)).rows[0].n),
      devices: Number((await db.query(`select count(*)::int n from public.push_subscriptions`)).rows[0].n),
    }));
    const rows = await asUser(ctx, "정다슬", async (db) => (await db.query(`select * from public.push_registration_status()`)).rows);
    assert.equal(rows.length, expected.users);
    assert.equal(rows.reduce((s, r) => s + Number(r.devices), 0), expected.devices);
    assert.ok(rows.some((r) => Number(r.devices) === 0), "기기 없는 사람도 줄로 나온다 — 개별 안내 대상");
    assert.ok(rows.some((r) => Number(r.devices) > 0));
    for (const r of rows) {
      assert.ok(r.name, "이름");
      assert.ok(["leader", "pastor", "admin"].includes(r.role));
      assert.equal(Object.hasOwn(r, "endpoint"), false, "endpoint·키는 돌려주지 않는다");
    }
    const leaderRow = rows.find((r) => r.role === "leader");
    assert.ok(leaderRow.group_name, "리더는 목장 이름이 붙는다");
  });

  it("미승인(pending) 계정은 목록에 없다", async () => {
    const rows = await asUser(ctx, "정다슬", async (db) => (await db.query(`select role from public.push_registration_status()`)).rows);
    assert.equal(rows.some((r) => r.role === "pending"), false);
  });

  for (const who of ["권다움", "임찬양", "박새벽"]) {
    it(`${who === "권다움" ? "리더" : who === "임찬양" ? "목사님" : "미승인"}는 실행하지 못한다`, async () => {
      const r = await asUser(ctx, who, async (db) => attempt(db, `select * from public.push_registration_status()`));
      assert.equal(r.code, "42501", r.error ?? "통과해버렸다");
    });
  }
});

describe("A-1b 휴주 — 늦게 정해도 휴주(2026-11-26 소급 금지를 풀었다)", () => {
  it("운영자가 다음 주 · 다다음 주를 휴주로 넣고 뺀다", async () => {
    const r = await asUser(ctx, "정다슬", async (db) => {
      const ins = await attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '시험'), ($2, '다음 주') returning week_key, created_by`, [addWeeks(thisWeek, 1), addWeeks(thisWeek, 2)]);
      const del = await attempt(db, `delete from public.skipped_weeks where week_key = $1 returning week_key`, [addWeeks(thisWeek, 2)]);
      return { ins, del };
    });
    assert.equal(r.ins.error, null, r.ins.error ?? "");
    assert.equal(r.ins.rows.length, 2);
    assert.ok(r.ins.rows[0].created_by, "created_by 가 세션 사용자로 채워진다");
    assert.equal(r.del.rows.length, 1);
  });

  it("마감 지난 이번 주 · 지난 주차도 휴주로 넣고 뺀다 ★ (2026-11-26)", async () => {
    for (const wk of [thisWeek, addWeeks(thisWeek, -1), addWeeks(thisWeek, -4)]) {
      const r = await asUser(ctx, "정다슬", async (db) => {
        const ins = await attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '행사') returning week_key`, [wk]);
        const del = await attempt(db, `delete from public.skipped_weeks where week_key = $1 returning week_key`, [wk]);
        return { ins, del };
      });
      assert.equal(r.ins.error, null, r.ins.error ?? "");
      assert.equal(r.del.rows.length, 1);
    }
  });

  it("주차는 여전히 고치지 못한다(사유만)", async () => {
    const wk = addWeeks(thisWeek, 5);
    const r = await asUser(ctx, "정다슬", async (db) => {
      await db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '수련회')`, [wk]);
      return attempt(db, `update public.skipped_weeks set week_key = $2 where week_key = $1`, [wk, addWeeks(thisWeek, 6)]);
    });
    assert.equal(r.code, "22023", r.error ?? "주차가 바뀌었다");
  });

  it("리더는 휴주를 쓰지 못한다 ★", async () => {
    const r = await asUser(ctx, "권다움", async (db) =>
      attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '침입') returning week_key`, [addWeeks(thisWeek, 2)]),
    );
    assert.equal(r.code, "42501", r.error ?? "통과");
  });

  it("목사님 · 임원진(리더 겸)은 휴주를 넣고 뺀다 (2026-11-14) ★", async () => {
    const wk = addWeeks(thisWeek, 3);
    const pastor = await asUser(ctx, "임찬양", async (db) => {
      const ins = await attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '수련회') returning week_key`, [wk]);
      const del = await attempt(db, `delete from public.skipped_weeks where week_key = $1 returning week_key`, [wk]);
      return { ins, del };
    }, { commit: true });
    assert.equal(pastor.ins.error, null, pastor.ins.error ?? "");
    assert.equal(pastor.del.rows.length, 1);

    const officerId = (await ctx.db.query(`select u.id from public.users u join public.persons p on p.user_id = u.id where p.name = '김빛나'`)).rows[0].id;
    await ctx.db.query(`update public.users set is_officer = true where id = $1`, [officerId]);
    try {
      const off = await asUser(ctx, "김빛나", async (db) => {
        const ins = await attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1, '임원진') returning week_key`, [wk]);
        const del = await attempt(db, `delete from public.skipped_weeks where week_key = $1 returning week_key`, [wk]);
        return { ins, del };
      }, { commit: true });
      assert.equal(off.ins.error, null, off.ins.error ?? "");
      assert.equal(off.del.rows.length, 1);
    } finally {
      await ctx.db.query(`update public.users set is_officer = false where id = $1`, [officerId]);
    }
  });
});

describe("운영 홈이 읽는 app_meta", () => {
  it("운영자는 읽고, 리더·목사님은 0행, 쓰기는 누구도 못 한다", async () => {
    const admin = await asUser(ctx, "정다슬", async (db) => (await db.query(`select key from public.app_meta`)).rows.length);
    assert.ok(admin >= 2, "roster_source · demo_records 가 보인다");
    for (const who of ["권다움", "임찬양"]) {
      const n = await asUser(ctx, who, async (db) => (await db.query(`select key from public.app_meta`)).rows.length);
      assert.equal(n, 0, who);
    }
    const w = await asUser(ctx, "정다슬", async (db) => attempt(db, `update public.app_meta set value = 'x' where key = 'demo_records' returning key`));
    assert.equal(w.code, "42501", w.error ?? "운영자가 app_meta 를 썼다");
  });
});

