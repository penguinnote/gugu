import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * 화면(클라이언트 컴포넌트) 테스트. DB 정책 테스트는 tests/rls (node --test, PGlite) 가
 * 따로 맡는다. 여기는 jsdom 위에서 React 를 실제로 그려 "사용자가 아무것도 안 눌렀는데
 * 값이 바뀌었는가" 같은 배선 문제를 잡는다.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/ui/**/*.test.tsx"],
  },
});
