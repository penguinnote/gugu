/**
 * 권한 테스트 — docs/08-dev-roadmap.md Step 2, Step 3.5 에서 5단계 역할로 개편
 *
 * 모든 테스트는 실제 RLS 가 적용된 상태에서 돈다. service_role 우회는 없다.
 *
 * 시드 기준 (supabase/seed.sql)
 *   목장 12개 · 사람 80명(리더 41 · 청년 39) · 주간기록 320건
 *   3목장  리더 권다움(목장장)·김빛나·도하린·류지호(계정 없음) / 청년 고은결·남시현·서다온
 *   7목장  리더 노해찬(목장장)·명슬아·신보람·윤겨레 / 청년 손예찬·오시온·양한별
 *   11목장 리더 반석호(목장장)·송지평 / 청년 차사랑·조미르·진하늘·표은총
 *   청년은 앱 계정이 없다 (2026-09-27). 계정은 리더·목사님·운영자뿐.
 *   목사님 임찬양 · 운영자 정다슬 · 미승인 박새벽(3목장 남시현으로 신청 중)·한이음
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { asAnon, asUser, attempt, createTestDb } from "./harness.mjs";

let ctx;

before(async () => {
  ctx = await createTestDb();
});

after(async () => {
  await ctx?.db?.close?.();
});

async function groupId(number) {
  const { rows } = await ctx.db.query(`select id from public.groups where number = $1`, [
    number,
  ]);
  return rows[0].id;
}

async function personId(name) {
  const { rows } = await ctx.db.query(`select id from public.persons where name = $1`, [
    name,
  ]);
  return rows[0].id;
}

// ===========================================================================
describe("로드맵 Step 2 필수 케이스", () => {
  it("3목장 리더가 3목장 주간기록을 조회하면 성공한다", async () => {
    const g3 = await groupId(3);
    const rows = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `select id from public.weekly_records_visible where group_id_at_write = $1`,
        [g3],
      );
      return r.rows;
    });
    // 3목장 7명(리더 포함) × 4주
    assert.equal(rows.length, 28);
  });

  it("3목장 리더가 7목장 주간기록을 조회하면 한 건도 나오지 않는다 ★", async () => {
    const g7 = await groupId(7);
    const result = await asUser(ctx, "권다움", async (db) => ({
      view: (
        await db.query(
          `select id from public.weekly_records_visible where group_id_at_write = $1`,
          [g7],
        )
      ).rows,
      base: (
        await db.query(`select id from public.weekly_records where group_id_at_write = $1`, [
          g7,
        ])
      ).rows,
    }));
    assert.equal(result.view.length, 0, "뷰에서 7목장 기록이 보이면 안 된다");
    assert.equal(result.base.length, 0, "원본 테이블에서도 보이면 안 된다");
  });

  it("리더는 주간기록 · 보고서를 직접 고칠 수 없다 — 남의 목장은 물론 자기 목장도 ★ (2026-11-04)", async () => {
    const g7 = await groupId(7);
    const g3 = await groupId(3);
    for (const [sql, params] of [
      [`update public.weekly_records set worship_attended = not worship_attended where group_id_at_write = $1`, [g7]],
      [`update public.weekly_records set worship_attended = not worship_attended where group_id_at_write = $1`, [g3]],
      [`update public.reports set is_late = false where group_id = $1`, [g3]],
      [`insert into public.reports (group_id, week_key, submitted_at, is_late) values ($1, date '2031-01-05', now(), false)`, [g3]],
      [`delete from public.reports where group_id = $1`, [g3]],
    ]) {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, sql, params));
      assert.match(r.error ?? "", /permission denied/, `막히지 않았다: ${sql}`);
    }
  });

  it("목사님은 전체 주간기록을 조회한다", async () => {
    const rows = await asUser(ctx, "임찬양", async (db) => {
      const r = await db.query(`select id from public.weekly_records_visible`);
      return r.rows;
    });
    assert.equal(rows.length, 320);
  });

  it("운영자는 보고서 본문에 접근하지 못한다 ★", async () => {
    const seen = await asUser(ctx, "정다슬", async (db) => ({
      reports: (await db.query(`select id from public.reports`)).rows.length,
      records: (await db.query(`select id from public.weekly_records_visible`)).rows.length,
      base: (await db.query(`select id from public.weekly_records`)).rows.length,
      comments: (await db.query(`select id from public.comments`)).rows.length,
    }));
    assert.deepEqual(seen, { reports: 0, records: 0, base: 0, comments: 0 });
  });

  it("같은 목장 리더는 다른 리더가 쓴 기도제목·특이사항을 그대로 본다 ★", async () => {
    // 원칙 — 모든 기도제목과 나눔은 목장 안에서만 다룬다. 목사님은 전체를 보신다.
    // 같은 목장 안에서는 아무것도 가리지 않는다.
    const prayer = await asUser(ctx, "권다움", async (db) =>
      (await db.query(
        `select prayer_request from public.weekly_records_visible
          where person_id = $1 order by week_key desc limit 1`,
        [await personId("고은결")],
      )).rows[0]);
    assert.ok(prayer.prayer_request && prayer.prayer_request.length > 0, "기도제목이 보여야 한다");

    const notes = await asUser(ctx, "권다움", async (db) =>
      (await db.query(
        `select note from public.weekly_records_visible
          where person_id = $1 and note is not null`,
        [await personId("남시현")],
      )).rows);
    assert.equal(notes.length, 1, "특이사항이 보여야 한다");
  });
});

// ===========================================================================
describe("비로그인(anon)", () => {
  const tables = [
    "groups", "users", "persons", "applications", "reports", "weekly_records",
    "group_profiles", "comments", "events", "export_logs",
  ];
  for (const t of tables) {
    it(`anon 은 ${t} 를 읽지 못한다`, async () => {
      const r = await asAnon(ctx, (db) => attempt(db, `select * from public.${t} limit 1`));
      assert.notEqual(r.error, null, `${t} 가 anon 에게 열려 있다`);
    });
  }
  for (const v of ["persons_public", "weekly_records_visible"]) {
    it(`anon 은 ${v} 뷰도 읽지 못한다`, async () => {
      const r = await asAnon(ctx, (db) => attempt(db, `select * from public.${v} limit 1`));
      assert.notEqual(r.error, null, `${v} 가 anon 에게 열려 있다`);
    });
  }
});

// ===========================================================================
describe("목장 안에서만 — 열람 범위", () => {
  it("목사님은 전 목장의 본문을 본다", async () => {
    const r = await asUser(ctx, "임찬양", async (db) =>
      (await db.query(
        `select count(distinct group_id_at_write)::int as groups,
                count(*) filter (where prayer_request is not null)::int as prayers
           from public.weekly_records_visible`,
      )).rows[0]);
    assert.equal(r.groups, 12);
    assert.ok(r.prayers > 0);
  });

  it("리더는 자기 목장 밖의 본문을 한 줄도 보지 못한다", async () => {
    const g3 = await groupId(3);
    const rows = await asUser(ctx, "권다움", async (db) =>
      (await db.query(`select distinct group_id_at_write from public.weekly_records_visible`)).rows);
    assert.deepEqual(rows.map((x) => x.group_id_at_write), [g3]);
  });

  it("원본 테이블의 본문 컬럼은 누구도 직접 조회하지 못한다", async () => {
    for (const who of ["권다움", "김빛나", "임찬양", "정다슬"]) {
      const r = await asUser(ctx, who, (db) =>
        attempt(db, `select prayer_request from public.weekly_records limit 1`),
      );
      assert.notEqual(r.error, null, `${who} 가 원본에서 기도제목을 읽을 수 있다`);
    }
  });
});

// ===========================================================================
describe("두 가지 노출 범위 — persons", () => {
  it("다른 목장 리더도 공개 뷰로 전체 명단의 이름·성별·소속·역할을 본다", async () => {
    const rows = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `select id, name, gender, group_id, group_role from public.persons_public`,
      );
      return r.rows;
    });
    assert.equal(rows.length, 80);
    assert.ok(rows.some((r) => r.name === "오시온"), "7목장 청년도 보여야 한다");
    assert.ok(rows.some((r) => r.name === "반석호" && r.group_role === "leader"));
  });

  it("공개 뷰에는 생년월일·연락처·상태 컬럼 자체가 없다", async () => {
    const cols = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'persons_public'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    for (const forbidden of ["phone", "birth_date", "status", "joined_at", "user_id"]) {
      assert.ok(!cols.includes(forbidden), `${forbidden} 가 공개 뷰에 있다`);
    }
  });

  it("원본 persons 테이블에서는 자기 목장만 보인다", async () => {
    const rows = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(`select name, birth_date, group_role from public.persons`);
      return r.rows;
    });
    assert.equal(rows.length, 7, "3목장 7명만 보여야 한다");
    assert.ok(rows.every((r) => r.birth_date !== null), "자기 목장은 생년월일이 보인다");
    assert.equal(rows.filter((r) => r.group_role === "leader").length, 4);
  });
});

// ===========================================================================
describe("목장 프로필 — 승인된 전원에게 공개", () => {
  it("모든 리더가 다른 목장 프로필을 읽는다", async () => {
    const n = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(`select group_id from public.group_profiles`);
      return r.rows.length;
    });
    assert.equal(n, 12);
  });

  it("다른 목장 프로필은 수정하지 못한다", async () => {
    const g7 = await groupId(7);
    const n = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `update public.group_profiles set intro = '침입' where group_id = $1 returning group_id`,
        [g7],
      );
      return r.rows.length;
    });
    assert.equal(n, 0);
  });

  it("자기 목장 프로필은 수정할 수 있다", async () => {
    const g3 = await groupId(3);
    const n = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `update public.group_profiles set intro = '수정됨' where group_id = $1 returning group_id`,
        [g3],
      );
      return r.rows.length;
    });
    assert.equal(n, 1);
  });

});

// ===========================================================================
describe("코멘트", () => {
  it("3목장 리더는 자기 목장 코멘트만 읽는다", async () => {
    const g3 = await groupId(3);
    const expected = (
      await ctx.db.query(
        `select count(*)::int as n from public.comments c
           join public.reports r on r.id = c.report_id where r.group_id = $1`,
        [g3],
      )
    ).rows[0].n;
    const rows = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(
        `select c.id, r.group_id from public.comments c join public.reports r on r.id = c.report_id`,
      );
      return r.rows;
    });
    assert.equal(rows.length, expected);
    assert.ok(rows.every((r) => r.group_id === g3), "다른 목장 코멘트가 섞이면 안 된다");
  });

  it("리더는 코멘트를 쓰지 못한다", async () => {
    const { rows: reps } = await ctx.db.query(`select id from public.reports limit 1`);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(
        db,
        `insert into public.comments (report_id, author_id, body)
         values ($1, public.current_user_id(), '리더가 쓴 코멘트')`,
        [reps[0].id],
      ),
    );
    assert.notEqual(r.error, null);
  });

  it("목사님은 코멘트를 쓴다", async () => {
    const { rows: reps } = await ctx.db.query(
      `select id from public.reports where submitted_at is not null limit 1`,
    );
    const r = await asUser(ctx, "임찬양", (db) =>
      attempt(
        db,
        `insert into public.comments (report_id, author_id, body)
         values ($1, public.current_user_id(), '목사님 코멘트') returning id`,
        [reps[0].id],
      ),
    );
    assert.equal(r.error, null, `목사님 코멘트 작성이 막혔다: ${r.error}`);
  });
});

// ===========================================================================
describe("로그·거버넌스", () => {
  it("리더는 행동 로그와 내보내기 로그를 읽지 못한다", async () => {
    const seen = await asUser(ctx, "권다움", async (db) => ({
      events: (await db.query(`select id from public.events`)).rows.length,
      exports: (await db.query(`select id from public.export_logs`)).rows.length,
    }));
    assert.deepEqual(seen, { events: 0, exports: 0 });
  });

  it("목사님과 운영자는 로그를 읽는다", async () => {
    for (const who of ["임찬양", "정다슬"]) {
      const n = await asUser(ctx, who, async (db) => {
        const r = await db.query(`select id from public.events`);
        return r.rows.length;
      });
      assert.ok(n > 0, `${who} 가 행동 로그를 못 읽는다`);
    }
  });

  it("남의 이름으로 로그를 남기지 못한다", async () => {
    const { rows } = await ctx.db.query(`select id from public.users where name = '임찬양'`);
    const r = await asUser(ctx, "권다움", (db) =>
      attempt(db, `insert into public.events (user_id, type) values ($1, 'report_opened')`, [
        rows[0].id,
      ]),
    );
    assert.notEqual(r.error, null);
  });
});

// ===========================================================================
describe("기준 정보", () => {
  it("승인된 사용자 전원이 목장 목록을 읽는다", async () => {
    for (const who of ["권다움", "김빛나", "임찬양", "정다슬"]) {
      const n = await asUser(ctx, who, async (db) => {
        const r = await db.query(`select id from public.groups where status = 'active'`);
        return r.rows.length;
      });
      assert.equal(n, 12, `${who} 가 목장 목록을 못 읽는다`);
    }
  });

  it("리더는 목장을 만들거나 고치지 못한다", async () => {
    const n = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(`update public.groups set name = '침입' returning id`);
      return r.rows.length;
    });
    assert.equal(n, 0);
  });

  it("리더는 다른 사용자의 계정 정보를 읽지 못한다", async () => {
    const rows = await asUser(ctx, "권다움", async (db) => {
      const r = await db.query(`select id, name from public.users`);
      return r.rows;
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "권다움");
  });

  it("연결된 사용자는 자기 신원 컬럼을 고칠 수 없다", async () => {
    for (const sql of [
      `update public.users set role = 'pastor' where id = public.current_user_id()`,
      `update public.users set provider = 'google' where id = public.current_user_id()`,
      `update public.users set auth_user_id = gen_random_uuid() where id = public.current_user_id()`,
    ]) {
      const r = await asUser(ctx, "권다움", (db) => attempt(db, sql));
      assert.notEqual(r.error, null, `막히지 않았다: ${sql}`);
    }
  });
});

// ===========================================================================
describe("작성 시점 목장 기준 (04-schema §4.2)", () => {
  it("사람이 목장을 옮겨도 새 목장 리더는 이전 목장 시절 기록을 보지 못한다", async () => {
    const g3 = await groupId(3);
    const g7 = await groupId(7);
    const pid = await personId("서다온");

    await ctx.db.query(`update public.persons set group_id = $1 where id = $2`, [g7, pid]);
    try {
      const byNew = await asUser(ctx, "노해찬", async (db) => {
        const r = await db.query(
          `select id from public.weekly_records_visible where person_id = $1`,
          [pid],
        );
        return r.rows.length;
      });
      assert.equal(byNew, 0, "7목장 리더가 3목장 시절 기록을 보면 안 된다");

      const byOld = await asUser(ctx, "권다움", async (db) => {
        const r = await db.query(
          `select id from public.weekly_records_visible where person_id = $1`,
          [pid],
        );
        return r.rows.length;
      });
      assert.equal(byOld, 4, "3목장 리더는 당시 기록을 계속 본다");

      const baseRow = await asUser(ctx, "권다움", async (db) => {
        const r = await db.query(`select id from public.persons where id = $1`, [pid]);
        return r.rows.length;
      });
      assert.equal(baseRow, 0, "옮겨간 사람의 원본 행이 계속 보이면 안 된다");

      const pub = await asUser(ctx, "권다움", async (db) => {
        const r = await db.query(`select name from public.persons_public where id = $1`, [pid]);
        return r.rows[0];
      });
      assert.equal(pub?.name, "서다온", "이름은 공개 뷰로 계속 조회된다");
    } finally {
      await ctx.db.query(`update public.persons set group_id = $1 where id = $2`, [g3, pid]);
    }
  });

  it("휴면 처리된 리더는 접근이 끊긴다", async () => {
    const pid = await personId("권다움");
    await ctx.db.query(`update public.persons set status = 'dormant' where id = $1`, [pid]);
    try {
      const n = await asUser(ctx, "권다움", async (db) => {
        const r = await db.query(`select id from public.weekly_records_visible`);
        return r.rows.length;
      });
      assert.equal(n, 0);
    } finally {
      await ctx.db.query(`update public.persons set status = 'active' where id = $1`, [pid]);
    }
  });
});

// ===========================================================================
describe("리더도 주간기록 대상이다 (Step 3.5)", () => {
  it("리더 본인의 기록도 목장 기록에 포함된다", async () => {
    const pid = await personId("권다움");
    const n = await asUser(ctx, "김빛나", async (db) => {
      const r = await db.query(
        `select id from public.weekly_records_visible where person_id = $1`,
        [pid],
      );
      return r.rows.length;
    });
    assert.equal(n, 4, "리더 권다움의 4주치 기록이 같은 목장 리더에게 보여야 한다");
  });

  it("자기 자신에 대한 1대1 접촉은 저장되지 않는다 ★", async () => {
    const pid = await personId("권다움");
    // w0 은 권다움 본인이 작성자다. 시드에서 Y 로 넣었지만 트리거가 false 로 만든다.
    const seeded = (
      await ctx.db.query(
        `select one_on_one_contacted from public.weekly_records wr
          join public.users u on u.id = wr.author_id
         where wr.person_id = $1 and u.name = '권다움'`,
        [pid],
      )
    ).rows;
    assert.ok(seeded.length >= 1, "본인이 작성한 본인 행이 있어야 한다");
    assert.ok(seeded.every((r) => r.one_on_one_contacted === false), "시드의 자기 접촉이 true 로 남았다");

    // 트리거로도 확인한다 — 본인이 쓴 본인 행에 접촉을 켜도 false 다. 리더는 표를 직접 못 고치므로(2026-11-04)
    // 소유자 권한으로 고친다. 제출 경로(submit_report)는 report.test.mjs 가 본다.
    await ctx.db.query("begin");
    const stored = (
      await ctx.db.query(
        `update public.weekly_records wr
            set one_on_one_contacted = true
           from public.users u
          where u.id = wr.author_id and u.name = '권다움' and wr.person_id = $1
          returning wr.one_on_one_contacted`,
        [pid],
      )
    ).rows.map((x) => x.one_on_one_contacted);
    await ctx.db.query("rollback"); // 다른 테스트가 보는 시드는 그대로 둔다
    assert.ok(stored.length >= 1);
    assert.ok(stored.every((v) => v === false), "자기 접촉이 true 로 저장됐다");
  });

  it("다른 리더가 기록한 접촉은 그대로 남는다", async () => {
    const pid = await personId("권다움");
    await ctx.db.query("begin");
    const stored = (
      await ctx.db.query(
        `update public.weekly_records wr
            set one_on_one_contacted = true
           from public.users u
          where u.id = wr.author_id and u.name = '김빛나' and wr.person_id = $1
          returning wr.one_on_one_contacted`,
        [pid],
      )
    ).rows.map((x) => x.one_on_one_contacted);
    await ctx.db.query("rollback"); // 다른 테스트가 보는 시드는 그대로 둔다
    assert.ok(stored.length >= 1, "김빛나가 작성한 권다움 행이 있어야 한다");
    assert.ok(stored.every((v) => v === true));
  });

  it("사각지대 판정에 리더가 포함되고, 역할로 구분할 수 있다", async () => {
    // 목사님이 접촉 0건인 사람을 찾는다. 서다온(청년) 하나여야 하고, 역할이 함께 나온다.
    const rows = await asUser(ctx, "임찬양", async (db) => {
      const r = await db.query(
        `select pp.name, pp.group_role
           from public.persons_public pp
           join public.weekly_records_visible wr on wr.person_id = pp.id
          group by pp.id, pp.name, pp.group_role
         having count(*) filter (where wr.one_on_one_contacted) = 0`,
      );
      return r.rows;
    });
    assert.deepEqual(rows, [{ name: "서다온", group_role: "member" }]);
  });
});
