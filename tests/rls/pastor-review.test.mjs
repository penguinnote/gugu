/**
 * Step 5 — 목사님 화면과 피드백 경로 (2026-09-28)
 *
 * 성공 기준은 "잘 보이는가" 가 아니라 "본 흔적이 리더에게 닿는가" 다.
 *
 *   report_reviews   보고서(목장×주차) 하나에 행 하나. first_read_at 은 고정, last_read_at·
 *                    read_count 는 갱신. stamp 는 하나("기도하겠습니다") — 다시 누르면 취소.
 *                    머문 시간 = stamped_at - last_read_at (같은 방문). 연타 감지용, 03 §2.2c.
 *   읽음             상세 화면의 서버 렌더 1회 = mark_report_read() 호출. 목록·프리페치는 아니다.
 *   경계             목사님은 전체를 읽고 쓴다. 그 목장 리더는 자기 목장 review 를 읽기만 한다.
 *                    다른 목장 리더·미승인은 0행. 리더의 스탬프 쓰기는 거부(42501).
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, asAuthUser, attempt, createTestDb, createUnlinkedAuthUser } from "./harness.mjs";

let ctx;
let report3; // 다솜(3번) 목장, 최신 주
let report7; // 7번 목장, 최신 주
let latestWeek;

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  latestWeek = (await db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  const g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  const g7 = (await db.query(`select id from public.groups where number = 7`)).rows[0].id;
  report3 = (await db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, latestWeek])).rows[0].id;
  report7 = (await db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g7, latestWeek])).rows[0].id;
});

after(async () => {
  await ctx?.db?.close?.();
});

// ===========================================================================

describe("목사님은 전체를 읽는다 — 기존 정책", () => {
  it("12개 목장의 이번 주 보고서와 본문(기도제목)을 읽는다 ★", async () => {
    const seen = await asUser(ctx, "임찬양", async (db) => ({
      groups: (await db.query(`select count(distinct group_id)::int as n from public.reports where week_key = $1`, [latestWeek])).rows[0].n,
      records: (await db.query(`select count(*)::int as n from public.weekly_records_visible where week_key = $1`, [latestWeek])).rows[0].n,
      prayers: (await db.query(`select count(*)::int as n from public.weekly_records_visible where week_key = $1 and prayer_request is not null`, [latestWeek])).rows[0].n,
    }));
    assert.equal(seen.groups, 12);
    assert.equal(seen.records, 80);
    assert.ok(seen.prayers > 0, "본문(기도제목)이 보여야 한다");
  });

  it("다른 목장 리더와 미승인 계정은 그 보고서에 0행이다", async () => {
    const leader = await asUser(ctx, "노해찬", async (db) =>
      (await db.query(`select count(*)::int as n from public.weekly_records_visible where report_id = $1`, [report3])).rows[0].n);
    assert.equal(leader, 0);
    const auth = await createUnlinkedAuthUser(ctx, "google", "미승인");
    await asAuthUser(ctx, auth, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const pending = await asAuthUser(ctx, auth, async (db) => ({
      reports: (await db.query(`select count(*)::int as n from public.reports`)).rows[0].n,
      records: (await db.query(`select count(*)::int as n from public.weekly_records_visible`)).rows[0].n,
    }));
    assert.deepEqual(pending, { reports: 0, records: 0 });
  });
});

// ===========================================================================

describe("읽음 — 상세를 연 것만", () => {
  it("목사님이 상세를 열면(mark_report_read) 행이 생기고 첫 열람 시각이 남는다 ★", async () => {
    const before = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(`select count(*)::int as n from public.report_reviews where report_id = $1`, [report3])).rows[0].n);
    assert.equal(before, 0, "열기 전에는 행이 없다");

    await asUser(ctx, "임찬양", (db) => db.query(`select public.mark_report_read($1)`, [report3]), { commit: true });

    const row = (await ctx.db.query(`select first_read_at, last_read_at, read_count, stamp from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.ok(row, "review 행이 생겨야 한다");
    assert.equal(row.read_count, 1);
    assert.equal(row.stamp, null);
    assert.equal(String(row.first_read_at), String(row.last_read_at));
  });

  it("다시 열면 last_read_at·read_count 만 오르고 first_read_at 은 고정이다", async () => {
    const first = (await ctx.db.query(`select first_read_at from public.report_reviews where report_id = $1`, [report3])).rows[0].first_read_at;
    await ctx.db.query(`update public.report_reviews set last_read_at = last_read_at - interval '1 hour', first_read_at = first_read_at - interval '1 hour' where report_id = $1`, [report3]);
    const fixed = (await ctx.db.query(`select first_read_at from public.report_reviews where report_id = $1`, [report3])).rows[0].first_read_at;
    await asUser(ctx, "임찬양", (db) => db.query(`select public.mark_report_read($1)`, [report3]), { commit: true });
    const row = (await ctx.db.query(`select first_read_at, last_read_at, read_count from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.read_count, 2);
    assert.equal(String(row.first_read_at), String(fixed), "첫 열람 시각이 바뀌었다");
    assert.ok(new Date(row.last_read_at) > new Date(row.first_read_at));
    void first;
  });

  it("목록을 읽는 것(reports·weekly_records 조회)은 읽음이 아니다", async () => {
    await asUser(ctx, "임찬양", async (db) => {
      await db.query(`select id from public.reports where id = $1`, [report7]);
      await db.query(`select id from public.weekly_records_visible where report_id = $1`, [report7]);
    });
    const n = (await ctx.db.query(`select count(*)::int as n from public.report_reviews where report_id = $1`, [report7])).rows[0].n;
    assert.equal(n, 0);
  });

  it("리더는 읽음을 기록할 수 없다", async () => {
    const r = await asUser(ctx, "권다움", (db) => attempt(db, `select public.mark_report_read($1)`, [report3]));
    assert.notEqual(r.error, null);
    assert.equal(r.code, "42501");
  });

  it("미제출 보고서는 읽음으로 표시할 수 없다", async () => {
    // 최신 주보다 뒤의 새 보고서 = 미제출
    const g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
    const { rows } = await ctx.db.query(
      `insert into public.reports (group_id, week_key) values ($1, ($2::date + 7)) returning id`, [g3, latestWeek]);
    const r = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.mark_report_read($1)`, [rows[0].id]));
    assert.notEqual(r.error, null);
    assert.equal(r.code, "22023");
    await ctx.db.query(`delete from public.reports where id = $1`, [rows[0].id]);
  });
});

// ===========================================================================

describe("스탬프 — 한 탭, 한 목장에 하나", () => {
  it("목사님이 스탬프를 찍는다 ★", async () => {
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report3]), { commit: true });
    const row = (await ctx.db.query(`select stamp, stamped_at from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.stamp, "pray");
    assert.ok(row.stamped_at);
  });

  it("같은 것을 다시 누르면 취소된다 — 스탬프는 하나뿐이다", async () => {
    const { rows: enumRows } = await ctx.db.query(`select enum_range(null::public.report_stamp)::text[] as v`);
    assert.deepEqual(enumRows[0].v, ["pray"], "쓰지 않는 값은 남기지 않는다");
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report3]), { commit: true });
    let row = (await ctx.db.query(`select stamp, stamped_at from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.stamp, null, "같은 스탬프를 다시 누르면 취소");
    assert.ok(row.stamped_at, "취소도 시각을 남긴다");
    // 다시 찍어 둔다 — 아래 테스트가 쓴다
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report3]), { commit: true });
    row = (await ctx.db.query(`select stamp from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.stamp, "pray");
  });

  it("머문 시간은 컬럼 없이 잰다 — 같은 방문에서 stamped_at ≥ last_read_at", async () => {
    // 상세를 열면(last_read_at 갱신) 뒤에 스탬프가 찍힌다. 그 차이가 그 목장에 머문 시간이다(03 §2.2c).
    await asUser(ctx, "임찬양", (db) => db.query(`select public.mark_report_read($1)`, [report3]), { commit: true });
    await new Promise((r) => setTimeout(r, 20));
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report3]), { commit: true }); // 취소
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report3]), { commit: true }); // 다시
    const row = (await ctx.db.query(
      `select extract(epoch from (stamped_at - last_read_at)) as dwell, extract(epoch from (stamped_at - first_read_at)) as since_first
         from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.ok(Number(row.dwell) >= 0, "스탬프 시각이 마지막 열람보다 앞설 수 없다");
    assert.ok(Number(row.since_first) >= Number(row.dwell), "첫 열람 기준 시간은 방문 기준보다 길거나 같다");
  });

  it("읽지 않은 보고서에 스탬프를 찍으면 읽음도 함께 남는다 (상세 안에서만 찍을 수 있으므로)", async () => {
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_stamp($1, 'pray')`, [report7]), { commit: true });
    const row = (await ctx.db.query(`select stamp, first_read_at, read_count from public.report_reviews where report_id = $1`, [report7])).rows[0];
    assert.equal(row.stamp, "pray");
    assert.ok(row.first_read_at);
    assert.equal(row.read_count, 1);
  });

  it("리더의 스탬프 쓰기는 거부된다 — RPC 도, 직접 UPDATE 도 ★", async () => {
    const rpc = await asUser(ctx, "권다움", (db) => attempt(db, `select public.set_report_stamp($1, 'pray')`, [report3]));
    assert.notEqual(rpc.error, null);
    assert.equal(rpc.code, "42501");
    const direct = await asUser(ctx, "권다움", (db) =>
      attempt(db, `update public.report_reviews set stamp = 'pray' where report_id = $1`, [report3]));
    // 정책이 없으면 0행, 권한이 없으면 42501 — 어느 쪽이든 바뀌지 않는다
    if (direct.error === null) assert.equal(direct.affected, 0);
    const row = (await ctx.db.query(`select stamp from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.stamp, "pray");
    const del = await asUser(ctx, "권다움", (db) => attempt(db, `delete from public.report_reviews where report_id = $1`, [report3]));
    if (del.error === null) assert.equal(del.affected, 0);
  });

  it("운영자(명단 밖)는 review 를 보지도 쓰지도 못한다 — 본문을 못 보는 원칙", async () => {
    const seen = await asUser(ctx, "정다슬", async (db) =>
      (await db.query(`select count(*)::int as n from public.report_reviews`)).rows[0].n);
    assert.equal(seen, 0);
    const r = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.set_report_stamp($1, 'pray')`, [report3]));
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================

describe("리더 쪽 — 본 흔적이 닿는다", () => {
  it("그 목장 리더는 자기 목장의 읽음·스탬프를 본다 ★", async () => {
    const rows = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select report_id, first_read_at, stamp from public.report_reviews`)).rows);
    assert.equal(rows.length, 1, "자기 목장 review 하나만");
    assert.equal(rows[0].report_id, report3);
    assert.equal(rows[0].stamp, "pray");
    assert.ok(rows[0].first_read_at);
  });

  it("다른 목장 리더에게는 남의 목장 읽음·스탬프가 0행이다 ★", async () => {
    const rows = await asUser(ctx, "노해찬", async (db) =>
      (await db.query(`select report_id from public.report_reviews`)).rows);
    assert.deepEqual(rows.map((r) => r.report_id), [report7], "7번 목장 것만 보여야 한다");
  });

  it("미승인 계정은 0행이다", async () => {
    const auth = await createUnlinkedAuthUser(ctx, "google", "대기");
    await asAuthUser(ctx, auth, (db) => db.query(`select public.ensure_user()`), { commit: true });
    const n = await asAuthUser(ctx, auth, async (db) =>
      (await db.query(`select count(*)::int as n from public.report_reviews`)).rows[0].n);
    assert.equal(n, 0);
  });
});

// ===========================================================================

describe("목사님 한마디 (2026-11-10) — 선택, 200자까지", () => {
  it("목사님이 쓰면 그 목장 리더가 읽고, 다른 목장 리더 · 운영자는 못 본다 ★", async () => {
    const out = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(`select public.set_report_note($1, $2) as n`, [report3, "  이번 주도 수고 많았어요. 함께 기도할게요!  "])).rows[0].n, { commit: true });
    assert.equal(out, "이번 주도 수고 많았어요. 함께 기도할게요!", "앞뒤 칸은 다듬는다");
    const mine = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select note, note_at from public.report_reviews where report_id = $1`, [report3])).rows[0]);
    assert.equal(mine.note, "이번 주도 수고 많았어요. 함께 기도할게요!");
    assert.ok(mine.note_at);
    const other = await asUser(ctx, "노해찬", async (db) =>
      (await db.query(`select count(*)::int as n from public.report_reviews where report_id = $1`, [report3])).rows[0].n);
    assert.equal(other, 0);
    const admin = await asUser(ctx, "정다슬", async (db) =>
      (await db.query(`select count(*)::int as n from public.report_reviews where note is not null`)).rows[0].n);
    assert.equal(admin, 0);
  });

  it("고쳐 쓰고, 비우면 지워진다 — 도장 · 읽음은 그대로", async () => {
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_note($1, $2)`, [report3, "고친 한마디"]), { commit: true });
    assert.equal((await ctx.db.query(`select note from public.report_reviews where report_id = $1`, [report3])).rows[0].note, "고친 한마디");
    const cleared = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(`select public.set_report_note($1, $2) as n`, [report3, "   "])).rows[0].n, { commit: true });
    assert.equal(cleared, null);
    const row = (await ctx.db.query(`select note, note_at, first_read_at from public.report_reviews where report_id = $1`, [report3])).rows[0];
    assert.equal(row.note, null);
    assert.ok(row.note_at, "지운 시각은 남는다");
    assert.ok(row.first_read_at);
  });

  it("200자를 넘으면 거부, 리더 · 운영자의 쓰기는 거부(RPC · 직접 UPDATE) ★", async () => {
    const long = await asUser(ctx, "임찬양", (db) => attempt(db, `select public.set_report_note($1, $2)`, [report3, "가".repeat(201)]));
    assert.equal(long.code, "22023");
    const leader = await asUser(ctx, "권다움", (db) => attempt(db, `select public.set_report_note($1, $2)`, [report3, "내가 씀"]));
    assert.equal(leader.code, "42501");
    const direct = await asUser(ctx, "권다움", (db) => attempt(db, `update public.report_reviews set note = '내가 씀' where report_id = $1`, [report3]));
    if (direct.error === null) assert.equal(direct.affected, 0);
    const admin = await asUser(ctx, "정다슬", (db) => attempt(db, `select public.set_report_note($1, $2)`, [report3, "운영자"]));
    assert.equal(admin.code, "42501");
  });

  it("아직 읽음이 없는 보고서에 쓰면 읽음도 생긴다", async () => {
    const g5 = (await ctx.db.query(`select id from public.groups where number = 5`)).rows[0].id;
    const r5 = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2 and submitted_at is not null`, [g5, latestWeek])).rows[0]?.id;
    if (!r5) return; // 시드에 그 주 5번 목장 제출이 없으면 건너뛴다
    await ctx.db.query(`delete from public.report_reviews where report_id = $1`, [r5]);
    await asUser(ctx, "임찬양", (db) => db.query(`select public.set_report_note($1, $2)`, [r5, "처음 남기는 말"]), { commit: true });
    const row = (await ctx.db.query(`select note, read_count from public.report_reviews where report_id = $1`, [r5])).rows[0];
    assert.equal(row.note, "처음 남기는 말");
    assert.equal(row.read_count, 1);
  });
});
