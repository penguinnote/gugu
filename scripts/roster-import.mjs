#!/usr/bin/env node
/**
 * npm run roster:import  — data/roster.xlsx(저장소 밖, gitignore) 를 읽어 원격 DB 의
 *                          groups · persons 를 실명단으로 갱신한다.
 * npm run roster:check   — 읽고 검증만 한다. 아무것도 쓰지 않는다.
 *
 * 원본과 사본
 *   · 원본 경로는 data/roster.config.json (gitignore) 의 "source". 시작할 때마다 원본을
 *     data/roster.xlsx 로 복사한 뒤 읽는다. 원본이 없으면 경로를 찍고 실패한다.
 *
 * 실명 취급
 *   · 실명은 파일로 남기지 않는다. 엑셀을 메모리에서 읽고, SQL 을 `supabase db query --linked`
 *     의 **stdin** 으로 흘린다 — 명령줄 인자(ps 노출)도, 중간 파일도 없다.
 *   · 이 스크립트의 출력에는 개수·행 번호·범주값만 나온다. 이름은 절대 찍지 않는다.
 *
 * 규칙 (2026-09-27 확정)
 *   · '명단_및_현황' 시트만. 헤더 3행. 마을 컬럼은 넣지 않는다. 직업·소속·비고도 넣지 않는다.
 *   · 목장 식별자는 이름. number 는 명단 등장 순서(정렬 전용).
 *   · 109명 전원이 기록 대상 — '청년대학부 회원' 으로 거르지 않는다.
 *   · 훈련단계 '-' 와 빈칸은 null. 출생년도 형식 이상·결측은 null. 성별 결측 허용.
 *   · 이름·목장·구분 중 하나라도 비면 거부. 같은 목장 동명이인이면 거부. 행 번호로 보고.
 *   · id = md5('person:' || 목장 || ':' || 이름 || ':' || 출생년도), 출생년도 없으면 이름까지.
 *     재도입 시 (목장, 이름)으로 기존 행을 찾아 id 가 다르면 re-key 한다 — 출생년도를 고쳐도
 *     같은 사람이고 계정 연결이 끊기지 않는다. re-key 는 행 번호로 보고한다.
 *   · 첫 도입(가명 시드 위)에만: 가짜 계정(auth_user_id null) 삭제, 기록·보고서·이벤트 비움(전부 가명
 *     person 을 가리킨다), 그 뒤 데모 기록 생성. 실계정은 보존.
 *   · 재도입(실명단 위)은 명단만 갱신한다. 기록·계정·데모는 건드리지 않는다. 명단에서 빠진 사람은
 *     지우지 않고 status = 'left' 로 둔다 — 기록이 남아 있고, 계정은 운영자가 뗀다.
 *     기록 제외(status = 'opted_out', 본인 요청)는 재도입이 되돌리지 않는다.
 *   · 적용 후 행 수를 읽어 기대(목장 12 · 사람 109 · 리더 42 · 양 67 · 실계정 유지)와 다르면
 *     트랜잭션 안에서 실패한다.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import { buildImportSql, normalizeRows, summarize } from "./lib/roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG = path.join(DATA_DIR, "roster.config.json");
const FILE = path.join(DATA_DIR, "roster.xlsx");
const SHEET = "명단_및_현황";
const HEADER_ROW = 3;
const CHECK_ONLY = process.argv.includes("--check");
const SKIP_DEMO = process.argv.includes("--no-demo");

// ---------------------------------------------------------------------------
// 1. 읽기
// ---------------------------------------------------------------------------

// 원본은 저장소 밖에 있고 경로는 data/roster.config.json(gitignore)에 있다. 시작할 때마다 원본을
// data/roster.xlsx 로 복사한 뒤 읽는다 — 사람이 복사를 기억해야 하는 절차는 반복해서 실패한다
// (2026-09-28 에 원본만 갱신되고 복사본은 옛 파일이었다). 심볼릭 링크는 쓰지 않는다(iCloud).
// 설정(gitignore): { source, overrides: { care_status: {military: [...], ...}, demote_leaders: [...], opt_out: [...] }, expect: { needs_check: N } }
// 이름은 설정 파일에만 있다 — 저장소·로그·문서에는 나오지 않는다.
let config = {};
syncFromSource();

function syncFromSource() {
  if (!existsSync(CONFIG)) {
    console.error(`설정 파일이 없다: data/roster.config.json\n  내용: { "source": "<명단 엑셀 원본의 절대 경로>" }  (data/ 는 gitignore 다 — 09 §1.4)`);
    process.exit(2);
  }
  let source;
  try {
    config = JSON.parse(readFileSync(CONFIG, "utf8"));
    source = config.source;
  } catch (e) {
    console.error(`설정 파일을 읽지 못했다: data/roster.config.json — ${e.message}`);
    process.exit(2);
  }
  if (typeof source !== "string" || !source.trim()) {
    console.error(`설정 파일에 "source" 가 없다: data/roster.config.json`);
    process.exit(2);
  }
  if (!existsSync(source)) {
    console.error(`원본을 찾을 수 없다: ${source}\n  파일이 옮겨졌으면 data/roster.config.json 의 source 를 고친다.`);
    process.exit(2);
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const before = existsSync(FILE) ? createHash("md5").update(readFileSync(FILE)).digest("hex") : null;
  copyFileSync(source, FILE);
  const after = createHash("md5").update(readFileSync(FILE)).digest("hex");
  const mtime = statSync(source).mtime.toISOString().slice(0, 16).replace("T", " ");
  console.log(`원본 → data/roster.xlsx 복사 (원본 수정 ${mtime}Z, ${before === null ? "새 사본" : before === after ? "내용 같음" : "내용 바뀜"})`);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.getWorksheet(SHEET);
if (!ws) {
  console.error(`시트가 없다: ${SHEET}. 있는 시트: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  process.exit(2);
}

const cellText = (cell) => {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (v instanceof Date) return String(v.getFullYear());
  return String(v);
};
const header = Array.from(ws.getRow(HEADER_ROW).values, (v) => (v == null ? "" : String(v).replace(/\s+/g, "")));
const col = (name) => {
  const i = header.findIndex((h) => h === name || h.startsWith(name));
  if (i < 0) throw new Error(`컬럼 없음: ${name} (헤더 ${HEADER_ROW}행: ${header.filter(Boolean).join(" / ")})`);
  return i;
};
// '청년대학부 회원'(O/빈칸)은 needs_check 를 만드는 데만 쓰고 저장하지 않는다. '공동의회 회원' 은 읽지도 않는다.
const C = { group: col("목장"), name: col("이름"), kind: col("구분"), stage: col("훈련단계"), birth: col("출생년도"), gender: col("성별"), member: col("청년대학부회원") };

const rows = [];
for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const raw = {
    r,
    group: cellText(row.getCell(C.group)).trim(),
    name: cellText(row.getCell(C.name)).trim(),
    kind: cellText(row.getCell(C.kind)).trim(),
    stage: cellText(row.getCell(C.stage)).trim(),
    birth: cellText(row.getCell(C.birth)).trim(),
    gender: cellText(row.getCell(C.gender)).trim(),
    member: cellText(row.getCell(C.member)).trim(),
  };
  if (!raw.group && !raw.name && !raw.kind && !raw.stage && !raw.birth && !raw.gender) continue;
  rows.push(raw);
}

// ---------------------------------------------------------------------------
// 2. 검증 · 정규화 · 상태 태그 — scripts/lib/roster.mjs (테스트 가능한 순수 부분)
// ---------------------------------------------------------------------------

const { people, groups, errors, notes } = normalizeRows(rows, config.overrides ?? {});

const leaders = people.filter((p) => p.groupRole === "leader").length;
const members = people.length - leaders;
console.log(`명단: ${rows.length}행 읽음 → 사람 ${people.length} (리더 ${leaders} · 양 ${members}), 목장 ${groups.length}`);
console.log(`목장 순서(number): ${groups.map((g, i) => `${i + 1}=${g}`).join(" · ")}`);
if (notes.length) console.log("정규화:\n  " + notes.join("\n  "));
{
  const sm = summarize(people);
  console.log(`상태 태그: ${JSON.stringify(sm.byStatus)}`);
  console.log(`needs_check ${sm.needsCheckTotal}명 — 목장별 ${JSON.stringify(sm.needsCheckByGroup)}${config.expect?.needs_check != null ? ` (기대 ${config.expect.needs_check})` : ""}`);
}
if (errors.length) {
  console.error("거부 — 다음 행을 엑셀에서 고친 뒤 다시 돌린다:\n  " + errors.join("\n  "));
  process.exit(1);
}
if (CHECK_ONLY) {
  console.log("--check: 여기까지. 아무것도 쓰지 않았다.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. re-key 판단 — 원격의 (목장, 이름) → id 를 읽어 로컬에서 비교한다
// ---------------------------------------------------------------------------

const existing = query(
  `select g.name as group_name, p.name, p.id::text as id, (p.user_id is not null) as linked
     from public.persons p join public.groups g on g.id = p.group_id`,
);
const byKey = new Map(existing.map((e) => [`${e.group_name}\u0000${e.name}`, e]));
const rekeys = [];
for (const p of people) {
  const e = byKey.get(`${p.group}\u0000${p.name}`);
  if (e && e.id !== p.id) rekeys.push({ r: p.r, from: e.id, to: p.id, linked: e.linked });
}
const newIds = new Set(people.map((p) => p.id));
const keptExisting = existing.filter((e) => newIds.has(e.id) || rekeys.some((k) => k.from === e.id)).length;
console.log(`원격: 기존 사람 ${existing.length} — 같은 사람으로 갱신 ${keptExisting}, 삭제 ${existing.length - keptExisting}, 새로 추가 ${people.length - keptExisting}`);
if (rekeys.length) {
  console.log(`re-key ${rekeys.length}건 (출생년도가 바뀐 같은 사람 — 계정 연결 보존): rows ${rekeys.map((k) => k.r + (k.linked ? "(계정 있음)" : "")).join(", ")}`);
}

// ---------------------------------------------------------------------------
// 4. 적용 — 한 트랜잭션. 끝의 DO 블록이 행 수를 단언하고, 어긋나면 전부 롤백된다
// ---------------------------------------------------------------------------

const realAccounts = query(`select count(*)::int as n from public.users where auth_user_id is not null`)[0].n;
// 첫 도입(가명 시드 위)인가, 재도입(실명단 위)인가. 재도입은 기록·계정을 절대 건드리지 않는다.
const meta = Object.fromEntries(query(`select key, value from public.app_meta`).map((r) => [r.key, r.value]));
const firstImport = meta.roster_source !== "real";
console.log(firstImport ? "첫 도입 — 가명 시드의 기록·가짜 계정을 지우고 실명단을 넣는다." : "재도입 — 명단만 갱신한다. 기록·계정은 건드리지 않는다.");

const sqlText = buildImportSql({
  people, groups, rekeys, firstImport, realAccounts,
  expectNeedsCheck: config.expect?.needs_check ?? null,
});

const applied = run(sqlText);
if (applied.error) {
  console.error("적용 실패 — 롤백됨:", applied.error);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. 검증 — 다시 읽는다
// ---------------------------------------------------------------------------

const after = query(`select
  (select count(*) from public.groups where status = 'active') as groups,
  (select count(*) from public.persons where status <> 'left') as persons,
  (select count(*) from public.persons where group_role = 'leader' and status <> 'left') as leaders,
  (select count(*) from public.persons where group_role = 'member' and status <> 'left') as members,
  (select count(*) from public.persons where status = 'left') as left_persons,
  (select count(*) from public.persons where user_id is not null) as linked,
  (select count(*) from public.users where auth_user_id is not null) as real_accounts,
  (select count(*) from public.users where auth_user_id is null) as fake_accounts,
  (select count(*) from public.persons where training_stage is null) as stage_null,
  (select count(*) from public.persons where birth_year is null) as birth_null,
  (select count(*) from public.weekly_records) as weekly_records,
  (select count(*) from public.persons where needs_check and status <> 'left') as needs_check,
  (select count(*) from public.persons where needs_check is null and status <> 'left') as needs_check_unset,
  (select value from public.app_meta where key = 'roster_source') as roster_source`)[0];
const byGroup = query(`select g.name, count(*) filter (where p.needs_check)::int as n
  from public.persons p join public.groups g on g.id = p.group_id where p.status <> 'left' group by g.name, g.number order by g.number`);
console.log("needs_check 목장별:", byGroup.map((r) => `${r.name} ${r.n}`).join(" · "));
const ok =
  Number(after.groups) === groups.length && Number(after.persons) === people.length &&
  Number(after.leaders) === leaders && Number(after.members) === members &&
  Number(after.real_accounts) === realAccounts && (!firstImport || Number(after.fake_accounts) === 0) && after.roster_source === "real";
console.log("적용 후:", JSON.stringify(after));
console.log(ok ? "✔ 행 수 검증 통과" : "✖ 행 수 검증 실패");
if (!ok) process.exit(1);

// 데모 기록은 첫 도입(기록이 하나도 없을 때)에만 만든다. 재도입은 기록을 건드리지 않는다 —
// 새로 추가된 사람은 지난 주차 기록이 없는 채로 남는다(실제로도 그렇다). 다시 만들려면 demo:seed.
if (!SKIP_DEMO && Number(after.weekly_records) === 0) {
  const demo = spawnSync("node", [path.join(ROOT, "scripts/demo-records.mjs"), "seed"], { cwd: ROOT, stdio: "inherit" });
  if (demo.status !== 0) process.exit(demo.status ?? 1);
} else if (!SKIP_DEMO) {
  console.log(`기록 ${after.weekly_records}건은 그대로 둔다 (재도입은 기록을 건드리지 않는다).`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------



/** SQL 을 stdin 으로 흘려 실행한다. 결과 JSON 의 rows 를 돌려준다. */
function run(text) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked"], {
    cwd: ROOT,
    input: text,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
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
