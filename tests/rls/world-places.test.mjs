/**
 * 목회자 집 · 운영자 집 (2026-11-06)
 *
 *   자리     groups 의 특별 자리 둘(status 'special', 101 목회자 · 102 운영) — 활동 목장 수(12)에는 안 든다
 *   주인     _world_my_group: 목사님 → 목회자 집, 운영자 → 운영자 집(운영자는 목장이 없다), 리더 → 자기 목장
 *   열매     시작 60. 보고서 처음 확인 +2(보고서마다 한 번) · 확인 도장 +1(한 번) · 신청 승인 +5
 *   마당     앞 세 칸만(집 하나 · 마당 둘). 쿠폰은 못 산다
 *   상태     world_state 에 두 마당이 맨 뒤로 붙는다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb, createUnlinkedAuthUser, asAuthUser } from "./harness.mjs";

let ctx, pastorHouse, adminHouse, report;
const PASTOR = "임찬양";
const ADMIN = "정다슬";

before(async () => {
  ctx = await createTestDb();
  const g = (n) => ctx.db.query(`select id from public.groups where number = $1`, [n]).then((r) => r.rows[0]?.id);
  pastorHouse = await g(101);
  adminHouse = await g(102);
  const week = (await ctx.db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  report = (await ctx.db.query(`select id from public.reports where week_key = $1 and submitted_at is not null order by group_id limit 1`, [week])).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

const balance = async (group) =>
  (await ctx.db.query(`select coalesce(sum(delta), 0)::int as b from public.world_ledger where group_id = $1`, [group])).rows[0].b;
const myGroup = (name) => asUser(ctx, name, async (db) => (await db.query(`select public.world_state() as s`)).rows[0].s.mine?.group_id ?? null);

describe("자리와 주인", () => {
  it("특별 자리 둘 — 활동 목장은 여전히 12", async () => {
    assert.ok(pastorHouse && adminHouse);
    const { rows } = await ctx.db.query(`select status::text as s, count(*)::int as n from public.groups group by 1 order by 1`);
    assert.deepEqual(rows.find((r) => r.s === "active").n, 12);
    assert.deepEqual(rows.find((r) => r.s === "special").n, 2);
  });

  it("목사님 → 목회자 집, 운영자 → 운영자 집, 리더 → 자기 목장", async () => {
    assert.equal(await myGroup(PASTOR), pastorHouse);
    assert.equal(await myGroup(ADMIN), adminHouse);
    const leader = (await ctx.db.query(
      `select u.name, p.group_id from public.users u join public.persons p on p.user_id = u.id
        where u.role = 'leader' and u.status = 'active' and u.auth_user_id is not null and p.group_role = 'leader' and p.status = 'active' limit 1`,
    )).rows[0];
    assert.equal(await myGroup(leader.name), leader.group_id);
  });

  it("두 집은 처음부터 있다 — 시작 열매 60 · 집 한 채", async () => {
    for (const g of [pastorHouse, adminHouse]) {
      assert.equal(await balance(g), g === adminHouse ? 60 + 9999999 : 60); // 운영자 집은 끝없는 열매(2026-11-15)
      const v = (await ctx.db.query(`select slots from public.world_villages where group_id = $1`, [g])).rows[0];
      assert.ok(v.slots[0], "집 칸");
    }
  });

  it("world_state 에 두 마당이 맨 뒤로, 내 자리 열매가 보인다", async () => {
    const s = await asUser(ctx, PASTOR, async (db) => (await db.query(`select public.world_state() as s`)).rows[0].s);
    const ids = s.villages.map((v) => v.group_id);
    assert.equal(ids.length, 14);
    assert.deepEqual(ids.slice(-2), [pastorHouse, adminHouse]);
    assert.equal(s.mine.group_id, pastorHouse);
    assert.equal(s.mine.berries, 60);
  });
});

describe("열매", () => {
  it("보고서를 처음 확인하면 +2 — 다시 열어도 · 다른 목사님이 열어도 한 번", async () => {
    const before = await balance(pastorHouse);
    await asUser(ctx, PASTOR, (db) => db.query(`select public.mark_report_read($1)`, [report]), { commit: true });
    await asUser(ctx, PASTOR, (db) => db.query(`select public.mark_report_read($1)`, [report]), { commit: true });
    assert.equal(await balance(pastorHouse), before + 2);
  });

  it("확인 도장 +1 — 취소했다 다시 찍어도 한 번", async () => {
    const before = await balance(pastorHouse);
    for (let i = 0; i < 3; i++) {
      await asUser(ctx, PASTOR, (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report]), { commit: true });
    }
    assert.equal(await balance(pastorHouse), before + 1);
  });

  it("신청 승인 +5 — 운영자 집에", async () => {
    const { rows } = await ctx.db.query(
      `select p.id from public.persons p join public.groups g on g.id = p.group_id
        where g.number <> 3 and p.group_role = 'leader' and p.status = 'active' and p.user_id is not null and not p.is_group_head
        order by g.number, p.name limit 1`,
    );
    await asUser(ctx, ADMIN, (db) => db.query(`select public.unlink_person_account($1)`, [rows[0].id]), { commit: true });
    const auth = await createUnlinkedAuthUser(ctx, "google", "새리더");
    await asAuthUser(ctx, auth, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const app = await asAuthUser(ctx, auth, async (db) => (await db.query(`select public.apply_for_person($1) as id`, [rows[0].id])).rows[0].id, { commit: true });
    const before = await balance(adminHouse);
    await asUser(ctx, ADMIN, (db) => db.query(`select public.approve_application($1)`, [app]), { commit: true });
    assert.equal(await balance(adminHouse), before + 5);
  });

  it("열매 규칙은 world_rules 로 바꾼다", async () => {
    const { rows } = await ctx.db.query(`select key, value from public.world_rules where key in ('pastor_read', 'pastor_stamp', 'admin_approve') order by key`);
    assert.deepEqual(rows.map((r) => [r.key, r.value]), [["admin_approve", 5], ["pastor_read", 2], ["pastor_stamp", 1]]);
  });

  it("앱에서 열매를 직접 쓰거나 트리거 함수를 부를 수 없다", async () => {
    const r = await asUser(ctx, PASTOR, (db) => attempt(db, `insert into public.world_ledger (group_id, delta, reason, ref_id) values ($1, 100, 'pastor_read', gen_random_uuid())`, [pastorHouse]));
    assert.ok(r.error);
    const f = await asUser(ctx, PASTOR, (db) => attempt(db, `select public._world_special(101)`));
    assert.ok(f.error);
  });
});

describe("마당 꾸미기 · 사기", () => {
  const slots = (xs) => `array[${xs.map((s) => (s ? `'${s}'` : "null")).join(", ")}]::text[]`;

  it("앞 세 칸은 바꾸고, 넷째 칸부터는 막힌다", async () => {
    const { slots: cur, fence } = (await ctx.db.query(`select fence, slots from public.world_villages where group_id = $1`, [pastorHouse])).rows[0];
    const tree = (await ctx.db.query(`select item_id from public.world_inventory i join public.world_items w on w.id = i.item_id where i.group_id = $1 and w.cat = 'nature' limit 1`, [pastorHouse])).rows[0]?.item_id;
    assert.ok(tree, "기본 나무");
    const ok = await asUser(ctx, PASTOR, (db) => attempt(db, `select public.world_set_village($1, ${slots([cur[0], tree, null, null, null, null, null])})`, [fence]));
    assert.equal(ok.error, null);
    const no = await asUser(ctx, PASTOR, (db) => attempt(db, `select public.world_set_village($1, ${slots([cur[0], null, null, tree, null, null, null])})`, [fence]));
    assert.match(no.error ?? "", /세 칸/);
  });

  it("운영자도 자기 집 열매로 산다 — 쿠폰은 못 산다", async () => {
    const item = (await ctx.db.query(`select id from public.world_items where cat = 'nature' and price <= 60 order by price limit 1`)).rows[0]?.id;
    const ticket = (await ctx.db.query(`select id from public.world_items where cat = 'ticket' limit 1`)).rows[0]?.id;
    const b = await asUser(ctx, ADMIN, (db) => attempt(db, `select public.world_buy($1)`, [item]));
    assert.equal(b.error, null);
    if (ticket) {
      const t = await asUser(ctx, ADMIN, (db) => attempt(db, `select public.world_buy($1)`, [ticket]));
      assert.ok(t.error);
    }
  });
});
