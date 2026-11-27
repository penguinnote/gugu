#!/usr/bin/env node
/**
 * 데모 기록 — 실명단 위에 Step 6~8 개발용 주간기록을 만들고(seed) 지운다(clear).
 *
 *   npm run demo:seed    최근 4주(지난 일요일 기준) 보고서 · 주간기록 · 이벤트를 만든다
 *   npm run demo:clear   app_meta.demo_records = true 일 때만 기록을 전부 비운다
 *
 * 내용은 전부 지어낸 것이다 — 출석 패턴은 사람 id 와 주차의 md5 로 결정적이고, 기도제목은
 * 고정 문구 8개 중 하나다. 실명은 persons 에 이미 있는 것을 참조만 하며 여기서 다루지 않는다.
 * 작성자·제출자는 실계정 중 명단상 리더인 계정(운영자 겸임 포함), 없으면 운영자 실계정이다.
 *
 * export_logs 는 비우지 않는다 — 내보내기 로그는 영구 보존이다(Step 10).
 *
 * 안전장치: clear 는 demo_records = true 일 때만 돈다. 실제 리더가 쓰기 시작한 뒤(운영자가
 * demo:clear 를 한 번 돌려 false 가 된 뒤)에는 두 번 다시 지우지 못한다.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (mode !== "seed" && mode !== "clear") {
  console.error("usage: demo-records.mjs seed | clear");
  process.exit(2);
}

const meta = Object.fromEntries(query(`select key, value from public.app_meta`).map((r) => [r.key, r.value]));
if (meta.roster_source !== "real") {
  console.error("데모 기록은 실명단 위에만 만든다 (app_meta.roster_source = real 이 아니다). 가명 시드에는 seed.sql 이 기록을 넣는다.");
  process.exit(2);
}

if (mode === "clear") {
  if (meta.demo_records !== "true") {
    console.error("demo:clear 거부 — app_meta.demo_records 가 true 가 아니다. 실제 기록일 수 있다.");
    process.exit(2);
  }
  const r = run(`begin;
truncate public.report_presence, public.comments, public.events, public.report_reviews, public.weekly_records, public.reports;
update public.app_meta set value = 'false', updated_at = now() where key = 'demo_records';
commit;`);
  if (r.error) {
    console.error("실패:", r.error);
    process.exit(1);
  }
  console.log("✔ 데모 기록을 지웠다. demo_records = false — 이제부터 기록은 실제 기록으로 본다.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

const existing = query(`select (select count(*) from public.weekly_records) as records, (select count(*) from public.reports) as reports`)[0];
if (Number(existing.records) > 0 || Number(existing.reports) > 0) {
  if (meta.demo_records !== "true") {
    console.error("기록이 이미 있고 데모 표시가 아니다 — 실제 기록 위에 데모를 얹지 않는다.");
    process.exit(2);
  }
  console.log("기존 데모 기록을 지우고 다시 만든다.");
}

// 작성자: 명단상 리더에 연결된 실계정이 있으면 그것, 없으면(명단 도입 직후) 운영자 실계정.
const authors = query(
  `select u.id from public.users u left join public.persons p on p.user_id = u.id and p.status = 'active'
    where u.auth_user_id is not null and u.status = 'active' and u.role in ('leader', 'admin')
    order by (p.group_role = 'leader') desc nulls last, (u.role = 'admin') desc, u.created_at limit 1`,
);
if (authors.length === 0) {
  console.error("작성자로 쓸 실계정(리더 또는 운영자)이 없다.");
  process.exit(2);
}
const authorId = authors[0].id;

const r = run(`begin;
truncate public.report_presence, public.comments, public.events, public.report_reviews, public.weekly_records, public.reports;

-- 최근 4주 — 지난 일요일부터 거꾸로. 오늘이 일요일이면 오늘부터.
create temporary table demo_weeks on commit drop as
select (date_trunc('week', (now() at time zone 'Asia/Seoul')::date + 1)::date - 1 - (7 * i))::date as week_key, i as idx
from generate_series(0, 3) as i;

insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late)
select g.id, w.week_key,
       (w.week_key + 1)::timestamptz + interval '21 hours' + (('x' || substr(md5(g.id::text || w.week_key::text), 1, 2))::bit(8)::int % 180) * interval '1 minute',
       ${lit(authorId)}::uuid,
       (('x' || substr(md5(g.id::text || w.week_key::text), 3, 2))::bit(8)::int % 11) = 0   -- 약 1/11 은 지각
from public.groups g cross join demo_weeks w
where g.status = 'active'
  -- 최신 주는 두 목장을 미제출로 남긴다 (목사님 화면의 '미제출' 을 보기 위해)
  and not (w.idx = 0 and g.number in (select number from public.groups order by number desc limit 2));

insert into public.weekly_records (report_id, person_id, author_id, week_key, group_id_at_write,
  worship_attended, group_meeting_attended, one_on_one_contacted, prayer_request, prayer_status, note)
select r.id, p.id, ${lit(authorId)}::uuid, r.week_key, p.group_id,
       h.b1, h.b1 and h.b2, h.b3,
       case when h.b1 and h.b2 then (array['학업과 진로를 놓고 기도 중','가족의 건강','새로운 공동체에 적응하는 것','시험 준비','마음의 평안','직장 면접','관계 회복','규칙적인 생활'])[1 + h.n % 8] end,
       case when h.b1 and h.b2 then 'new'::public.prayer_status end,
       null
from public.reports r
join public.persons p on p.group_id = r.group_id and p.status = 'active'
cross join lateral (
  select ('x' || substr(md5(p.id::text || r.week_key::text), 1, 8))::bit(32)::int as n,
         ('x' || substr(md5(p.id::text || r.week_key::text), 1, 2))::bit(8)::int % 10 < 8 as b1,   -- 예배 80%
         ('x' || substr(md5(p.id::text || r.week_key::text), 3, 2))::bit(8)::int % 10 < 8 as b2,   -- 예배 중 목장 80%
         ('x' || substr(md5(p.id::text || r.week_key::text), 5, 2))::bit(8)::int % 10 < 4 as b3    -- 1대1 40%
) h;

-- 자기 자신에 대한 접촉은 트리거가 false 로 만든다. 데모에서는 작성자가 한 명이라 그 사람 행만 해당.

insert into public.events (user_id, type, group_id, report_id, week_key, is_late, occurred_at)
select r.submitted_by, 'report_submitted', r.group_id, r.id, r.week_key, r.is_late, r.submitted_at
from public.reports r where r.submitted_at is not null;

insert into public.app_meta (key, value) values ('demo_records', 'true')
  on conflict (key) do update set value = 'true', updated_at = now();
commit;`);
if (r.error) {
  console.error("실패 — 롤백됨:", r.error);
  process.exit(1);
}

const after = query(`select
  (select count(*) from public.reports) as reports,
  (select count(*) from public.reports where submitted_at is null) as unsubmitted,
  (select count(*) from public.reports where is_late) as late,
  (select count(*) from public.weekly_records) as weekly_records,
  (select min(week_key)::text from public.reports) as first_week,
  (select max(week_key)::text from public.reports) as last_week,
  (select count(*) from public.persons where status = 'active') as persons`)[0];
console.log("✔ 데모 기록:", JSON.stringify(after));
console.log("  demo_records = true. 실제 운영 전에 npm run demo:clear 로 지운다.");

// ---------------------------------------------------------------------------

function lit(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function run(text) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked"], { cwd: ROOT, input: text, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // JSON 은 stdout 에만 온다. stderr 에는 CLI 안내문이 섞여 있어 같이 보면 끝 매칭이 깨진다.
  const out = r.stdout ?? "";
  const m = out.match(/\{[\s\S]*\}\s*$/);
  if (r.status !== 0 && !m) return { error: ((r.stderr ?? "") + out).trim().split("\n").slice(-5).join("\n") };
  try {
    const j = m ? JSON.parse(m[0]) : {};
    if (j._tag === "Error" || j.error) return { error: (j.error?.message ?? JSON.stringify(j)).replace(/\s+/g, " ") };
    return { rows: j.rows ?? [] };
  } catch {
    return { error: out.trim().split("\n").slice(-5).join("\n") };
  }
}
function query(text) {
  const r = run(text);
  if (r.error) {
    console.error("조회 실패:", r.error);
    process.exit(1);
  }
  return r.rows;
}
