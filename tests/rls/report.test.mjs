/**
 * 주간 보고서 제출 테스트 (Step 4)
 *
 * submit_report 는 SECURITY DEFINER 다(2026-11-04) — 함수 안에서 is_leader_of 와 이번 주까지를 직접 본다.
 * 그래서 "다른 목장의 보고서를 제출할 수 없다" 는 화면이 아니라 여기서 검증한다(report-guard.test.mjs 도).
 *
 * 시드 기준: 3목장 = 권다움(목장장)·김빛나·도하린·류지호(리더, 류지호는 계정 없음) / 고은결·남시현·서다온(청년, 계정 없음)
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb, setCurrentWeek } from "./harness.mjs";

let ctx;
let g3;
let latestWeek;       // 시드의 최근 주차 (w3)
let report3;          // 3목장 최근 주차 보고서 id
const pid = {};

before(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  g3 = (await db.query(`select id from public.groups where number = 3`)).rows[0].id;
  latestWeek = (await db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  // 시드의 다음 주들(미래)을 '마감 전' 주로 쓴다 — 이번 주를 3주 뒤로 옮겨 둔다(2026-11-04 보고서 쓰기 막기)
  await setCurrentWeek(ctx, sundayOffset(latestWeek, 3));
  report3 = (
    await db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, latestWeek])
  ).rows[0].id;
  for (const name of ["권다움", "김빛나", "고은결", "남시현", "서다온", "도하린", "류지호"]) {
    pid[name] = (await db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;
  }

  // (B) 검증용 탐침 — prayer_request 가 SET 절에 들어간 UPDATE 에서만 발화한다.
  // Postgres 의 UPDATE OF 트리거는 값이 바뀌었는지가 아니라 컬럼이 SET 에
  // 나열됐는지를 본다. 그래서 "기도제목 컬럼에 UPDATE 가 나갔는가" 를 정확히 잰다.
  await db.exec(`
    create table public.probe_hits (person_id uuid, at timestamptz default now());
    grant all on public.probe_hits to authenticated;
    create or replace function public.probe_prayer_update() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.probe_hits (person_id) values (new.person_id);
      return new;
    end $$;
    create trigger probe_prayer before update of prayer_request on public.weekly_records
      for each row execute function public.probe_prayer_update();
  `);
});

after(async () => {
  await ctx?.db?.close?.();
});

async function loadedUpdatedAt(personId) {
  const { rows } = await ctx.db.query(
    `select updated_at::text as t from public.weekly_records where report_id = $1 and person_id = $2`,
    [report3, personId],
  );
  return rows[0]?.t ?? null;
}

function sundayOffset(weekKey, weeks) {
  const d = new Date(weekKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// ===========================================================================
describe("다른 목장 접근 차단 — RLS 가 함수 안에서도 막는다 ★", () => {
  it("7목장 리더는 3목장 보고서를 제출할 수 없다", async () => {
    const r = await asUser(ctx, "노해찬", (db) =>
      attempt(
        db,
        `select public.submit_report($1, $2::jsonb)`,
        [report3, JSON.stringify([{ person_id: pid["고은결"], expected_updated_at: null, fields: { worship_attended: false } }])],
      ),
    );
    assert.notEqual(r.error, null, "다른 목장 보고서 제출이 통했다");
    assert.match(r.error, /보고서를 찾을 수 없습니다/);
  });

  it("7목장 리더는 3목장 보고서를 열 수도 없다", async () => {
    const r = await asUser(ctx, "노해찬", (db) =>
      attempt(db, `select public.open_report($1, $2::date)`, [g3, latestWeek]),
    );
    assert.notEqual(r.error, null, "다른 목장 보고서 열기가 통했다");
  });

  it("7목장 리더의 접속 신호는 3목장 보고서에 남지 않는다", async () => {
    const r = await asUser(ctx, "노해찬", (db) =>
      attempt(db, `select * from public.touch_report_presence($1)`, [report3]),
    );
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================
describe("(A) 같은 목장 리더는 본문을 그대로 본다", () => {
  it("다른 리더가 쓴 기도제목을 같은 목장 리더가 읽는다 ★", async () => {
    const me = (await ctx.db.query(`select id from public.users where name = '권다움'`)).rows[0].id;
    // 시드는 주차마다 작성자를 돌려 배정한다(3목장은 계정 있는 리더 3명). 남이 쓴 3목장 행 하나를 고른다.
    const row = await asUser(ctx, "권다움", async (db) =>
      (await db.query(
        `select prayer_request, author_id from public.weekly_records_visible
          where group_id_at_write = $1 and author_id <> $2 and prayer_request is not null limit 1`,
        [g3, me],
      )).rows[0]);
    assert.ok(row, "남이 쓴 행이 있어야 한다");
    assert.notEqual(row.author_id, me, "다른 리더가 쓴 행이어야 의미가 있다");
    assert.ok(row.prayer_request && row.prayer_request.length > 0, "기도제목이 보여야 한다");
  });

  it("다른 목장 리더에게는 행 자체가 없다", async () => {
    const n = await asUser(ctx, "노해찬", async (db) =>
      (await db.query(`select id from public.weekly_records_visible where report_id = $1`, [report3])).rows.length);
    assert.equal(n, 0);
  });
});

// ===========================================================================
describe("(B) 바뀐 필드만 SET 에 넣는다", () => {
  it("출석만 고치면 기도제목 컬럼에 UPDATE 가 나가지 않는다 ★", async () => {
    await ctx.db.query(`delete from public.probe_hits`);
    const expected = await loadedUpdatedAt(pid["남시현"]);
    const r = await asUser(
      ctx, "권다움",
      (db) => attempt(db, `select public.submit_report($1, $2::jsonb) as r`, [
        report3,
        JSON.stringify([{ person_id: pid["남시현"], expected_updated_at: expected,
          fields: { worship_attended: true, group_meeting_attended: false } }]),
      ]),
      { commit: true },
    );
    assert.equal(r.error, null, r.error);
    const hits = (await ctx.db.query(`select count(*)::int as n from public.probe_hits`)).rows[0].n;
    assert.equal(hits, 0, "기도제목 컬럼이 SET 절에 들어갔다");
  });

  it("기도제목을 고치면 그때는 UPDATE 가 나간다", async () => {
    await ctx.db.query(`delete from public.probe_hits`);
    const expected = await loadedUpdatedAt(pid["남시현"]);
    const r = await asUser(
      ctx, "권다움",
      (db) => attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        report3,
        JSON.stringify([{ person_id: pid["남시현"], expected_updated_at: expected,
          fields: { prayer_request: "새 기도제목" } }]),
      ]),
      { commit: true },
    );
    assert.equal(r.error, null, r.error);
    const hits = (await ctx.db.query(`select count(*)::int as n from public.probe_hits`)).rows[0].n;
    assert.equal(hits, 1);
    const row = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select prayer_request, prayer_status, author_id from public.weekly_records_visible where report_id = $1 and person_id = $2`, [report3, pid["남시현"]])).rows[0]);
    assert.equal(row.prayer_request, "새 기도제목");
    assert.equal(row.prayer_status, "ongoing", "지난 기록이 있으므로 진행 중");
  });
});

// ===========================================================================
describe("충돌 — 행 단위 낙관적 잠금", () => {
  it("불러온 뒤 남이 고친 행은 저장되지 않고 충돌로 돌아온다", async () => {
    const stale = await loadedUpdatedAt(pid["서다온"]);

    // 김빛나가 먼저 저장한다
    const first = await asUser(ctx, "김빛나",
      (db) => attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        report3, JSON.stringify([{ person_id: pid["서다온"], expected_updated_at: stale, fields: { one_on_one_contacted: true } }]),
      ]), { commit: true });
    assert.equal(first.error, null, first.error);

    // 권다움은 옛 updated_at 을 들고 온다
    const second = await asUser(ctx, "권다움",
      (db) => attempt(db, `select public.submit_report($1, $2::jsonb) as r`, [
        report3, JSON.stringify([{ person_id: pid["서다온"], expected_updated_at: stale, fields: { one_on_one_contacted: false } }]),
      ]), { commit: true });
    assert.equal(second.error, null, second.error);
    const res = second.rows[0].r;
    assert.equal(res.submitted, false);
    assert.deepEqual(res.conflicts, [pid["서다온"]]);

    const row = (await ctx.db.query(`select one_on_one_contacted from public.weekly_records where report_id = $1 and person_id = $2`, [report3, pid["서다온"]])).rows[0];
    assert.equal(row.one_on_one_contacted, true, "충돌 행이 덮어써졌다");
  });

  it("충돌 없는 행은 같은 제출에서 저장된다", async () => {
    const stale = await loadedUpdatedAt(pid["서다온"]);
    await asUser(ctx, "김빛나", (db) => db.query(`select public.submit_report($1, $2::jsonb)`, [
      report3, JSON.stringify([{ person_id: pid["서다온"], expected_updated_at: stale, fields: { worship_attended: true } }]),
    ]), { commit: true });

    const freshNam = await loadedUpdatedAt(pid["남시현"]);
    const res = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.submit_report($1, $2::jsonb) as r`, [
        report3, JSON.stringify([
          { person_id: pid["서다온"], expected_updated_at: stale, fields: { worship_attended: false } },
          { person_id: pid["남시현"], expected_updated_at: freshNam, fields: { one_on_one_contacted: true } },
        ]),
      ])).rows[0].r, { commit: true });
    assert.deepEqual(res.conflicts, [pid["서다온"]]);
    const nam = (await ctx.db.query(`select one_on_one_contacted from public.weekly_records where report_id = $1 and person_id = $2`, [report3, pid["남시현"]])).rows[0];
    assert.equal(nam.one_on_one_contacted, true, "충돌 없는 행이 저장되지 않았다");
  });
});

// ===========================================================================
describe("완결성 · 마감 · 휴주", () => {
  it("전원 출석 상태가 없으면 제출되지 않는다", async () => {
    const week = sundayOffset(latestWeek, 1); // 다음 주 — 아직 아무 기록도 없다
    const rid = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.open_report($1, $2::date) as id`, [g3, week])).rows[0].id, { commit: true });

    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        rid, JSON.stringify([{ person_id: pid["고은결"], expected_updated_at: null, fields: { worship_attended: true, group_meeting_attended: true, prayer_request: "기도" } }]),
      ]));
    assert.notEqual(r.error, null);
    assert.match(r.error, /제출 조건/);
  });

  it("출석자 기도제목이 비면 제출되지 않는다", async () => {
    const week = sundayOffset(latestWeek, 1);
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, week])).rows[0].id;
    const rows = Object.entries(pid).map(([name, id]) => ({
      person_id: id, expected_updated_at: null,
      fields: { worship_attended: true, group_meeting_attended: true, prayer_request: name === "서다온" ? "" : "기도제목" },
    }));
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [rid, JSON.stringify(rows)]));
    assert.notEqual(r.error, null);
    assert.match(r.error, /제출 조건/);
    const n = (await ctx.db.query(`select count(*)::int as n from public.weekly_records where report_id = $1`, [rid])).rows[0].n;
    assert.equal(n, 0, "실패한 제출은 전부 롤백돼야 한다");
  });

  it("조건을 채우면 제출되고 마감 전이면 정시다", async () => {
    const week = sundayOffset(latestWeek, 1); // 미래 주 → 마감 전
    const rid = (await ctx.db.query(`select id from public.reports where group_id = $1 and week_key = $2`, [g3, week])).rows[0].id;
    const rows = Object.values(pid).map((id) => ({
      person_id: id, expected_updated_at: null,
      fields: { worship_attended: true, group_meeting_attended: id === pid["서다온"] ? false : true, prayer_request: "기도제목" },
    }));
    const res = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.submit_report($1, $2::jsonb, $3, true) as r`, [rid, JSON.stringify(rows), "목장 특이사항"])).rows[0].r,
      { commit: true });
    assert.equal(res.submitted, true);
    assert.equal(res.is_late, false);
    const rep = (await ctx.db.query(`select submitted_at is not null as s, is_late, note from public.reports where id = $1`, [rid])).rows[0];
    assert.deepEqual(rep, { s: true, is_late: false, note: "목장 특이사항" });
    const ev = (await ctx.db.query(`select count(*)::int as n from public.events where report_id = $1 and type = 'report_submitted'`, [rid])).rows[0].n;
    assert.equal(ev, 1);
  });

  it("마감이 지난 주를 처음 제출하면 지각으로 남고, 다시 저장해도 바뀌지 않는다", async () => {
    const week = sundayOffset(latestWeek, -5); // 5주 전 — 마감 한참 지남
    // 새로 쓸 수 있는 건 이번 주와 그 앞 3주라, 그 주가 창 안에 들게 이번 주를 잠시 옮긴다
    await setCurrentWeek(ctx, sundayOffset(latestWeek, -3));
    const rid = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.open_report($1, $2::date) as id`, [g3, week])).rows[0].id, { commit: true });
    const rows = Object.values(pid).map((id) => ({
      person_id: id, expected_updated_at: null,
      fields: { worship_attended: false, group_meeting_attended: false },
    }));
    const res = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.submit_report($1, $2::jsonb) as r`, [rid, JSON.stringify(rows)])).rows[0].r, { commit: true });
    assert.equal(res.is_late, true);
    assert.equal(res.late_now, true);

    // 다시 저장 — is_late 는 첫 제출 기준이다
    const again = await asUser(ctx, "김빛나", async (db) =>
      (await db.query(`select public.submit_report($1, '[]'::jsonb, $2, true) as r`, [rid, "추가"])).rows[0].r, { commit: true });
    assert.equal(again.is_late, true);
    const evs = (await ctx.db.query(`select count(*)::int as n from public.events where report_id = $1 and type = 'report_submitted'`, [rid])).rows[0].n;
    assert.equal(evs, 1, "제출 이벤트는 첫 제출에만 남는다");
    await setCurrentWeek(ctx, sundayOffset(latestWeek, 3));
  });

  it("휴주로 지정된 주는 열 수 없다", async () => {
    const week = sundayOffset(latestWeek, 2);
    // 휴주는 이번 주 이후에만 정할 수 있다 — 지정할 때만 이번 주를 시드 기준으로 되돌린다
    await setCurrentWeek(ctx, latestWeek);
    const ins = await asUser(ctx, "정다슬", (db) =>
      attempt(db, `insert into public.skipped_weeks (week_key, reason) values ($1::date, '방학')`, [week]), { commit: true });
    await setCurrentWeek(ctx, sundayOffset(latestWeek, 3));
    assert.equal(ins.error, null, ins.error);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.open_report($1, $2::date)`, [g3, week]));
    assert.notEqual(r.error, null);
    assert.match(r.error, /휴주/);
  });

  it("리더는 휴주를 지정할 수 없다", async () => {
    const week = sundayOffset(latestWeek, 3);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `insert into public.skipped_weeks (week_key) values ($1::date)`, [week]));
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================
describe("제출 경로의 부수 규칙", () => {
  it("자기 자신에 대한 1대1 접촉은 제출 경로에서도 false 다", async () => {
    const expected = await loadedUpdatedAt(pid["권다움"]);
    const res = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.submit_report($1, $2::jsonb) as r`, [
        report3, JSON.stringify([{ person_id: pid["권다움"], expected_updated_at: expected, fields: { one_on_one_contacted: true } }]),
      ])).rows[0].r, { commit: true });
    assert.deepEqual(res.conflicts, []);
    const row = (await ctx.db.query(`select one_on_one_contacted from public.weekly_records where report_id = $1 and person_id = $2`, [report3, pid["권다움"]])).rows[0];
    assert.equal(row.one_on_one_contacted, false);
  });

  it("다른 리더가 리더 본인 행에 기록한 접촉은 남는다 (D)", async () => {
    const expected = await loadedUpdatedAt(pid["권다움"]);
    await asUser(ctx, "김빛나", (db) => db.query(`select public.submit_report($1, $2::jsonb)`, [
      report3, JSON.stringify([{ person_id: pid["권다움"], expected_updated_at: expected, fields: { one_on_one_contacted: true } }]),
    ]), { commit: true });
    const row = (await ctx.db.query(`select one_on_one_contacted from public.weekly_records where report_id = $1 and person_id = $2`, [report3, pid["권다움"]])).rows[0];
    assert.equal(row.one_on_one_contacted, true);
  });

  it("출석 v2 — 온라인 예배와 사유 세 칸이 저장되고 뷰로 읽힌다 (2026-10-30)", async () => {
    const expected = await loadedUpdatedAt(pid["고은결"]);
    const res = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select public.submit_report($1, $2::jsonb) as r`, [
        report3, JSON.stringify([{ person_id: pid["고은결"], expected_updated_at: expected, fields: {
          worship_attended: true, group_meeting_attended: false, worship_online: true,
          online_reason: "  출장  ", meeting_absent_reason: "출장", absent_reason: "   ",
        } }]),
      ])).rows[0].r, { commit: true });
    assert.deepEqual(res.conflicts, []);
    const row = res.rows.find((r) => r.person_id === pid["고은결"]);
    assert.equal(row.worship_online, true);
    assert.equal(row.online_reason, "출장", "앞뒤 공백은 지운다");
    assert.equal(row.meeting_absent_reason, "출장");
    assert.equal(row.absent_reason, null, "빈 사유는 null");
  });

  it("출석 v2 — 온라인 예배는 목장 참석과 함께 저장되지 않는다", async () => {
    const expected = await loadedUpdatedAt(pid["고은결"]);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        report3, JSON.stringify([{ person_id: pid["고은결"], expected_updated_at: expected, fields: {
          worship_attended: true, group_meeting_attended: true, worship_online: true,
        } }]),
      ]));
    assert.notEqual(r.error, null);
    assert.match(r.error, /weekly_records_online_ck/);
  });

  it("허용되지 않은 필드는 거부된다", async () => {
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        report3, JSON.stringify([{ person_id: pid["고은결"], expected_updated_at: null, fields: { author_id: "x" } }]),
      ]));
    assert.notEqual(r.error, null);
    assert.match(r.error, /허용되지 않은 필드/);
  });

  it("명단에 없는 사람은 거부된다", async () => {
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `select public.submit_report($1, $2::jsonb)`, [
        report3, JSON.stringify([{ person_id: "00000000-0000-4000-8000-000000000000", expected_updated_at: null, fields: { worship_attended: true } }]),
      ]));
    assert.notEqual(r.error, null);
  });

  it("보고서를 열면 report_opened 가 남고, 같이 보는 리더 이름이 온다", async () => {
    await asUser(ctx, "김빛나", (db) => db.query(`select * from public.touch_report_presence($1)`, [report3]), { commit: true });
    const others = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select name from public.touch_report_presence($1)`, [report3])).rows.map((r) => r.name), { commit: true });
    assert.deepEqual(others, ["김빛나"]);
    const mine = await asUser(ctx, "김빛나", async (db) =>
      (await db.query(`select name from public.touch_report_presence($1)`, [report3])).rows.map((r) => r.name));
    assert.deepEqual(mine, ["권다움"]);

    const before = (await ctx.db.query(`select count(*)::int as n from public.events where type = 'report_opened' and report_id = $1`, [report3])).rows[0].n;
    await asUser(ctx, "권다움", (db) => db.query(`select public.open_report($1, $2::date)`, [g3, latestWeek]), { commit: true });
    const after_ = (await ctx.db.query(`select count(*)::int as n from public.events where type = 'report_opened' and report_id = $1`, [report3])).rows[0].n;
    assert.equal(after_, before + 1);
  });
});
