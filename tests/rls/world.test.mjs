/**
 * World 4 — 로뎀 월드 열매 · 상점 · 마을 꾸미기 · 아바타 (2026-10-11)
 *
 *   적립   보고서를 처음 제출하면 한 번: 마감 안 +20 · 마감 후 +5 · 마감 안 연속 n주째 +4×(n−1)(최대 +12) — World 8 값(world_rules)
 *   단위   목장. 열매·가진 물건은 그 목장 리더 · 목사님 · 운영자만 본다. 마을 꾸밈은 앱 사용자 모두가 본다
 *   쓰기   표에 직접 못 쓴다. world_buy · world_set_village · world_save_look 함수로만
 *   권한   목장 리더만 사고 꾸민다(명단 기준). 목사님·운영자는 맡은 목장이 없다. 미승인은 아무것도 못 본다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let L1, L2; // 서로 다른 목장의 리더 두 사람
let g1, g2;
let futureWeek; // 시드에 없는 먼 주(일요일) — 적립 실험용

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  const leaders = (await db.query(
    `select u.name, p.group_id from public.users u join public.persons p on p.user_id = u.id
     where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active'
     order by p.group_id, u.name`,
  )).rows;
  const byGroup = new Map();
  for (const r of leaders) if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, r.name);
  [[g1, L1], [g2, L2]] = [...byGroup.entries()];
  assert.ok(L1 && L2 && g1 !== g2, "서로 다른 목장의 리더 두 사람이 시드에 있어야 한다");
  const last = (await db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * 20);
  futureWeek = d.toISOString().slice(0, 10);
});

after(async () => {
  await ctx?.db?.close?.();
});

const plusWeeks = (w, n) => {
  const d = new Date(`${w}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};
const state = (who) => asUser(ctx, who, async (db) => (await db.query(`select public.world_state() as s`)).rows[0].s);
const balance = async (groupId) => Number((await ctx.db.query(`select coalesce(sum(delta), 0) as b from public.world_ledger where group_id = $1`, [groupId])).rows[0].b);
/** 서버 쪽에서(트리거 경로) 보고서를 제출 상태로 만든다 */
async function submit(groupId, week, late = false) {
  const by = (await ctx.db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
  await ctx.db.query(
    `insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late)
     values ($1, $2, now(), $3, $4)
     on conflict (group_id, week_key) do update set submitted_at = excluded.submitted_at, is_late = excluded.is_late`,
    [groupId, week, by, late],
  );
}

describe("시작 상태", () => {
  it("리더는 12곳 마을(+ 목회자 · 운영자 집)과 자기 목장(열매 60 이상 · 시작 물건)을 받는다", async () => {
    const s = await state(L1);
    assert.equal(s.villages.length, 14);
    assert.equal(s.mine.group_id, g1);
    assert.ok(s.mine.berries >= 60);
    assert.equal(s.mine.owned.wood, 1);
    assert.equal(s.items.length, 126); // 16 + 쿠폰(World 5) + 마을 물건 8 · 꾸미기 소품 11(World 6) + 집 안 가구 20(2026-10-16) + 22(2026-11-10) + 코드로 만든 소품 22 · 집 1 · 12 · 12 더(2026-11-15) + 캠프파이어 1(2026-11-19)
    const v = s.villages.find((x) => x.group_id === g1);
    assert.equal(v.fence, "wood");
    assert.equal(v.slots.length, 7);
  });

  it("목사님·운영자는 목장 대신 목회자 · 운영자 집을 맡는다(2026-11-06)", async () => {
    const special = (await ctx.db.query(`select number, id from public.groups where status = 'special' order by number`)).rows;
    for (const [who, n] of [["임찬양", 101], ["정다슬", 102]]) {
      const s = await state(who);
      assert.equal(s.villages.length, 14);
      assert.equal(s.mine.group_id, special.find((g) => g.number === n).id);
    }
  });

  it("미승인은 월드를 열 수 없고 마을 꾸밈도 보이지 않는다", async () => {
    await asUser(ctx, "박새벽", async (db) => {
      const r = await attempt(db, `select public.world_state()`);
      assert.equal(r.code, "42501");
    });
    await asUser(ctx, "박새벽", async (db) => {
      assert.equal((await db.query(`select * from public.world_villages`)).rows.length, 0);
    });
  });
});

describe("적립 — 보고서 제출", () => {
  it("마감 안 제출 +80(2026-11-16 — 그 전엔 20), 같은 주를 다시 제출해도 한 번뿐", async () => {
    const before0 = await balance(g1);
    await submit(g1, futureWeek);
    assert.equal(await balance(g1), before0 + 80);
    await submit(g1, futureWeek); // 다시(제출 시각만 바뀜) — 트리거는 처음 제출에만
    await ctx.db.query(`update public.reports set submitted_at = now() where group_id = $1 and week_key = $2`, [g1, futureWeek]);
    assert.equal(await balance(g1), before0 + 80);
  });

  it("마감 후 제출 +5, 보너스 없음", async () => {
    const w = plusWeeks(futureWeek, 10);
    const before0 = await balance(g1);
    await submit(g1, w, true);
    assert.equal(await balance(g1), before0 + 5);
  });

  it("마감 안 연속 3주째 → +80 + 보너스 +8", async () => {
    const w0 = plusWeeks(futureWeek, 20);
    await submit(g2, w0);
    await submit(g2, plusWeeks(w0, 1));
    const before0 = await balance(g2);
    await submit(g2, plusWeeks(w0, 2));
    assert.equal(await balance(g2), before0 + 80 + 8);
  });

  it("휴주는 건너뛰고 연속을 잇는다", async () => {
    const w0 = plusWeeks(futureWeek, 30);
    await submit(g2, w0);
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '시험') on conflict do nothing`, [plusWeeks(w0, 1)]);
    const before0 = await balance(g2);
    await submit(g2, plusWeeks(w0, 2));
    assert.equal(await balance(g2), before0 + 80 + 4);
  });
});

describe("구매", () => {
  it("리더는 자기 목장 열매로 산다 — 열매가 줄고 물건이 는다", async () => {
    await asUser(ctx, L1, async (db) => {
      const s0 = (await db.query(`select public.world_state() as s`)).rows[0].s;
      const r = (await db.query(`select public.world_buy('pine') as r`)).rows[0].r;
      assert.equal(r.berries, s0.mine.berries - 15);
      assert.equal(r.qty, (s0.mine.owned.pine ?? 0) + 1);
    });
  });

  it("열매가 모자라면 거절, 울타리는 두 번 못 산다", async () => {
    await asUser(ctx, L1, async (db) => {
      let refused = null;
      for (let i = 0; i < 50 && !refused; i++) {
        const r = await attempt(db, `select public.world_buy('twofloor')`);
        if (r.error) refused = r;
      }
      assert.ok(refused && /열매가 모자랍니다/.test(refused.error));
    });
    await asUser(ctx, L1, async (db) => { // 오류가 나면 그 트랜잭션은 끝 — 새로 연다
      const again = await attempt(db, `select public.world_buy('wood')`);
      assert.match(again.error, /이미 가진 울타리/);
    });
  });

  it("미승인은 살 수 없다(목사님 · 운영자는 자기 집 열매로 산다 — world-places)", async () => {
    for (const who of ["박새벽"]) {
      await asUser(ctx, who, async (db) => {
        const r = await attempt(db, `select public.world_buy('pine')`);
        assert.equal(r.code, "42501", who);
      });
    }
  });
});

describe("꾸미기", () => {
  it("가진 것으로 꾸미면 다른 목장 리더도 그 마을을 본다", async () => {
    const s = await state(L1);
    const house = Object.keys(s.mine.owned).find((k) => ["cabin", "redhouse", "mushroom", "twofloor"].includes(k));
    await asUser(ctx, L1, async (db) => {
      await db.query(`select public.world_set_village('wood', $1::text[])`, [[null, house, null, null, null, null, null]]);
    }, { commit: true });
    await asUser(ctx, L2, async (db) => {
      const v = (await db.query(`select slots from public.world_villages where group_id = $1`, [g1])).rows[0];
      assert.deepEqual(v.slots, [null, house, null, null, null, null, null]);
    });
  });

  it("가진 것보다 많이 · 없는 물건 · 안 가진 울타리 · 일곱 칸 아닌 것은 거절", async () => {
    const s = await state(L2);
    const house = Object.keys(s.mine.owned).find((k) => ["cabin", "redhouse", "mushroom", "twofloor"].includes(k));
    {
      const cases = [
        ["wood", [house, house, null, null, null, null, null], /가진 것보다 많이/],
        ["wood", ["castle", null, null, null, null, null, null], /놓을 수 없는/],
        ["stone", [null, null, null, null, null, null, null], /가진 울타리가 아닙니다/],
        ["wood", [null, null, null], /일곱 칸/],
      ];
      for (const [fence, slots, re] of cases) {
        await asUser(ctx, L2, async (db) => { // 사례마다 새 트랜잭션
          const r = await attempt(db, `select public.world_set_village($1, $2::text[])`, [fence, slots]);
          assert.match(r.error ?? "", re);
        });
      }
    }
  });

  it("다른 목장 마을은 꾸밀 수 없다 — 함수는 언제나 내 목장만 바꾼다", async () => {
    const before0 = (await ctx.db.query(`select slots from public.world_villages where group_id = $1`, [g2])).rows[0].slots;
    await asUser(ctx, L1, async (db) => {
      await db.query(`select public.world_set_village('wood', $1::text[])`, [[null, null, null, null, null, null, null]]);
    }, { commit: true });
    const after0 = (await ctx.db.query(`select slots from public.world_villages where group_id = $1`, [g2])).rows[0].slots;
    assert.deepEqual(after0, before0);
  });
});

describe("공개 범위 · 직접 쓰기", () => {
  it("열매 원장·가진 물건은 자기 목장 것만 보인다", async () => {
    await asUser(ctx, L1, async (db) => {
      const groups = new Set((await db.query(`select group_id from public.world_ledger`)).rows.map((r) => r.group_id));
      assert.deepEqual([...groups], [g1]);
      const inv = new Set((await db.query(`select group_id from public.world_inventory`)).rows.map((r) => r.group_id));
      assert.deepEqual([...inv], [g1]);
    });
  });

  it("목사님은 모든 목장의 원장을 본다", async () => {
    await asUser(ctx, "임찬양", async (db) => {
      const n = new Set((await db.query(`select group_id from public.world_ledger`)).rows.map((r) => r.group_id)).size;
      assert.ok(n >= 2);
    });
  });

  it("표에 직접 쓰기는 거절 — 열매를 스스로 늘릴 수 없다", async () => {
    {
      for (const sql of [
        `insert into public.world_ledger (group_id, delta, reason) values ('${g1}', 999, 'start')`,
        `update public.world_inventory set qty = 99`,
        `update public.world_villages set fence = 'stone'`,
        `insert into public.world_avatars (user_id, look) values (public.current_user_id(), '{}')`,
      ]) {
        await asUser(ctx, L1, async (db) => {
          const r = await attempt(db, sql);
          assert.ok(r.error || r.affected === 0, sql);
        });
      }
    }
  });
});

describe("아바타 생김새", () => {
  it("본인 것만 저장하고 본인만 본다", async () => {
    await asUser(ctx, L1, async (db) => {
      await db.query(`select public.world_save_look($1::jsonb)`, [JSON.stringify({ hair: "pony", shirt: "#7cc7ff" })]);
      const s = (await db.query(`select public.world_state() as s`)).rows[0].s;
      assert.equal(s.look.hair, "pony");
    }, { commit: true });
    await asUser(ctx, L2, async (db) => {
      assert.equal((await db.query(`select * from public.world_avatars`)).rows.length, 0);
      assert.equal((await db.query(`select public.world_state() as s`)).rows[0].s.look, null);
    });
  });

  it("너무 크거나 객체가 아닌 값은 거절", async () => {
    const big = JSON.stringify({ x: "a".repeat(2000) });
    await asUser(ctx, L1, async (db) => assert.ok((await attempt(db, `select public.world_save_look($1::jsonb)`, [big])).error));
    await asUser(ctx, L1, async (db) => assert.ok((await attempt(db, `select public.world_save_look('[1,2]'::jsonb)`)).error));
  });
});
