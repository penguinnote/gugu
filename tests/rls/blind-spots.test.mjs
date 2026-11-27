/**
 * Step 6 — 돌봄 사각지대 판정 (2026-10-03, 03-metrics §3.1 · 04-schema §4.4)
 *
 * care_blind_spots(p_week_key, p_now) — 사람 한 명당 한 줄, 판정 결과만 돌려준다.
 *   · 창(window)     마감이 지난 최근 4주. 휴주는 건너뛰고 그만큼 더 거슬러 간다
 *                    p_week_key 주가 아직 마감 전이면 그 전 주에서 끝난다
 *   · 접촉 공백      창 안에 1대1 접촉 기록이 0건
 *   · 목장 공백      창 안에 목장모임 참석이 0회 (예배는 보지 않는다)
 *   · 단독 연결      창 안에 1대1 접촉을 기록한 리더가 정확히 1명 (contact_leaders = 1)
 *   · 기록 범위      그 사람의 **전체 기록** — 다른 목장에서 쓰인 것도 센다(목장 이동)
 *   · 대상           persons.status = active ∧ care_status ∈ {active, long_absent}. 리더도 대상
 *   · 판정 보류      창이 앱 데이터 시작보다 앞서면 'collecting'(집계 중), 창 시작 뒤에 등록했으면 'new'
 *                    — 둘 다 gap 값은 null 이다
 *   · 범위           목사님 전체, 리더 자기 목장(현재 소속), 운영자·미승인 0행
 *   · 원문           돌려주지 않는다 — 기도제목·특이사항 컬럼이 결과에 없다
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;
let weeks; // 시드 4주, 오름차순
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

/** date 컬럼은 Date(로컬 자정)로 온다 — YYYY-MM-DD 로 */
function ymd(d) {
  if (!(d instanceof Date)) return d;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 마지막 시드 주의 마감이 지난 시점 (수요일 아침 KST) — 창 = 시드 4주 전부 */
const AFTER = () => `${plusDays(weeks[3], 3)}T09:00:00+09:00`;

async function spots(who = "임찬양", weekKey = weeks[3], now = AFTER()) {
  return asUser(ctx, who, async (db) =>
    (await db.query(`select * from public.care_blind_spots($1::date, $2::timestamptz)`, [weekKey, now])).rows);
}

async function personId(name) {
  return (await ctx.db.query(`select id from public.persons where name = $1`, [name])).rows[0].id;
}

async function spotOf(name, ...args) {
  const id = await personId(name);
  return (await spots(...args)).find((r) => r.person_id === id) ?? null;
}

describe("판정 — 시드에서 손으로 센 값", () => {
  it("서다온: 출석은 완벽한데 4주간 접촉 0건 → 접촉 공백만 ★", async () => {
    const s = await spotOf("서다온");
    assert.equal(s.state, "judged");
    assert.equal(s.contact_gap, true);
    assert.equal(s.meeting_gap, false);
    assert.equal(s.contact_leaders, 0);
    assert.equal(s.last_contact_week, null);
  });

  it("오시온: 예배는 오는데 목장모임 0회 → 목장 공백만 ★", async () => {
    const s = await spotOf("오시온");
    assert.equal(s.meeting_gap, true);
    assert.equal(s.contact_gap, false, "w1 의 접촉은 미제출 보고서 안에 있어도 기록이다");
    assert.equal(s.last_meeting_week, null);
  });

  it("차사랑: 접촉 2회가 전부 같은 리더 → 단독 연결(contact_leaders = 1) ★", async () => {
    const s = await spotOf("차사랑");
    assert.equal(s.contact_gap, false);
    assert.equal(s.contact_leaders, 1);
    assert.equal(ymd(s.last_contact_week), weeks[2]);
  });

  it("두 공백이 겹치면 최우선 경보 — contact_gap ∧ meeting_gap", async () => {
    const id = await personId("서다온");
    await ctx.db.query(`update public.weekly_records set group_meeting_attended = false where person_id = $1`, [id]);
    try {
      const s = await spotOf("서다온");
      assert.equal(s.contact_gap, true);
      assert.equal(s.meeting_gap, true);
    } finally {
      await ctx.db.query(`update public.weekly_records set group_meeting_attended = true where person_id = $1`, [id]);
    }
  });

  it("v2 — 최근 두 주 연속 결석이면 접촉이 있어도 absent_streak ★", async () => {
    const id = await personId("차사랑");
    const sql = `update public.weekly_records set worship_attended = $2, group_meeting_attended = $2
                  where person_id = $1 and week_key in ($3::date, $4::date)`;
    await ctx.db.query(sql, [id, false, weeks[2], weeks[3]]);
    try {
      const s = await spotOf("차사랑");
      assert.equal(s.contact_gap, false, "w3 의 접촉은 그대로다");
      assert.equal(s.absent_streak, true);
    } finally {
      await ctx.db.query(sql, [id, true, weeks[2], weeks[3]]);
    }
  });

  it("v2 — 결석이 한 주뿐이거나 떨어져 있으면 absent_streak 가 아니다", async () => {
    const id = await personId("차사랑");
    const sql = `update public.weekly_records set worship_attended = $2, group_meeting_attended = $2
                  where person_id = $1 and week_key in ($3::date, $4::date)`;
    await ctx.db.query(sql, [id, false, weeks[1], weeks[3]]);
    try {
      assert.equal((await spotOf("차사랑")).absent_streak, false);
    } finally {
      await ctx.db.query(sql, [id, true, weeks[1], weeks[3]]);
    }
  });

  it("v2 — 온라인 예배만 4주면 예배는 했어도 목장 공백 ★", async () => {
    const id = await personId("서다온");
    await ctx.db.query(
      `update public.weekly_records set worship_attended = true, group_meeting_attended = false, worship_online = true where person_id = $1`, [id]);
    try {
      const s = await spotOf("서다온");
      assert.equal(s.meeting_gap, true);
      assert.equal(s.absent_streak, false);
      assert.equal(ymd(s.last_worship_week), weeks[3]);
    } finally {
      await ctx.db.query(
        `update public.weekly_records set worship_online = false, group_meeting_attended = true where person_id = $1`, [id]);
    }
  });

  it("weeks_recorded: 창 안에서 그 사람의 기록이 있는 주 수", async () => {
    const s = await spotOf("오시온");
    assert.equal(s.weeks_recorded, 4);
  });

  it("창 경계를 돌려준다 — window_start ~ window_end", async () => {
    const s = await spotOf("서다온");
    assert.equal(ymd(s.window_start), weeks[0]);
    assert.equal(ymd(s.window_end), weeks[3]);
  });
});

describe("판정 보류 — 신규 · 집계 중", () => {
  it("창 시작 뒤에 등록한 사람은 'new' 이고 gap 이 없다 (표은총 · 신봄이) ★", async () => {
    for (const name of ["표은총", "신봄이"]) {
      const s = await spotOf(name);
      assert.equal(s.state, "new", name);
      assert.equal(s.contact_gap, null, name);
      assert.equal(s.meeting_gap, null, name);
    }
  });

  it("창이 앱 데이터 시작보다 앞서면 전원 'collecting' — 3주치로는 판정하지 않는다 ★", async () => {
    const rows = await spots("임찬양", weeks[2], `${plusDays(weeks[2], 3)}T09:00:00+09:00`);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.state === "collecting"));
    assert.ok(rows.every((r) => r.contact_gap === null && r.meeting_gap === null));
  });

  it("이번 주 마감 전이면 창은 지난주에서 끝난다 — 그래서 아직 집계 중", async () => {
    const s = await spotOf("서다온", "임찬양", weeks[3], `${plusDays(weeks[3], 1)}T12:00:00+09:00`);
    assert.equal(ymd(s.window_end), weeks[2]);
    assert.equal(s.state, "collecting");
  });

  it("마감 경계 — 화요일 23:59:59 KST 는 아직 지난주까지, 수요일 00:00 부터 이번 주 포함", async () => {
    const before = await spotOf("서다온", "임찬양", weeks[3], `${plusDays(weeks[3], 2)}T23:59:59+09:00`);
    const after = await spotOf("서다온", "임찬양", weeks[3], `${plusDays(weeks[3], 3)}T00:00:00+09:00`);
    assert.equal(ymd(before.window_end), weeks[2]);
    assert.equal(ymd(after.window_end), weeks[3]);
  });

  it("휴주는 창에서 빠지고 그만큼 더 거슬러 간다", async () => {
    await ctx.db.query(`insert into public.skipped_weeks (week_key, reason) values ($1, '수련회')`, [weeks[1]]);
    try {
      const s = await spotOf("서다온");
      assert.equal(ymd(s.window_start), plusDays(weeks[0], -7));
      assert.equal(s.state, "collecting", "창이 데이터 시작보다 앞선다");
    } finally {
      await ctx.db.query(`delete from public.skipped_weeks where week_key = $1`, [weeks[1]]);
    }
  });

  it("p_week_key 는 일요일이어야 한다", async () => {
    const r = await asUser(ctx, "임찬양", (db) =>
      attempt(db, `select * from public.care_blind_spots($1::date, $2::timestamptz)`, [plusDays(weeks[3], 1), AFTER()]));
    assert.notEqual(r.error, null);
  });
});

