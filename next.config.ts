import type { NextConfig } from "next";

/**
 * 개발 서버를 같은 와이파이의 폰에서 열기 위한 허용 출처.
 *
 * Next 는 개발 중 localhost 외 출처의 dev 자산·HMR 요청을 막는다. `allowedDevOrigins` 는
 * 요청 Origin 의 **호스트명**을 점(.)으로 나눈 라벨 단위로 매칭하고, `*` 는 라벨 하나에
 * 대응한다. IPv4 는 옥텟이 곧 라벨이라 사설 대역을 패턴으로 쓸 수 있다.
 *
 *   10.0.0.0/8      → 10.*.*.*
 *   192.168.0.0/16  → 192.168.*.*
 *   172.16.0.0/12   → 172.16.*.* … 172.31.*.*  (부분 치환 `172.1*` 은 지원되지 않아 16개 나열)
 *
 * 와이파이가 바뀌어 IP 가 달라져도 사설 대역 안이면 그대로 통한다.
 * `process.env.NODE_ENV === "development"` 일 때만 붙이므로 `next build` 결과에는 없다.
 * (이 옵션은 원래 개발 모드에서만 읽히지만, 의도를 설정 파일에서 보이게 둔다.)
 */
function privateLanOrigins(): string[] {
  const class16 = Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`);
  return ["10.*.*.*", "192.168.*.*", ...class16];
}

const nextConfig: NextConfig = {
  // 서비스 워커는 캐시하지 않는다 — 고친 sw.js 가 바로 퍼져야 한다(Next PWA 가이드와 같은 헤더).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // PDF 내보내기의 한글 글꼴(lib/export/pdf.tsx 가 실행 중에 파일로 읽는다) — 그 경로의 함수에 같이 싣는다
  outputFileTracingIncludes: {
    "/export/pdf": ["./src/lib/export/fonts/*.ttf"],
    // 띄어쓰기 교정의 형태소 분석기 모델 · WASM(lib/spell/kiwi.ts 가 실행 중에 파일로 읽는다) — 이 길의 함수에만 싣는다
    "/api/polish": ["./vendor/kiwi-model/*", "./node_modules/kiwi-nlp/dist/kiwi-wasm.wasm"],
    // 구구 챗봇 답의 기도제목도 같은 분석기로 다듬는다(2026-11-17)
    "/api/gugu/chat": ["./vendor/kiwi-model/*", "./node_modules/kiwi-nlp/dist/kiwi-wasm.wasm"],
  },
  // WASM 을 파일로 읽는 꾸러미 — 묶지 않고 Node 가 그대로 부른다
  serverExternalPackages: ["kiwi-nlp"],
  // push 전 검증 빌드(scripts/verify.mjs)는 별도 디렉터리에 쓴다 — 돌고 있는 개발 서버의
  // .next 를 지우지 않고, 개발 서버가 만든 타입 파일과도 섞이지 않는다.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...(process.env.NODE_ENV === "development"
    ? { allowedDevOrigins: privateLanOrigins() }
    : {}),
};

export default nextConfig;
