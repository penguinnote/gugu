/**
 * 선택 항목이 비어 있을 때 — submit_report 의 빈칸 처리 축
 *
 * 브라우저 검증에서 잡힌 버그: 기도제목을 비운 사람(예배만·결석)에게 **앞 사람의
 * 기도제목**이 저장됐다. 104건의 테스트가 이것을 놓친 이유는 전원이 값을 채운
 * 경우만 다뤘기 때문이다. 여기서는 "비어 있어도 되는 것이 비어 있을 때" 를
 * 한 축으로 잡고 전부 덮는다.
 *
 *   · 예배만 / 결석인 사람의 기도제목 빈칸
 *   · 빈칸과 입력이 번갈아 나오는 순서 (버그의 재현 형태)
 *   · 1대1 전원 미체크
 *   · 특이사항 빈칸 · 지우기 · 건드리지 않기
 *   · 전원 결석인 주
 *   · 기존 기도제목 지우기 (UPDATE 경로)
 *   · 필드가 하나도 없는 새 행
 *
 * 모든 쓰기는 실제 RLS 가 적용된 상태에서 권다움(3목장 리더)으로 한다.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asUser, attempt, createTestDb, setCurrentWeek } from "./harness.mjs";

let ctx;
let g3;
let latestWeek;
const pid = {};
const NAMES = ["권다움", "김빛나", "도하린", "류지호", "고은결", "남시현", "서다온"];

before(async () => {
  ctx = await createTestDb();
  g3 = (await ctx.db.query(`select id from public.groups where number = 3`)).rows[0].id;
  latestWeek = (await ctx.db.query(`select max(week_key)::text as w from public.reports`)).rows[0].w;
  for (const n of NAMES) {
    pid[n] = (await ctx.db.query(`select id from public.persons where name = $1`, [n])).rows[0].id;
  }
});

after(async () => {
  await ctx?.db?.close?.();
});

function weekPlus(weeks) {
  const d = new Date(latestWeek + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

async function openWeek(offset) {
  // 시드의 다음 주들(미래)을 '마감 전' 주로 쓴다 — 여는 주를 이번 주로 옮겨 둔다(2026-11-04 보고서 쓰기 막기:
  // 이번 주보다 뒤 주와 이번 주 앞 3주보다 앞 주는 새로 쓰지 못한다)
  await setCurrentWeek(ctx, weekPlus(offset));
  return asUser(
    ctx, "권다움",
    async (db) => (await db.query(`select public.open_report($1, $2::date) as id`, [g3, weekPlus(offset)])).rows[0].id,
    { commit: true },
  );
}

const ATT = {
  present: { worship_attended: true, group_meeting_attended: true },
  worship_only: { worship_attended: true, group_meeting_attended: false },
  absent: { worship_attended: false, group_meeting_attended: false },
};

/** spec: [{ name, att, prayer?, contact? }] → submit_report 행 */
function rows(spec, expectedByName = {}) {
  return spec.map((s) => {
    const fields = { ...ATT[s.att] };
    if ("prayer" in s) fields.prayer_request = s.prayer;
    if ("contact" in s) fields.one_on_one_contacted = s.contact;
    return { person_id: pid[s.name], expected_updated_at: expectedByName[s.name] ?? null, fields };
  });
}

async function submit(who, rid, rowsPayload, note = null, noteDirty = false) {
  return asUser(
    ctx, who,
    (db) => attempt(db, `select public.submit_report($1, $2::jsonb, $3, $4) as r`, [rid, JSON.stringify(rowsPayload), note, noteDirty]),
    { commit: true },
  );
}

async function readRows(rid) {
  const { rows: r } = await ctx.db.query(
    `select p.name, w.prayer_request, w.prayer_status::text as prayer_status, w.prev_record_id,
            w.worship_attended, w.group_meeting_attended, w.one_on_one_contacted, w.updated_at::text as updated_at
       from public.weekly_records w join public.persons p on p.id = w.person_id
      where w.report_id = $1`,
    [rid],
  );
  return Object.fromEntries(r.map((x) => [x.name, x]));
}

async function readNote(rid) {
  return (await ctx.db.query(`select note, submitted_at is not null as submitted from public.reports where id = $1`, [rid])).rows[0];
}

const allPresent = (prayerFor) => NAMES.map((name) => ({ name, att: "present", prayer: prayerFor(name) }));

