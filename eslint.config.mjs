import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-verify/**", // push 전 검증 빌드(scripts/verify.mjs)의 출력
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**", // 작업 도구 폴더(따로 만든 작업 사본 · 시험 화면) — 커밋하지 않는다
  ]),
]);

export default eslintConfig;
