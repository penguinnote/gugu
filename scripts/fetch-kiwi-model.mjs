// 띄어쓰기 교정에 쓰는 Kiwi 형태소 분석기 모델(약 104MB)을 vendor/kiwi-model 에 받는다(2026-11-16).
// 저장소에 넣기엔 커서 빌드 때 받는다(npm run build 앞에 돈다 — package.json prebuild). 이미 있으면 건너뛴다.
// 받지 못해도 빌드는 계속한다 — 그러면 띄어쓰기는 규칙에 있는 것만 고친다(lib/spell/kiwi.ts 가 없는 모델을 견딘다).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "0.24.1"; // package.json 의 kiwi-nlp 와 같은 판
const URL = `https://github.com/bab2min/Kiwi/releases/download/v${VERSION}/kiwi_model_v${VERSION}_base.tgz`;
const OUT = join(process.cwd(), "vendor", "kiwi-model");
const MARK = join(OUT, `.v${VERSION}`);

// 표시 파일만 있고 모델 본체(cong.mdl)가 빠진 채 남은 적이 있다(2026-11-23 — 받다 끊겨서). 그러면 분석기 시험이 늘 건너뛰어졌다.
// 그래서 표시 파일과 본체가 모두 있어야 건너뛴다.
if (existsSync(MARK) && existsSync(join(OUT, "cong.mdl"))) process.exit(0);
try {
  const tmp = join(process.cwd(), "vendor", ".kiwi-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(join(tmp, "m.tgz"), Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["xzf", join(tmp, "m.tgz"), "-C", tmp]);
  const src = join(tmp, "models", "cong", "base");
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(src)) renameSync(join(src, f), join(OUT, f));
  writeFileSync(MARK, "");
  rmSync(tmp, { recursive: true, force: true });
  console.log(`kiwi model v${VERSION} → vendor/kiwi-model`);
} catch (e) {
  console.warn(`kiwi model 을 받지 못했어요(띄어쓰기는 규칙만으로): ${e instanceof Error ? e.message : e}`);
}
