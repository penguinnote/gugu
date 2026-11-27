#!/usr/bin/env node
/**
 * npm run verify — push 전에 반드시 통과해야 하는 것들.
 *
 * 왜 있나. 2026-09-29 에 타입 오류가 있는 커밋이 push 됐다. Vercel 은 빌드에 실패하면 이전
 * 버전을 유지하므로 사이트는 안 죽지만, 배포가 안 된 채로 "됐다" 고 믿게 된다. 출시 직전에
 * 이러면 당일에야 안다. 사람이 기억하는 체크리스트는 반복해서 실패하므로 git 훅으로 건다
 * (.githooks/pre-push — npm install 의 prepare 가 걸어 둔다).
 *
 * 순서는 빠른 것부터: 린트 → 화면 테스트 → RLS 테스트 → 프로덕션 빌드.
 * 빌드는 .next-verify 에 쓴다 — 돌고 있는 개발 서버의 .next 와 충돌하지 않는다.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prePush = process.argv.includes("--pre-push");

const steps = [
  { name: "lint", cmd: "npx", args: ["eslint", ".", "--max-warnings", "0"] },
  { name: "test:ui", cmd: "npx", args: ["vitest", "run"] },
  {
    name: "test:rls",
    cmd: "node",
    // spawn 은 글롭을 풀지 않으므로 파일을 직접 나열한다
    args: ["--test", ...readdirSync(path.join(ROOT, "tests/rls")).filter((f) => f.endsWith(".test.mjs")).map((f) => `tests/rls/${f}`)],
  },
  { name: "build", cmd: "npx", args: ["next", "build"], env: { NEXT_DIST_DIR: ".next-verify" } },
];

// 라우트 파일을 옮긴 뒤에는 이전 빌드·개발 서버가 만든 타입 검증 파일(.next/types, .next/dev/types)이
// 옛 경로를 가리켜 빌드 타입 검사가 깨진다(2026-09-29). tsconfig 가 그 둘을 include 하므로 빌드 전에
// 지운다 — 개발 서버는 다음 요청에서 다시 만든다.
for (const stale of [".next/types", ".next/dev/types", ".next-verify/types", ".next-verify/dev/types"]) {
  rmSync(path.join(ROOT, stale), { recursive: true, force: true });
}

const t0 = Date.now();
console.log(prePush ? "pre-push 검증 — 통과해야 push 된다" : "검증");
for (const s of steps) {
  const started = Date.now();
  process.stdout.write(`  ${s.name.padEnd(9)} … `);
  const r = spawnSync(s.cmd, s.args, {
    cwd: ROOT,
    encoding: "utf8",
    // FORCE_COLOR 는 값이 "0" 이어도 '있다' 는 것만으로 vitest(tinyrainbow)가 색을 강제한다 — NO_COLOR 로 끈다
    env: { ...process.env, ...(s.env ?? {}), CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`통과 (${secs}s)`);
    continue;
  }
  console.log(`실패 (${secs}s)`);
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).replace(/\x1b\[[0-9;]*m/g, "");
  // 전체 출력은 파일로 남긴다 — 한 번 실패하고 다시 돌리면 통과하는 흔들림도 나중에 원인을 볼 수 있게(2026-11-10)
  const logDir = path.join(ROOT, ".verify-logs");
  const logFile = path.join(logDir, `${s.name.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  try {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(logFile, out);
  } catch {
    /* 기록 실패는 검증 결과를 바꾸지 않는다 */
  }
  const lines = out.split("\n").filter((l) => l.trim());
  // 실패 원인만 — 테스트는 실패한 시험 이름(FAIL · ×)과 기대/실제 값, 빌드는 'error' 줄을 우선 보여준다
  const focus = lines
    .filter((l) => /FAIL|×|✗|✖|not ok|error|Expected|Received|Assertion|Timed out|failed/i.test(l))
    .slice(0, 60);
  console.error((focus.length ? focus : lines.slice(-40)).join("\n"));
  const tail = focus.length ? lines.slice(-8).filter((l) => !focus.includes(l)) : [];
  if (tail.length) console.error(tail.join("\n"));
  if (r.error) console.error(String(r.error));
  console.error(`\n전체 출력: ${path.relative(ROOT, logFile)}`);
  console.error(`✖ ${s.name} 이 실패했다. push 하지 않는다. 고친 뒤 다시 push 한다.`);
  process.exit(1);
}
console.log(`✔ 전부 통과 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
