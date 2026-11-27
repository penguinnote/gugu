#!/usr/bin/env node
/**
 * npm run db:seed — 시드를 원격에 적용하고 **행 수로 검증**한다.
 *
 * 왜 스크립트인가
 *   `supabase db push --include-seed` 는 이미 기록된 경로의 시드가 바뀌어도 실행하지
 *   않고 "Updating seed hash" 만 찍는 경우가 있다(2026-09-27 에 두 번 확인). 사람이
 *   출력을 필터하면 그것을 "Finished" 로 착각한다. 그래서
 *     ① 시드 두 파일을 **새 경로**로 복사해 적용한다 — 새 경로는 항상 실행됐다
 *     ② 출력 전체를 그대로 보여주고 종료 코드·ERROR 를 검사한다
 *     ③ 적용 뒤 원격 행 수를 읽어 기대값과 비교한다. 하나라도 어긋나면 실패다
 *
 * 시드는 두 파일이다 — seed_accounts.sql(계정, 있으면 건드리지 않음) →
 * seed.sql(명단·기록, 계정은 지우지 않음). 실제 계정과 그 연결은 유지된다.
 *
 * config.toml 의 sql_paths 를 잠깐 바꾸고 반드시 되돌린다. 복사본은
 * supabase/seeds_run/ 에 남지 않도록 실행 후 지운다.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "supabase/config.toml");
const RUN_DIR = path.join(ROOT, "supabase/seeds_run");

const EXPECTED = { groups: 12, persons: 80, reports: 48, weekly_records: 320 };

const supabase = (args, capture = false) =>
  spawnSync("npx", ["supabase", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });

// 실명단 위에 가명 시드를 얹는 정당한 경우는 없다. --force 도 두지 않는다.
{
  const r = supabase(["db", "query", "--linked", "select value from public.app_meta where key = 'roster_source'"], true);
  const real = /"value"\s*:\s*"real"/.test(r.stdout ?? "");
  if (real) {
    console.error("db:seed 거부 — 원격 명단이 실명단(app_meta.roster_source = real)이다. 가명 시드를 그 위에 얹을 수 없다.");
    console.error("명단을 갱신하려면 npm run roster:import, 데모 기록을 지우려면 npm run demo:clear 를 쓴다.");
    process.exit(2);
  }
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const original = readFileSync(CONFIG, "utf8");
const line = original.match(/^sql_paths = .*$/m);
if (!line) {
  console.error("✖ config.toml 에서 [db.seed] sql_paths 를 찾지 못했습니다.");
  process.exit(1);
}

mkdirSync(RUN_DIR, { recursive: true });
const copies = ["seed_accounts.sql", "seed.sql"].map((f) => {
  const dest = path.join(RUN_DIR, `${stamp}_${f}`);
  copyFileSync(path.join(ROOT, "supabase", f), dest);
  return `./seeds_run/${stamp}_${f}`;
});

let push;
try {
  writeFileSync(CONFIG, original.replace(line[0], `sql_paths = ${JSON.stringify(copies)}`));
  console.log(`▶ 시드 적용: ${copies.join(" → ")}`);
  push = supabase(["db", "push", "--linked", "--include-seed"]);
  process.stdout.write(push.stdout ?? "");
  process.stderr.write((push.stderr ?? "").replace(/^A new version.*\n|^We recommend.*\n/gm, ""));
} finally {
  writeFileSync(CONFIG, original);
  rmSync(RUN_DIR, { recursive: true, force: true });
}

const out = `${push.stdout ?? ""}\n${push.stderr ?? ""}`;
if (push.status !== 0) {
  console.error(`\n✖ db push 가 종료 코드 ${push.status} 로 끝났습니다.`);
  process.exit(1);
}
if (/\bERROR\b|SQLSTATE/.test(out)) {
  console.error("\n✖ 출력에 ERROR 가 있습니다. 시드가 적용되지 않았습니다.");
  process.exit(1);
}
for (const c of copies) {
  if (!out.includes(`Seeding data from supabase/${c.replace("./", "")}`)) {
    console.error(`\n✖ ${c} 가 실행되지 않았습니다 ("Seeding data from" 이 없음).`);
    process.exit(1);
  }
}

console.log("\n▶ 행 수 확인: supabase inspect db table-stats --linked");
const stats = supabase(["inspect", "db", "table-stats", "--linked"], true);
const json = (stats.stdout ?? "").split("\n").find((l) => l.trim().startsWith("{"));
if (!json) {
  console.error("✖ table-stats 결과를 읽지 못했습니다.");
  process.stderr.write(stats.stderr ?? "");
  process.exit(1);
}
const counts = Object.fromEntries(
  (JSON.parse(json).rows ?? []).map((r) => [
    r.name.replace(/^public\./, ""),
    Number(r.estimated_row_count ?? r.rows ?? NaN),
  ]),
);

let ok = true;
for (const [table, expected] of Object.entries(EXPECTED)) {
  const actual = counts[table];
  const pass = actual === expected;
  ok &&= pass;
  console.log(`  ${pass ? "✔" : "✖"} ${table.padEnd(16)} ${String(actual).padStart(4)}  (기대 ${expected})`);
}
console.log(`  ℹ users            ${String(counts.users ?? "?").padStart(4)}  (가짜 49 + 실제 계정. 지우지 않는다)`);

if (!ok) {
  console.error("\n✖ 행 수가 기대와 다릅니다. 시드가 적용되지 않았거나 다른 데이터가 섞여 있습니다.");
  process.exit(1);
}
console.log("\n✔ 시드 적용 확인");
