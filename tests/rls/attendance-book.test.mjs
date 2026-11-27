/**
 * 출석부 · 캠퍼스(2026-11-16)
 *   attendance_book() — 제출된 보고서의 예배 출석만(사람 · 주 · 현장 · 온라인). 앱을 쓰는 사람 모두(2026-11-16 전체 공개).
 *   사유 · 기도제목은 주지 않는다. 임시 저장 · 휴주 · 기록 제외한 사람은 뺀다. 시작 주(app_meta attendance_start) 앞은 뺀다.
 *   persons.campus — 캠퍼스 모임 이름. 그 목장 리더 · 목사님 · 운영자가 고친다(다른 목장 리더는 못 고친다).
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let weeks;

before(async () => {
  ctx = await createTestDb();
  weeks = (await ctx.db.query(`select distinct week_key::text as w from public.reports order by 1`)).rows.map((r) => r.w);
});
after(async () => {
  await ctx?.db?.close?.();
});

const book = (who, args = "") => asUser(ctx, who, async (db) => attempt(db, `select person_id, week_key::text as week_key, onsite, online from public.attendance_book(${args})`));

describe("출석부 attendance_book()", () => {
  it("운영자 · 목사님은 본다 — 제출된 보고서의 줄 수와 같고, 칸은 넷뿐 ★", async () => {
    const expected = Number((await ctx.db.query(
      `select count(*)::int n from public.weekly_records w join public.reports r on r.id = w.report_id and r.submitted_at is not null
         join public.persons p on p.id = w.person_id and p.status <> 'opted_out'
        where not exists (select 1 from public.skipped_weeks s where s.week_key = w.week_key)`)).rows[0].n);
    assert.ok(expected > 0);
    for (const who of ["정다슬", "임찬양"]) {
      const r = await book(who);
      assert.equal(r.error, null, r.error ?? "");
      assert.equal(r.rows.length, expected);
      assert.deepEqual(Object.keys(r.rows[0]).sort(), ["online", "onsite", "person_id", "week_key"]);
    }
  });

  it("현장과 온라인은 겹치지 않는다 — 온라인이면 현장이 아니다", async () => {
    const one = (await ctx.db.query(`select w.id, w.person_id, w.week_key::text as wk from public.weekly_records w join public.reports r on r.id = w.report_id and r.submitted_at is not null where w.worship_attended limit 1`)).rows[0];
    await ctx.db.query(`update public.weekly_records set worship_online = true, group_meeting_attended = false, online_reason = '출장' where id = $1`, [one.id]);
    const r = await book("정다슬");
    const row = r.rows.find((x) => x.person_id === one.person_id && x.week_key === one.wk);
    assert.deepEqual([row.onsite, row.online], [false, true]);
    assert.ok(r.rows.every((x) => !(x.onsite && x.online)));
  });

  it("리더도 본다(2026-11-16 전체 공개) — 승인 대기 계정 · 로그인 안 한 사람은 못 본다", async () => {
    const leader = await book("권다움");
    assert.equal(leader.error, null, leader.error ?? "");
    assert.ok(leader.rows.length > 0);
    const pending = (await ctx.db.query(`select p.name from public.users u join public.persons p on p.user_id = u.id where u.role = 'pending' limit 1`)).rows[0]?.name;
    if (pending) {
      const no = await book(pending);
      assert.match(no.error ?? "", /출석부를 볼 수 없습니다/);
    }
    const anon = await asAnon(ctx, async (db) => attempt(db, `select * from public.attendance_book()`));
    assert.ok(anon.error);
  });

  it("시작 주 앞 · 휴주 · 임시 저장은 뺀다", async () => {
    const all = (await book("정다슬")).rows.length;
    await ctx.db.query(`insert into public.app_meta (key, value) values ('attendance_start', $1) on conflict (key) do update set value = excluded.value`, [weeks[1]]);
    try {
      const r = await book("정다슬");
      assert.ok(r.rows.length < all);
      assert.ok(r.rows.every((x) => x.week_key >= weeks[1]));
      const start = await asUser(ctx, "정다슬", async (db) => (await db.query(`select public.attendance_start()::text as d`)).rows[0].d);
      assert.equal(start, weeks[1]);
    } finally {
      await ctx.db.query(`delete from public.app_meta where key = 'attendance_start'`);
    }
    const last = weeks[weeks.length - 1];
    const before = (await book("정다슬", `'${last}', '${last}'`)).rows.length;
    assert.ok(before > 0);
    await ctx.db.query(`update public.reports set submitted_at = null, submitted_by = null where id = (select id from public.reports where week_key = $1 and submitted_at is not null limit 1)`, [last]);
    const after = (await book("정다슬", `'${last}', '${last}'`)).rows.length;
    assert.ok(after < before);
  });
});

describe("출석부 사람들 attendance_people()", () => {
  it("운영자 · 리더 모두 떠난 사람 · 기록 제외를 뺀 모두를 본다. 연락처 · 생년은 없다", async () => {
    const expected = Number((await ctx.db.query(`select count(*)::int n from public.persons where status in ('active','dormant') and group_id is not null`)).rows[0].n);
    const r = await asUser(ctx, "정다슬", async (db) => attempt(db, `select * from public.attendance_people()`));
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows.length, expected);
    assert.ok(!("phone" in r.rows[0]) && !("birth_year" in r.rows[0]) && !("note" in r.rows[0]));
    const leader = await asUser(ctx, "권다움", async (db) => attempt(db, `select * from public.attendance_people()`));
    assert.equal(leader.error, null, leader.error ?? "");
    assert.equal(leader.rows.length, expected);
  });
});

describe("출석 제외 사유 persons.attendance_off(2026-11-17)", () => {
  it("그 목장 리더 · 운영자가 1~4자로 적고, 출석부 사람들에 숨김 여부와 함께 나온다. 다른 목장 리더는 못 고친다", async () => {
    const mine = (await ctx.db.query(`select p.id from public.persons p where p.group_id = (select group_id from public.persons where name = '권다움') and p.name <> '권다움' and p.status = 'active' limit 1`)).rows[0].id;
    const other = (await ctx.db.query(`select p.id from public.persons p where p.group_id <> (select group_id from public.persons where name = '권다움') and p.status = 'active' limit 1`)).rows[0].id;
    const ok = await asUser(ctx, "권다움", async (db) => attempt(db, `update public.persons set attendance_off = '교환' where id = $1 returning attendance_off`, [mine]), { commit: true });
    assert.equal(ok.error, null, ok.error ?? "");
    assert.equal(ok.rows[0].attendance_off, "교환");
    const no = await asUser(ctx, "권다움", async (db) => attempt(db, `update public.persons set attendance_off = '군복무' where id = $1 returning id`, [other]));
    assert.ok(no.error || no.rows.length === 0);
    const long = await asUser(ctx, "정다슬", async (db) => attempt(db, `update public.persons set attendance_off = '교환학생중' where id = $1`, [mine]));
    assert.ok(long.error);
    const rows = await asUser(ctx, "권다움", async (db) => (await db.query(`select id, report_hidden, attendance_off from public.attendance_people()`)).rows);
    const r = rows.find((x) => x.id === mine);
    assert.deepEqual([r.report_hidden, r.attendance_off], [false, "교환"]);
  });
});

describe("캠퍼스 persons.campus", () => {
  it("운영자는 고치고, 다른 목장 리더는 못 고친다. 앞뒤 빈칸 · 31자는 막힌다", async () => {
    const p = (await ctx.db.query(`select p.id from public.persons p where p.group_id <> (select group_id from public.persons where name = '권다움') and p.status = 'active' limit 1`)).rows[0].id;
    const admin = await asUser(ctx, "정다슬", async (db) => attempt(db, `update public.persons set campus = '고대 이공캠' where id = $1 returning campus`, [p]), { commit: true });
    assert.equal(admin.error, null, admin.error ?? "");
    assert.equal(admin.rows[0].campus, "고대 이공캠");
    const other = await asUser(ctx, "권다움", async (db) => attempt(db, `update public.persons set campus = '다른 캠' where id = $1 returning campus`, [p]));
    assert.ok(other.error || other.rows.length === 0);
    const bad = await asUser(ctx, "정다슬", async (db) => attempt(db, `update public.persons set campus = ' 빈칸 ' where id = $1`, [p]));
    assert.ok(bad.error);
    const long = await asUser(ctx, "정다슬", async (db) => attempt(db, `update public.persons set campus = $2 where id = $1`, [p, "가".repeat(31)]));
    assert.ok(long.error);
  });
});