// ===========================================================================
describe("기도제목 빈칸 — 예배만 · 결석", () => {
  it("예배만인 사람의 기도제목을 비워 제출하면 비어 있어야 한다 ★", async () => {
    const rid = await openWeek(1);
    const spec = allPresent((n) => `${n}의 기도`);
    spec[1] = { name: "김빛나", att: "worship_only" };           // 기도제목 없음
    const r = await submit("권다움", rid, rows(spec));
    assert.equal(r.error, null, r.error);

    const got = await readRows(rid);
    assert.equal(got["김빛나"].prayer_request, null, "앞 사람의 기도제목이 흘러들어왔다");
    assert.equal(got["김빛나"].prayer_status, null);
    assert.equal(got["김빛나"].prev_record_id, null);
    assert.equal(got["권다움"].prayer_request, "권다움의 기도", "앞 사람 값은 그대로여야 한다");
  });

  it("결석인 사람의 기도제목을 비워 제출하면 비어 있어야 한다 ★", async () => {
    const rid = await openWeek(2);
    const spec = allPresent((n) => `${n}의 기도`);
    spec[4] = { name: "고은결", att: "absent" };
    const r = await submit("권다움", rid, rows(spec));
    assert.equal(r.error, null, r.error);

    const got = await readRows(rid);
    assert.equal(got["고은결"].prayer_request, null, "앞 사람(류지호)의 기도제목이 흘러들어왔다");
    assert.equal(got["고은결"].prayer_status, null);
    assert.equal(got["고은결"].prev_record_id, null);
  });

  it("예배만이라도 기도제목을 적으면 그대로 저장된다", async () => {
    const rid = await openWeek(8);
    const spec = allPresent((n) => `${n}의 기도`);
    spec[1] = { name: "김빛나", att: "worship_only", prayer: "예배만 왔지만 나눔" };
    const r = await submit("권다움", rid, rows(spec));
    assert.equal(r.error, null, r.error);
    assert.equal((await readRows(rid))["김빛나"].prayer_request, "예배만 왔지만 나눔");
  });
});

// ===========================================================================
describe("빈칸과 입력이 번갈아 나오는 순서 — 버그의 재현 형태 ★", () => {
  it("각자 자기 값만 저장되고, 빈칸은 이전 기록과도 연결되지 않는다", async () => {
    const rid = await openWeek(3);
    const spec = [
      { name: "권다움", att: "present", prayer: "P1" },
      { name: "김빛나", att: "worship_only" },
      { name: "도하린", att: "present", prayer: "P3" },
      { name: "류지호", att: "absent" },
      { name: "고은결", att: "present", prayer: "P5" },
      { name: "남시현", att: "worship_only" },
      { name: "서다온", att: "absent" },
    ];
    const r = await submit("권다움", rid, rows(spec));
    assert.equal(r.error, null, r.error);

    const got = await readRows(rid);
    const expected = { 권다움: "P1", 김빛나: null, 도하린: "P3", 류지호: null, 고은결: "P5", 남시현: null, 서다온: null };
    for (const [name, prayer] of Object.entries(expected)) {
      assert.equal(got[name].prayer_request, prayer, `${name} 의 기도제목이 다르다`);
      if (prayer === null) {
        assert.equal(got[name].prayer_status, null, `${name} 상태가 남았다`);
        assert.equal(got[name].prev_record_id, null, `${name} 에 이전 기록이 붙었다 — v_prev 잔존`);
      } else {
        assert.equal(got[name].prayer_status, "ongoing", `${name} 은 지난 기록이 있으므로 진행 중이어야 한다`);
        assert.notEqual(got[name].prev_record_id, null);
      }
    }
    assert.deepEqual(
      Object.fromEntries(NAMES.map((n) => [n, [got[n].worship_attended, got[n].group_meeting_attended]])),
      { 권다움: [true, true], 김빛나: [true, false], 도하린: [true, true], 류지호: [false, false],
        고은결: [true, true], 남시현: [true, false], 서다온: [false, false] },
    );
  });
});

// ===========================================================================
describe("1대1 · 특이사항 빈칸", () => {
  it("1대1을 아무도 체크하지 않아도 제출되고 전부 false 다", async () => {
    const rid = await openWeek(4);
    const r = await submit("권다움", rid, rows(allPresent((n) => `${n} 기도`)));
    assert.equal(r.error, null, r.error);
    assert.equal(r.rows[0].r.submitted, true);
    const got = await readRows(rid);
    assert.ok(NAMES.every((n) => got[n].one_on_one_contacted === false));
  });

  it("특이사항은 비워도 제출되고, 건드리지 않으면 그대로, 지우면 비워진다", async () => {
    const rid = await openWeek(5);
    let r = await submit("권다움", rid, rows(allPresent((n) => `${n} 기도`)), null, false);
    assert.equal(r.error, null, r.error);
    assert.deepEqual(await readNote(rid), { note: null, submitted: true });

    r = await submit("권다움", rid, [], "목장 특이사항", true);
    assert.equal(r.error, null, r.error);
    assert.equal((await readNote(rid)).note, "목장 특이사항");

    r = await submit("권다움", rid, [], "무시돼야 함", false);     // dirty 아님 → 건드리지 않는다
    assert.equal(r.error, null, r.error);
    assert.equal((await readNote(rid)).note, "목장 특이사항");

    r = await submit("권다움", rid, [], null, true);                // 지우기
    assert.equal(r.error, null, r.error);
    assert.equal((await readNote(rid)).note, null);
  });
});

