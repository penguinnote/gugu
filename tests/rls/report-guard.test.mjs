/**
 * 보고서 쓰기 막기 (2026-11-04)
 *
 * 리더가 API 를 직접 불러 보고서 · 출석 기록을 지어내지 못하게 했다 — 두 표의 쓰기 권한을 거두고
 * open_report · submit_report 만 소유자 권한으로 쓴다. 여기서는 진짜 '오늘' 기준으로 본다(이번 주를 옮기지 않는다).
 * 승인 대기 목록의 이메일도 여기서 본다.
 *
 * 시드 기준: 3목장 리더 권다움 · 7목장 / 운영자 정다슬
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAuthUser, asUser, attempt, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;
let g3;
let g7;
let thisWeek;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  g7 = (await ctx.db.query(`select id from public.groups where number = 7`)).rows[0].id;
  thisWeek = (await ctx.db.query(`select public.kst_current_week()::text as w`)).rows[0].w;
});

after(async () => {
  await ctx?.db?.close?.();
});

const plusWeeks = (week, n) => {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};

describe("보고서는 함수로만 쓴다", () => {
  it("다음 주 보고서는 열 수 없다 — 미래 주차에 제출해 열매를 받지 못한다 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date)`, [g3, plusWeeks(thisWeek, 1)]));
    assert.match(r.error ?? "", /아직 오지 않은 주차/);
  });

  it("이번 주 보고서는 연다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date) as id`, [g3, thisWeek]));
    assert.equal(r.error, null, r.error);
    assert.ok(r.rows[0].id);
  });

  it("남의 목장 보고서는 열 수 없다 ★", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date)`, [g7, thisWeek]));
    assert.match(r.error ?? "", /권한/);
  });

  it("남의 목장 보고서는 제출할 수 없다 — id 를 알아도 ★", async () => {
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 order by week_key desc limit 1`, [g7])).rows[0].id;
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, '[]'::jsonb)`, [rid]));
    assert.match(r.error ?? "", /찾을 수 없습니다/);
  });

  it("운영자(명단 밖)와 목사님은 보고서를 열지 못한다", async () => {
    for (const who of ["정다슬", "임찬양"]) {
      const r = await asUser(ctx, who, (db) => attempt(db, `select public.open_report($1, $2::date)`, [g3, thisWeek]));
      assert.match(r.error ?? "", /권한/, who);
    }
  });
});

describe("지난 주는 이번 주와 그 앞 3주까지만 새로 쓴다 (2026-11-04)", () => {
  it("4주 전 보고서는 새로 열 수 없다 — 빈 행도 생기지 않는다 ★", async () => {
    const week = plusWeeks(thisWeek, -4);
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date)`, [g3, week]));
    assert.match(r.error ?? "", /지난 주차는 새로 쓸 수 없습니다/);
    const n = (await ctx.db.query(`select count(*)::int as n from public.reports where group_id = $1 and week_key = $2`, [g3, week])).rows[0].n;
    assert.equal(n, 0);
  });

  it("3주 전 보고서는 새로 연다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date) as id`, [g3, plusWeeks(thisWeek, -3)]));
    assert.equal(r.error, null, r.error);
  });

  it("오래된 주라도 이미 있는 보고서는 열고, 처음 제출은 막고, 이미 낸 것은 고친다", async () => {
    const empty = plusWeeks(thisWeek, -6);
    const done = plusWeeks(thisWeek, -8);
    await ctx.db.query(`insert into public.reports (group_id, week_key) values ($1, $2)`, [g3, empty]);
    const doneId = (await ctx.db.query(
      `insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late)
       select $1, $2, now(), p.user_id, true from public.persons p where p.name = '권다움' returning id`, [g3, done])).rows[0].id;

    const opened = await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date) as id`, [g3, empty]));
    assert.equal(opened.error, null, opened.error);
    const sub = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, '[]'::jsonb)`, [opened.rows[0].id]));
    assert.match(sub.error ?? "", /너무 지난 주차는 제출할 수 없습니다/);

    const fix = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, '[]'::jsonb, '고침', true) as r`, [doneId]));
    // 명단 전원의 기록이 없는 주라 완결성 검사에는 걸린다 — 막힌 이유가 '너무 지난 주차' 가 아니면 된다
    assert.doesNotMatch(fix.error ?? "", /너무 지난/);
  });
});

describe("신청 화면 리더 목록", () => {
  it("생년월일은 주지 않고 출생년도만 준다 — 미승인 가입자도 부를 수 있어서 ★", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "google", "처음온사람");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const rows = await asAuthUser(ctx, authId, async (db) => (await db.query(`select * from public.list_claimable_persons($1)`, [g3])).rows);
    assert.ok(rows.length > 0);
    for (const r of rows) assert.equal("birth_date" in r, false, "생년월일 칸이 남아 있다");
    assert.ok(rows.some((r) => typeof r.birth_year === "number"), "출생년도가 하나도 없다");
  });
});

describe("승인 대기 목록의 이메일", () => {
  it("운영자는 신청자의 로그인 이메일을 본다 — 이름은 본인이 바꿀 수 있어서", async () => {
    const authId = await createUnlinkedAuthUser(ctx, "google", "새목사");
    await asAuthUser(ctx, authId, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const req = await asAuthUser(ctx, authId, (db) => attempt(db, `select public.request_role('pastor')`), { commit: true });
    assert.equal(req.error, null, req.error);
    const email = (await ctx.db.query(`select email from auth.users where id = $1`, [authId])).rows[0].email;

    const rows = await asUser(ctx, "정다슬", async (db) => (await db.query(`select applicant_name, applicant_email from public.list_pending_applications()`)).rows);
    const mine = rows.find((r) => r.applicant_email === email);
    assert.ok(mine, "신청자 이메일이 목록에 없다");
    assert.equal(mine.applicant_name, "새목사");
  });
});

describe("보고서는 그 주 명단으로 (2026-11-05)", () => {
  /** 3목장의 지금 활동 중인 사람 전원 — 출석 · 기도제목을 채운 행 */
  async function fullRows(joinedBy) {
    const { rows } = await ctx.db.query(
      `select id from public.persons where group_id = $1 and status = 'active' and joined_at <= $2::date`, [g3, joinedBy]);
    return rows.map((r) => ({ person_id: r.id, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: true, prayer_request: "기도제목" } }));
  }
  const newcomer = async (joined) =>
    (await ctx.db.query(
      `insert into public.persons (name, group_id, group_role, status, joined_at) values ('새친구', $1, 'member', 'active', $2) returning id`, [g3, joined])).rows[0].id;

  it("그 주가 끝난 뒤 들어온 사람은 그 주 첫 제출에 없어도 된다 ★", async () => {
    const week = plusWeeks(thisWeek, -2);
    const late = await newcomer(plusWeeks(thisWeek, 0));
    // 시드가 최근 4주를 이미 채워 두었다 — 이 주는 비우고 처음부터 낸다
    await ctx.db.query(`delete from public.events where report_id in (select id from public.reports where group_id = $1 and week_key = $2)`, [g3, week]);
    await ctx.db.query(`delete from public.reports where group_id = $1 and week_key = $2`, [g3, week]);
    try {
      const rid = (await asUser(ctx, "권다움", (db) => attempt(db, `select public.open_report($1, $2::date) as id`, [g3, week]), { commit: true })).rows[0].id;
      const rows = (await fullRows(plusWeeks(week, 1))).filter((r) => r.person_id !== late);
      const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, $2::jsonb) as r`, [rid, JSON.stringify(rows)]), { commit: true });
      assert.equal(r.error, null, r.error);
      assert.equal(r.rows[0].r.submitted, true);
      // 그 사람의 행은 그 주 보고서에 넣을 수도 없다
      const bad = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, $2::jsonb)`, [rid, JSON.stringify([
        { person_id: late, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: false } }])]));
      assert.match(bad.error ?? "", /명단에 없는 사람/);
    } finally {
      await ctx.db.query(`delete from public.persons where id = $1`, [late]);
    }
  });

  it("이미 낸 보고서를 고칠 때 그 뒤 들어온 사람을 채우라고 하지 않는다 ★", async () => {
    const week = plusWeeks(thisWeek, -1); // 시드에서 이미 제출된 주
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2 and submitted_at is not null`, [g3, week])).rows[0].id;
    const added = await newcomer(plusWeeks(week, 0)); // 그 주 안에 들어왔지만 제출 뒤에 명단에 넣었다
    try {
      const fix = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, '[]'::jsonb, '고침', true) as r`, [rid]), { commit: true });
      assert.equal(fix.error, null, fix.error);
    } finally {
      await ctx.db.query(`delete from public.persons where id = $1`, [added]);
    }
  });

  it("기록이 있는 사람은 그 뒤 떠났어도 그 주 기록을 고칠 수 있다", async () => {
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, plusWeeks(thisWeek, -1)])).rows[0].id;
    const row = (await ctx.db.query(
      `select w.person_id, w.updated_at from public.weekly_records w join public.persons p on p.id = w.person_id
        where w.report_id = $1 and p.group_role = 'member' limit 1`, [rid])).rows[0];
    await ctx.db.query(`update public.persons set status = 'left' where id = $1`, [row.person_id]);
    try {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.submit_report($1, $2::jsonb) as r`, [rid, JSON.stringify([
        { person_id: row.person_id, expected_updated_at: row.updated_at, fields: { one_on_one_contacted: true } }])]));
      assert.equal(r.error, null, r.error);
      assert.deepEqual(r.rows[0].r.conflicts, []);
    } finally {
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [row.person_id]);
    }
  });
});

describe("옮겨 간 사람의 이름 (2026-11-06)", () => {
  it("기록을 쓴 목장의 리더는 옮겨 간 사람의 이름을 받고, 다른 리더는 못 받는다 ★", async () => {
    const row = (await ctx.db.query(
      `select w.person_id from public.weekly_records w join public.persons p on p.id = w.person_id
        where w.group_id_at_write = $1 and p.group_role = 'member' limit 1`, [g3])).rows[0];
    const orig = (await ctx.db.query(`select group_id from public.persons where id = $1`, [row.person_id])).rows[0].group_id;
    await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [row.person_id, g7]);
    try {
      const plain = await asUser(ctx, "권다움", async (db) => (await db.query(`select id from public.persons where id = $1`, [row.person_id])).rows);
      assert.equal(plain.length, 0, "명단으로는 안 보인다(옮겨 갔다)");
      const named = await asUser(ctx, "권다움", async (db) => (await db.query(`select * from public.recorded_person_names($1::uuid[])`, [[row.person_id]])).rows);
      assert.equal(named.length, 1);
      const g7leader = (await ctx.db.query(
        `select p.name from public.persons p join public.users u on u.id = p.user_id where p.group_id = $1 and p.group_role = 'leader' limit 1`, [g7])).rows[0]?.name;
      if (g7leader) {
        const other = await asUser(ctx, "정다슬", async (db) => (await db.query(`select * from public.recorded_person_names($1::uuid[])`, [[row.person_id]])).rows);
        assert.equal(other.length, 0, "기록을 못 읽는 사람(운영자)은 못 받는다");
      }
    } finally {
      await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [row.person_id, orig]);
    }
  });
});

describe("특이사항 덮어쓰기 막기 (2026-11-06)", () => {
  it("연 뒤에 다른 리더가 바꿨으면 덮어쓰지 않고 알린다 ★", async () => {
    const rid = (await ctx.db.query(`select id, note from public.reports where group_id = $1 and submitted_at is not null order by week_key desc limit 1`, [g3])).rows[0];
    const base = rid.note;
    const a = await asUser(ctx, "권다움", (db) => attempt(db,
      `select public.submit_report($1, '[]'::jsonb, '첫 리더 글', true, $2, true) as r`, [rid.id, base]), { commit: true });
    assert.equal(a.error, null, a.error);
    assert.equal(a.rows[0].r.note_conflict ?? false, false);
    const b = await asUser(ctx, "김빛나", (db) => attempt(db,
      `select public.submit_report($1, '[]'::jsonb, '둘째 리더 글', true, $2, true) as r`, [rid.id, base]), { commit: true });
    assert.equal(b.error, null, b.error);
    assert.equal(b.rows[0].r.note_conflict, true);
    assert.equal(b.rows[0].r.note, "첫 리더 글");
    const now = (await ctx.db.query(`select note from public.reports where id = $1`, [rid.id])).rows[0].note;
    assert.equal(now, "첫 리더 글", "덮어쓰지 않았다");
  });
});
