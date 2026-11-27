import { defineConfig } from "vitest/config";

/** AI 주간 정리 평가 — 실제 API 를 부른다. npm run eval:digest */
export default defineConfig({
  test: { environment: "node", include: ["eval/digest/run.test.ts"], testTimeout: 180_000 },
});