// ===========================================================================
describe("전원 결석인 주", () => {
  it("기도제목 없이 제출되고 전원 예배 X · 목장 X 로 남는다", async () => {
    const rid = await openWeek(6);
    const r = await submit("권다움", rid, rows(NAMES.map((name) => ({ name, att: "absent" }))));
    assert.equal(r.error, null, r.error);
    assert.equal(r.rows[0].r.submitted, true);
    const got = await readRows(rid);
    for (const n of NAMES) {
      assert.deepEqual(
        [got[n].worship_attended, got[n].group_meeting_attended, got[n].prayer_request, got[n].prayer_status, got[n].prev_record_id],
        [false, false, null, null, null], n,
      );
    }
  });
});

// ===========================================================================
describe("기존 행에서의 빈칸 (UPDATE 경로)", () => {
  it("예배만으로 바꾸며 기도제목을 지우면 상태와 이전 기록 연결도 함께 지워진다", async () => {
    // 출석(목장모임 참석)인 채로 기도제목만 지우면 완결성 검사에 걸리는 것이 맞다.
    // 예배만으로 바꾸는 것과 함께 지운다.
    const rid = await openWeek(1);                  // 위에서 만든 주
    const before = await readRows(rid);
    assert.ok(before["권다움"].prayer_request, "전제: 기도제목이 있어야 한다");
    const r = await submit("권다움", rid, [
      { person_id: pid["권다움"], expected_updated_at: before["권다움"].updated_at,
        fields: { ...ATT.worship_only, prayer_request: null } },
    ]);
    assert.equal(r.error, null, r.error);
    const got = await readRows(rid);
    assert.deepEqual([got["권다움"].prayer_request, got["권다움"].prayer_status, got["권다움"].prev_record_id], [null, null, null]);
  });

  it("출석인 채로 기도제목만 지우면 제출 조건에 걸리고 전체가 롤백된다", async () => {
    const rid = await openWeek(1);
    const before = await readRows(rid);
    const r = await submit("권다움", rid, [
      { person_id: pid["도하린"], expected_updated_at: before["도하린"].updated_at, fields: { prayer_request: null } },
    ]);
    assert.notEqual(r.error, null);
    assert.match(r.error, /제출 조건/);
    assert.equal((await readRows(rid))["도하린"].prayer_request, before["도하린"].prayer_request);
  });

  it("손대지 않은 행은 그대로다 — 다른 사람만 고쳐도 빈칸이 번지지 않는다", async () => {
    const rid = await openWeek(1);
    const before = await readRows(rid);
    const r = await submit("권다움", rid, [
      { person_id: pid["도하린"], expected_updated_at: before["도하린"].updated_at, fields: { one_on_one_contacted: true } },
    ]);
    assert.equal(r.error, null, r.error);
    const after_ = await readRows(rid);
    for (const n of NAMES.filter((x) => x !== "도하린")) {
      assert.equal(after_[n].updated_at, before[n].updated_at, `${n} 이 건드려졌다`);
      assert.equal(after_[n].prayer_request, before[n].prayer_request);
    }
  });
});

// ===========================================================================
describe("필드가 하나도 없는 새 행", () => {
  it("출석 상태 없이 새 기록을 만들 수 없다 — 빈 fields 는 거부된다", async () => {
    // 나머지 6명은 정상으로 채운다. 완결성 검사가 아니라 빈 fields 자체가 거부되는지 본다.
    const rid = await openWeek(7);
    const payload = rows(allPresent((n) => `${n} 기도`).filter((s) => s.name !== "권다움"));
    payload.push({ person_id: pid["권다움"], expected_updated_at: null, fields: {} });
    const r = await submit("권다움", rid, payload);
    assert.notEqual(r.error, null, "빈 fields 로 결석 행이 조용히 만들어졌다");
    assert.match(r.error, /출석 상태/);
    const n = (await ctx.db.query(`select count(*)::int as n from public.weekly_records where report_id = $1`, [rid])).rows[0].n;
    assert.equal(n, 0, "거부됐으면 전체가 롤백돼야 한다");
  });

  it("출석 상태 절반만 있는 새 행도 거부된다", async () => {
    const rid = await openWeek(7);
    const payload = rows(allPresent((n) => `${n} 기도`).filter((s) => s.name !== "권다움"));
    payload.push({ person_id: pid["권다움"], expected_updated_at: null, fields: { worship_attended: true, prayer_request: "반쪽" } });
    const r = await submit("권다움", rid, payload);
    assert.notEqual(r.error, null);
    assert.match(r.error, /출석 상태/);
  });
});
