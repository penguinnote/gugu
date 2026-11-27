/**
 * 승인 화면 '모두 승인'(2026-11-26) — 화면(lib/bulk-approve)이 고르는 데 쓰는 칸과, 한 건씩 승인하는 흐름.
 *   · list_pending_applications 에 person_id · person_linked · applicant_active
 *   · 리더 신청만 한꺼번에(목사님 신청은 남는다), 같은 이름을 두 사람이 고른 신청 · 이미 연결된 이름은 건너뛴다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAuthUser, asUser, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;
before(async () => {
  ctx = await createTestDb();
});
after(async () => {
  await ctx?.db?.close?.();
});

/** 계정 붙은 리더를 떼어 '계정 없는 리더' 로(신청 대상) */
async function freeLeaders(n) {
  const { rows } = await ctx.db.query(
    `select p.id, p.name from public.persons p join public.groups g on g.id = p.group_id
      where p.group_role = 'leader' and p.status = 'active' and p.user_id is not null and not p.is_group_head
      order by g.number desc, p.name limit $1`, [n]);
  for (const r of rows) await asUser(ctx, "정다슬", (db) => db.query(`select public.unlink_person_account($1)`, [r.id]), { commit: true });
  return rows;
}
async function applicant(name) {
  const id = await createUnlinkedAuthUser(ctx, "google", name);
  await asAuthUser(ctx, id, (db) => db.query(`select public.ensure_user()`), { commit: true });
  return id;
}
const applyFor = (authId, personId) =>
  asAuthUser(ctx, authId, async (db) => (await db.query(`select public.apply_for_person($1) as id`, [personId])).rows[0].id, { commit: true });

/** lib/bulk-approve 와 같은 규칙(.mjs 라 TS 를 불러오지 못해 옮겨 적는다 — tests/ui/bulk-approve.test.ts 가 TS 쪽을 본다) */
function plan(apps) {
  const leaders = apps.filter((a) => (a.requested_role ?? "leader") === "leader");
  const picks = new Map();
  for (const a of leaders) if (a.person_id) picks.set(a.person_id, (picks.get(a.person_id) ?? 0) + 1);
  return leaders.filter((a) => a.person_id && !a.person_linked && picks.get(a.person_id) === 1 && a.applicant_active !== false).map((a) => a.id);
}

describe("모두 승인", () => {
  it("목록 칸으로 리더 신청만 고르고, 같은 이름 두 신청은 건너뛴다 — 승인하면 고른 것만 리더가 된다 ★", async () => {
    const [p1, p2, p3] = await freeLeaders(3);
    const a1 = await applicant("하나리더");
    const a2 = await applicant("둘리더");
    const d1 = await applicant("겹침가");
    const d2 = await applicant("겹침나");
    const pastor = await applicant("목사신청");
    const app1 = await applyFor(a1, p1.id);
    const app2 = await applyFor(a2, p2.id);
    const dup1 = await applyFor(d1, p3.id);
    const dup2 = await applyFor(d2, p3.id);
    const pApp = await asAuthUser(ctx, pastor, async (db) => (await db.query(`select public.request_role('pastor') as id`)).rows[0].id, { commit: true });

    const rows = await asUser(ctx, "정다슬", async (db) => (await db.query(`select * from public.list_pending_applications()`)).rows);
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.equal(byId.get(app1).person_id, p1.id);
    assert.equal(byId.get(app1).person_linked, false);
    assert.equal(byId.get(app1).applicant_active, true);
    assert.equal(byId.get(pApp).requested_role, "pastor");

    const mine = new Set([app1, app2, dup1, dup2, pApp]); // 시드의 다른 대기 신청은 빼고 본다
    const pick = plan(rows.filter((r) => mine.has(r.id)));
    assert.deepEqual(pick.sort(), [app1, app2].sort());
    for (const id of pick) await asUser(ctx, "정다슬", (db) => db.query(`select public.approve_application($1)`, [id]), { commit: true });

    const st = (await ctx.db.query(`select id, status from public.applications where id = any($1)`, [[app1, app2, dup1, dup2, pApp]])).rows;
    const s = Object.fromEntries(st.map((r) => [r.id, r.status]));
    assert.equal(s[app1], "approved");
    assert.equal(s[app2], "approved");
    assert.equal(s[dup1], "pending");
    assert.equal(s[dup2], "pending");
    assert.equal(s[pApp], "pending", "목사님 신청은 하나씩");
  });

  it("고른 이름이 그 사이 다른 계정에 연결되면 person_linked 로 알린다", async () => {
    const [p] = await freeLeaders(1);
    const a = await applicant("늦은신청");
    const app = await applyFor(a, p.id);
    // 운영자가 다른 계정을 그 사람에 직접 연결한 경우
    const other = (await ctx.db.query(`select id from public.users where name = '목사신청'`)).rows[0].id;
    await ctx.db.query(`update public.persons set user_id = $1 where id = $2`, [other, p.id]);
    const row = await asUser(ctx, "정다슬", async (db) => (await db.query(`select * from public.list_pending_applications() where id = $1`, [app])).rows[0]);
    assert.equal(row.person_linked, true);
    assert.deepEqual(plan([row]), []);
  });

  it("목록은 여전히 운영자만", async () => {
    const n = await asUser(ctx, "권다움", async (db) => (await db.query(`select * from public.list_pending_applications()`)).rows.length);
    assert.equal(n, 0);
  });
});