describe("대상 — 판정 제외와 별도 표시", () => {
  it("휴면 · 기록 제외 · 이탈은 결과에 없다", async () => {
    const id = await personId("서다온");
    for (const st of ["dormant", "opted_out", "left"]) {
      await ctx.db.query(`update public.persons set status = $2 where id = $1`, [id, st]);
      try {
        assert.equal(await spotOf("서다온"), null, st);
      } finally {
        await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [id]);
      }
    }
  });

  it("care_status 군 복무·원거리·주말 근무·타 교회는 결과에 없다 ★", async () => {
    const id = await personId("서다온");
    for (const cs of ["military", "remote", "weekend_work", "other_church"]) {
      await ctx.db.query(`update public.persons set care_status = $2 where id = $1`, [id, cs]);
      try {
        assert.equal(await spotOf("서다온"), null, cs);
      } finally {
        await ctx.db.query(`update public.persons set care_status = 'active' where id = $1`, [id]);
      }
    }
  });

  it("장기 미출석(long_absent)은 판정 대상이고 care_status 로 구분된다", async () => {
    const id = await personId("서다온");
    await ctx.db.query(`update public.persons set care_status = 'long_absent' where id = $1`, [id]);
    try {
      const s = await spotOf("서다온");
      assert.equal(s.care_status, "long_absent");
      assert.equal(s.state, "judged");
      assert.equal(s.contact_gap, true);
    } finally {
      await ctx.db.query(`update public.persons set care_status = 'active' where id = $1`, [id]);
    }
  });

  it("리더도 대상이다 — group_role 로 구분", async () => {
    const s = await spotOf("권다움");
    assert.equal(s.group_role, "leader");
    assert.equal(s.state, "judged");
  });

  it("needs_check 를 그대로 싣는다 — 집계 중 기간의 출발점", async () => {
    const id = await personId("서다온");
    await ctx.db.query(`update public.persons set needs_check = true where id = $1`, [id]);
    try {
      assert.equal((await spotOf("서다온")).needs_check, true);
    } finally {
      await ctx.db.query(`update public.persons set needs_check = null where id = $1`, [id]);
    }
  });
});

