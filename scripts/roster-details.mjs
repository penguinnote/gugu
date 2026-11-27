#!/usr/bin/env node
/**
 * npm run roster:details        — 원본 명단 엑셀의 나머지 칸을 원격 DB 에 한 번 옮긴다(2026-10-28).
 * npm run roster:details:check  — 엑셀만 읽고 검증한다. DB 를 읽지도 쓰지도 않는다.
 *
 * 무엇을
 *   · 목장의 마을(A열) → groups.village
 *   · 직업 · 소속 · 청년대학부 회원 · 공동의회 회원 · 비고(H~L열) → persons
 *   · 오른쪽 '섬김 부서별 명단' 표 → person_ministries (이름이 명단에 정확히 하나 있을 때만)
 *   · 빈 칸 채우기만: 훈련단계 · 출생년도 · 성별은 앱 값이 비어 있을 때만 엑셀 값으로(앱에서 고친 값을 덮지 않는다)
 * 엑셀 오류 바로잡기(사용자 결정 2026-10-28)
 *   · 값 앞뒤 공백(' 양' 등)과 겹친 공백 정리 · 출생년도가 글자면 네 자리 숫자만 뽑는다 · 훈련단계 '-' 는 없음
 *   · 섬김 표의 이름이 명단과 맞지 않으면(오타 · 별명) 넣지 않고 부서 · 개수만 알린다 — 리더가 앱에서 고른다
 *   · 'River' 처럼 사람이 없는 목장은 무시(사라진 목장)
 *
 * 한 번만: 다 옮기면 app_meta.roster_details = 'imported'. 그 뒤에는 거부한다 — 이제부터 원본은 앱이다(엑셀로 덮으면
 * 리더가 앱에서 고친 값이 사라진다). 정말 다시 하려면 --force.
 *
 * 실명 취급은 roster:import 와 같다 — 엑셀을 메모리에서 읽고, SQL 은 `supabase db query --linked` 의 stdin 으로.
 * 출력에는 개수 · 행 번호 · 범주값(부서 이름)만. 이름은 찍지 않는다.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import { lit } from "./lib/roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "data", "roster.config.json");
const SHEET = "명단_및_현황";
const HEADER_ROW = 3;
const CHECK_ONLY = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");
const MINISTRIES = ["찬양팀", "임원진", "수찬기", "국제사역부", "주일학교", "사회자", "교회 안내", "통역", "방송실", "예배 반주", "홈페이지", "동아리", "새가족 안내"];
const DEPT_COLS = [22, 24, 26]; // V · X · Z
const LIMITS = { occupation: 30, affiliation: 40, note: 200 };

// ---------------------------------------------------------------------------
// 1. 엑셀 읽기
// ---------------------------------------------------------------------------

if (!existsSync(CONFIG)) {
  console.error("설정 파일이 없다: data/roster.config.json (roster:import 와 같은 파일 — { \"source\": \"<원본 경로>\" })");
  process.exit(2);
}
const source = JSON.parse(readFileSync(CONFIG, "utf8")).source;
if (typeof source !== "string" || !existsSync(source)) {
  console.error("원본을 찾을 수 없다 — data/roster.config.json 의 source 를 확인한다.");
  process.exit(2);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(source);
const ws = wb.getWorksheet(SHEET);
if (!ws) {
  console.error(`시트가 없다: ${SHEET}`);
  process.exit(2);
}

const text = (cell) => {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (v instanceof Date) return String(v.getFullYear());
  return String(v);
};
const clean = (s) => s.replace(/\s+/g, " ").trim();
const header = Array.from(ws.getRow(HEADER_ROW).values, (v) => (v == null ? "" : String(v).replace(/\s+/g, "")));
const col = (name) => {
  const i = header.findIndex((h) => h === name || h.startsWith(name));
  if (i < 0) throw new Error(`컬럼 없음: ${name}`);
  return i;
};
const C = {
  village: col("마을"), group: col("목장"), name: col("이름"), kind: col("구분"), stage: col("훈련단계"), birth: col("출생년도"),
  gender: col("성별"), occupation: col("직업"), affiliation: col("소속"), youth: col("청년대학부회원"), assembly: col("공동의회회원"), note: col("비고"),
};

const notes = [];
const errors = [];
const rows = [];
for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const get = (k) => clean(text(row.getCell(C[k])));
  const name = get("name");
  const group = get("group");
  if (!name && !group) continue;
  if (!name || !group) {
    errors.push(`row ${r}: 이름 · 목장 중 하나가 비었다`);
    continue;
  }
  const birthRaw = get("birth");
  let birth = null;
  if (/^\d{4}$/.test(birthRaw)) birth = Number(birthRaw);
  else if (birthRaw) {
    const m = birthRaw.match(/(19|20)\d{2}/);
    if (m) {
      birth = Number(m[0]);
      notes.push(`row ${r}: 출생년도가 글자 — 네 자리 숫자만 뽑았다`);
    } else notes.push(`row ${r}: 출생년도를 읽지 못했다 — 비워 둔다`);
  }
  const g = get("gender");
  const gender = g === "남" ? "male" : g === "여" ? "female" : null;
  if (!gender) notes.push(`row ${r}: 성별 ${g ? "값 불명" : "빈칸"} — 앱에서 고른다`);
  const stage = get("stage");
  const long = (k) => {
    const v = get(k);
    if (v.length > LIMITS[k]) errors.push(`row ${r}: ${k} 가 ${LIMITS[k]}자를 넘는다(${v.length}자)`);
    return v || null;
  };
  rows.push({
    r, group, name, village: get("village") || null,
    stage: stage && stage !== "-" ? stage : null, birth, gender,
    occupation: long("occupation"), affiliation: long("affiliation"), note: long("note"),
    youth: get("youth").toUpperCase() === "O", assembly: get("assembly").toUpperCase() === "O",
  });
}

// 같은 목장 동명이인은 맞출 수 없다
const seen = new Map();
for (const x of rows) {
  const k = `${x.group}\u0000${x.name}`;
  if (seen.has(k)) errors.push(`같은 목장 동명이인: rows ${seen.get(k)}, ${x.r}`);
  seen.set(k, x.r);
}

// 마을 — 목장마다 하나
const villageOf = new Map();
for (const x of rows) {
  if (!x.village) continue;
  const v = villageOf.get(x.group);
  if (v && v !== x.village) errors.push(`row ${x.r}: 같은 목장에 마을이 둘(${v} · ${x.village})`);
  villageOf.set(x.group, x.village);
}

// 섬김 부서 표 — V · X · Z 열을 위에서 아래로. 부서 이름이 나오면 그 열의 부서가 바뀌고, 그 아래 이름이 그 부서 사람
const serves = []; // { dept, name, r }
for (const c of DEPT_COLS) {
  let dept = null;
  for (let r = HEADER_ROW; r <= ws.rowCount; r++) {
    const v = clean(text(ws.getCell(r, c)));
    if (!v) continue;
    if (MINISTRIES.includes(v)) dept = v;
    else if (dept && !v.startsWith("기준")) serves.push({ dept, name: v, r });
  }
}
const byName = new Map();
for (const x of rows) byName.set(x.name, [...(byName.get(x.name) ?? []), x]);
const unmatched = serves.filter((s) => (byName.get(s.name) ?? []).length !== 1);
const matchedServes = serves.filter((s) => (byName.get(s.name) ?? []).length === 1);


console.log(`엑셀: 사람 ${rows.length} · 목장 ${new Set(rows.map((x) => x.group)).size} · 마을 있는 목장 ${villageOf.size}`);
console.log(`칸 채움: 직업 ${rows.filter((x) => x.occupation).length} · 소속 ${rows.filter((x) => x.affiliation).length} · 청년대학부 회원 ${rows.filter((x) => x.youth).length} · 공동의회 회원 ${rows.filter((x) => x.assembly).length} · 비고 ${rows.filter((x) => x.note).length}`);
const missing = unmatched.filter((s) => !byName.has(s.name));
const twins = unmatched.filter((s) => byName.has(s.name));
const where = (list) => (list.length ? ` (${list.map((s) => s.dept).join(" · ")})` : "");
console.log(`섬김: ${serves.length}칸 — 명단과 맞음 ${matchedServes.length}, 명단에 없는 이름 ${missing.length}${where(missing)}, 동명이인이라 못 고름 ${twins.length}${where(twins)} — 못 맞춘 것은 리더가 앱에서 고른다`);
if (notes.length) console.log("바로잡기:\n  " + notes.join("\n  "));
if (errors.length) {
  console.error("거부 — 엑셀에서 고친 뒤 다시 돌린다:\n  " + errors.join("\n  "));
  process.exit(1);
}
if (CHECK_ONLY) {
  console.log("--check: 여기까지. DB 는 읽지도 쓰지도 않았다.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. 원격과 맞추기 — (목장 이름, 사람 이름)
// ---------------------------------------------------------------------------

const meta = Object.fromEntries(query(`select key, value from public.app_meta`).map((r) => [r.key, r.value]));
if (meta.roster_source !== "real") {
  console.error("실명단이 아직 들어가지 않았다(app_meta.roster_source != real). roster:import 를 먼저.");
  process.exit(1);
}
if (meta.roster_details === "imported" && !FORCE) {
  console.error("이미 옮겼다(app_meta.roster_details = imported). 이제 원본은 앱이다 — 다시 덮으려면 --force.");
  process.exit(1);
}

const remote = query(`select p.id::text as id, g.name as group_name, p.name, p.training_stage, p.birth_year, p.gender::text as gender
  from public.persons p join public.groups g on g.id = p.group_id where p.status <> 'left'`);
const remoteKey = new Map(remote.map((p) => [`${p.group_name}\u0000${p.name}`, p]));
const matched = rows.map((x) => ({ x, p: remoteKey.get(`${x.group}\u0000${x.name}`) })).filter((m) => m.p);
const excelOnly = rows.filter((x) => !remoteKey.has(`${x.group}\u0000${x.name}`));
const rowKeys = new Set(rows.map((x) => `${x.group}\u0000${x.name}`));
const appOnly = remote.filter((p) => !rowKeys.has(`${p.group_name}\u0000${p.name}`)).length;
console.log(`원격: 사람 ${remote.length} — 엑셀과 맞음 ${matched.length}, 엑셀에만 ${excelOnly.length}${excelOnly.length ? ` (rows ${excelOnly.map((x) => x.r).join(", ")})` : ""}, 앱에만 ${appOnly}`);

// ---------------------------------------------------------------------------
// 3. 적용 — 한 트랜잭션
// ---------------------------------------------------------------------------

const idOf = new Map(matched.map(({ x, p }) => [x.name, (byName.get(x.name) ?? []).length === 1 ? p.id : null]));
const sql = ["begin;"];
for (const [group, village] of villageOf) sql.push(`update public.groups set village = ${lit(village)} where name = ${lit(group)} and status = 'active';`);
let filled = 0;
for (const { x, p } of matched) {
  const set = [
    `occupation = ${x.occupation ? lit(x.occupation) : "null"}`,
    `affiliation = ${x.affiliation ? lit(x.affiliation) : "null"}`,
    `youth_member = ${x.youth}`,
    `assembly_member = ${x.assembly}`,
    `note = ${x.note ? lit(x.note) : "null"}`,
  ];
  if (p.training_stage == null && x.stage) {
    set.push(`training_stage = ${lit(x.stage)}`);
    filled++;
  }
  if (p.birth_year == null && x.birth) {
    set.push(`birth_year = ${x.birth}`);
    filled++;
  }
  if (p.gender == null && x.gender) {
    set.push(`gender = ${lit(x.gender)}`);
    filled++;
  }
  sql.push(`update public.persons set ${set.join(", ")} where id = ${lit(p.id)};`);
}
let served = 0;
for (const s of matchedServes) {
  const pid = idOf.get(s.name);
  if (!pid) continue;
  served++;
  sql.push(`insert into public.person_ministries (person_id, ministry_id)
    select ${lit(pid)}, id from public.ministries where name = ${lit(s.dept)} on conflict do nothing;`);
}
sql.push(`insert into public.app_meta (key, value) values ('roster_details', 'imported')
  on conflict (key) do update set value = excluded.value, updated_at = now();`);
sql.push("commit;");
console.log(`적용: 마을 ${villageOf.size}곳 · 사람 ${matched.length}명 · 빈 칸 채움 ${filled} · 섬김 ${served}칸`);

const applied = run(sql.join("\n"));
if (applied.error) {
  console.error("적용 실패 — 롤백됨:", applied.error);
  process.exit(1);
}

const after = query(`select
  (select count(*) from public.groups where status = 'active' and village is not null) as villages,
  (select count(*) from public.persons where status <> 'left' and occupation is not null) as occupation,
  (select count(*) from public.persons where status <> 'left' and youth_member) as youth,
  (select count(*) from public.persons where status <> 'left' and assembly_member) as assembly,
  (select count(*) from public.person_ministries) as serves,
  (select value from public.app_meta where key = 'roster_details') as roster_details`)[0];
console.log("적용 후:", JSON.stringify(after));

// ---------------------------------------------------------------------------
// helpers — roster-import.mjs 와 같다
// ---------------------------------------------------------------------------

/** SQL 을 stdin 으로 흘려 실행한다. 결과 JSON 의 rows 를 돌려준다. */
function run(sqlText) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked"], { cwd: ROOT, input: sqlText, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

function query(sqlText) {
  const r = run(sqlText);
  if (r.error) {
    console.error("조회 실패:", r.error);
    process.exit(1);
  }
  return r.rows;
}
