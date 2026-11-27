/**
 * 07 §0 도입 공지의 두 약속 (2026-09-29)
 *
 * 1) "기록되기를 원하지 않는 분" — persons.status = 'opted_out'.
 *    목장에는 계속 오는데 앱에만 없는 상태다. 'left'(떠난 사람)와 섞지 않는다.
 *    · 보고서 작성 명단(open_report 뒤 화면·submit_report 완결성)에서 빠진다
 *    · 출석도 기도제목도 기록되지 않는다 — 그 사람 행은 submit_report 가 거부한다
 *    · 리더 화면에 이유가 뜨지 않는다 — 조용히 빠진다. 운영자가 따로 말한다
 *    · 운영자만 바꾼다 (set_person_recording). 리더·목사님은 거부
 *    · 명단 재도입이 이 상태를 되돌리지 않는다 (scripts/roster-import.mjs)
 * 2) "기록은 2년이 지나면 정리합니다" — app_meta.retention_months = 24 와 만료 조회 함수.
 *    삭제는 Step 9 에서 붙인다. 약속은 여기(DB)와 08 로드맵에 박혀 있다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let g3;
let latestWeek;

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  latestWeek = (await ctx.db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
});

after(async () => {
  await ctx?.db?.close?.();
});

async function personId(name) {
  return (await ctx.db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;
}

describe("기록 제외 — opted_out", () => {
  it("person_status 에 opted_out 이 있고 left 와 다르다 ★", async () => {
    const { rows } = await ctx.db.query(`select enum_range(null::public.person_status)::text[] as v`);
    assert.ok(rows[0].v.includes("opted_out"), rows[0].v.join(","));
    assert.ok(rows[0].v.includes("left"));
  });

  it("운영자만 바꿀 수 있다 — 리더·목사님은 거부 ★", async () => {
    const pid = await personId("서다온");
    for (const who of ["권다움", "임찬양"]) {
      const r = await asUser(ctx, who, (db) => attempt(db, `select public.set_person_recording($1, false)`, [pid]));
      assert.notEqual(r.error, null, `${who} 가 기록 제외를 바꿨다`);
      assert.equal(r.code, "42501", who);
    }
    await asUser(ctx, "정다슬", (db) => db.query(`select public.set_person_recording($1, false)`, [pid]), { commit: true });
    const { rows } = await ctx.db.query(`select status from public.persons where id = $1`, [pid]);
    assert.equal(rows[0].status, "opted_out");
  });

  it("보고서 완결성 검사에서 빠진다 — 그 사람 행이 없어도 제출된다 ★", async () => {
    // 3목장 최신 주 보고서에서 서다온 행을 지우고 제출해 본다. 다른 사람은 전부 채워져 있다.
    const pid = await personId("서다온");
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, latestWeek])).rows[0].id;
    await ctx.db.query(`delete from public.weekly_records where report_id = $1 and person_id = $2`, [rid, pid]);
    await ctx.db.query(`update public.reports set submitted_at = null, submitted_by = null where id = $1`, [rid]);
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select (public.submit_report($1, '[]'::jsonb) ->> 'submitted')::boolean as s`, [rid]), { commit: true });
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(r.rows[0].s, true, "기록 제외자가 비어 있어도 제출돼야 한다");
  });

  it("그 사람 행을 넣으려 하면 거부된다 — 출석도 기도제목도 기록되지 않는다 ★", async () => {
    const pid = await personId("서다온");
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, latestWeek])).rows[0].id;
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        rid,
        JSON.stringify([{ person_id: pid, expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: false } }]),
      ]));
    assert.notEqual(r.error, null, "기록 제외자의 행이 저장됐다");
    const { rows } = await ctx.db.query(`select count(*)::int as n from public.weekly_records where report_id = $1 and person_id = $2`, [rid, pid]);
    assert.equal(rows[0].n, 0);
  });

  it("리더가 명단 원본을 읽어도 이유 컬럼 같은 것은 없다 — 상태값 하나뿐", async () => {
    const cols = (await ctx.db.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'persons'`)).rows.map((r) => r.column_name);
    // 비고(note, 2026-10-28)는 교회 명단 엑셀의 일반 비고 칸이다(사용자 확인 — 민감한 내용 없음). 기록 제외 이유를 적는 칸은 여전히 없다
    // 출석 제외(attendance_off, 2026-11-17)는 출석부에서 결석을 세지 않는 사람의 두세 글자 표시(교환 · 군복무)다 — 기록 제외 이유가 아니고 1~4자로 막혀 있다
    assert.ok(!cols.some((c) => /reason|memo|opt_out_/.test(c) || (/note/.test(c) && c !== "note")), cols.join(","));
  });

  it("전체 명단(persons_public)에는 남는다 — 목장에는 계속 오는 사람이다", async () => {
    const pid = await personId("서다온");
    const rows = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select id from public.persons_public where id = $1`, [pid])).rows);
    assert.equal(rows.length, 1);
  });

  it("기록 제외로 바꿔도 과거 기록은 남는다 — 앞으로만 막는다 ★", async () => {
    // 서다온은 위에서 opted_out 이 됐다. 시드 4주 중 위 테스트가 지운 최신 주를 뺀 나머지가 남아 있어야 한다.
    const pid = await personId("서다온");
    const { rows } = await ctx.db.query(`select count(*)::int as n from public.weekly_records where person_id = $1`, [pid]);
    assert.ok(rows[0].n >= 3, `과거 기록이 사라졌다: ${rows[0].n}`);
  });

  it("되돌리면 다시 기록 대상이다", async () => {
    const pid = await personId("서다온");
    await asUser(ctx, "정다슬", (db) => db.query(`select public.set_person_recording($1, true)`, [pid]), { commit: true });
    const { rows } = await ctx.db.query(`select status from public.persons where id = $1`, [pid]);
    assert.equal(rows[0].status, "active");
  });

  it("휴면(dormant)·이탈(left) 인 사람에게는 쓰지 않는다", async () => {
    const pid = await personId("서다온");
    await ctx.db.query(`update public.persons set status = 'left' where id = $1`, [pid]);
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.set_person_recording($1, false)`, [pid]));
    assert.notEqual(r.error, null);
    await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [pid]);
  });
});

describe("2년 보관 — 약속이 DB 에 박혀 있다", () => {
  it("app_meta.retention_months = 24 ★", async () => {
    const { rows } = await ctx.db.query(`select value from public.app_meta where key = 'retention_months'`);
    assert.equal(rows[0]?.value, "24");
  });

  it("만료된 주간기록 수를 돌려주는 함수가 있고, 운영자·목사님만 부른다", async () => {
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select * from public.records_past_retention()`));
    assert.equal(r.error, null, r.error ?? "");
    assert.equal(Number(r.rows[0].expired_records), 0, "시드는 4주치라 만료된 것이 없다");
    assert.ok(r.rows[0].cutoff_week, "기준 주차가 나와야 한다");
    const leader = await asUser(ctx, "권다움", (db) => attempt(db, `select * from public.records_past_retention()`));
    assert.equal(leader.error, null);
    assert.equal(leader.rows.length, 0, "리더에게는 0행");
  });

  it("24개월 넘은 기록은 만료로 센다", async () => {
    const pid = await personId("고은결");
    const author = (await ctx.db.query(`select id from public.users where role = 'leader' limit 1`)).rows[0].id;
    const old = "2024-01-07";
    const rid = (await ctx.db.query(
      `insert into public.reports (group_id, week_key, submitted_at, submitted_by) values ($1, $2, $2::date::timestamptz, $3) returning id`,
      [g3, old, author])).rows[0].id;
    await ctx.db.query(
      `insert into public.weekly_records (report_id, person_id, author_id, week_key, group_id_at_write, worship_attended, group_meeting_attended)
       values ($1, $2, $3, $4, $5, true, true)`, [rid, pid, author, old, g3]);
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select * from public.records_past_retention()`));
    assert.equal(Number(r.rows[0].expired_records), 1);
    await ctx.db.query(`delete from public.weekly_records where report_id = $1`, [rid]);
    await ctx.db.query(`delete from public.reports where id = $1`, [rid]);
  });
});