describe("목장 이동 — 사람 기준으로 전체 기록을 본다", () => {
  it("옮기기 전 목장에서 쓰인 접촉도 센다. 보이는 쪽은 새 목장 리더 ★", async () => {
    const id = await personId("서다온");
    const rec = (await ctx.db.query(
      `select id from public.weekly_records where person_id = $1 and week_key = $2`, [id, weeks[3]])).rows[0].id;
    await ctx.db.query(`update public.weekly_records set one_on_one_contacted = true where id = $1`, [rec]);
    await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [id, g7]);
    try {
      const pastor = await spotOf("서다온");
      assert.equal(pastor.group_id, g7);
      assert.equal(pastor.contact_gap, false, "3목장에서 쓰인 접촉이 들어가야 한다");

      const g7Leader = (await spots("노해찬")).find((r) => r.person_id === id);
      assert.ok(g7Leader, "새 목장 리더가 본다");
      const g3Leader = (await spots("권다움")).find((r) => r.person_id === id);
      assert.equal(g3Leader, undefined, "옛 목장 리더는 더 이상 보지 않는다");
    } finally {
      await ctx.db.query(`update public.persons set group_id = $2 where id = $1`, [id, g3]);
      await ctx.db.query(`update public.weekly_records set one_on_one_contacted = false where id = $1`, [rec]);
    }
  });
});

describe("누가 무엇을 보는가", () => {
  it("목사님은 판정 대상 전원을 받는다 ★", async () => {
    const rows = await spots();
    const expected = (await ctx.db.query(
      `select count(*)::int as n from public.persons p join public.groups g on g.id = p.group_id
        where p.status = 'active' and p.care_status in ('active', 'long_absent') and g.status = 'active'`)).rows[0].n;
    assert.equal(rows.length, expected);
  });

  it("리더는 자기 목장 사람만 받는다 ★", async () => {
    const rows = await spots("권다움");
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.group_id === g3));
  });

  it("운영자(명단 밖)와 미승인은 0행", async () => {
    assert.equal((await spots("정다슬")).length, 0);
    const pending = await asUser(ctx, "한이음", (db) =>
      attempt(db, `select * from public.care_blind_spots($1::date, $2::timestamptz)`, [weeks[3], AFTER()]));
    if (pending.error === null) assert.equal(pending.rows.length, 0);
  });

  it("원문은 돌려주지 않는다 — 결과 컬럼은 판정 값뿐 ★", async () => {
    const [row] = await spots();
    assert.deepEqual(Object.keys(row).sort(), [
      "absent_streak", "care_status", "contact_gap", "contact_leaders", "group_id", "group_role",
      "last_contact_week", "last_meeting_week", "last_worship_week", "meeting_gap", "needs_check",
      "person_id", "state", "weeks_recorded", "window_end", "window_start",
    ]);
  });
});
