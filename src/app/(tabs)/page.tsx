import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { TERMS_VERSION } from "@/lib/terms";

import { Launcher } from "./home/launcher";

/**
 * `/` — 홈 탭. World 1(2026-10-08)부터 역할별 런처다(home/launcher.tsx):
 *   맨 위 '구구' 한 줄 → 이번 주 카드(구구가 말을 건넨다, 역할별) → 로뎀 월드 입구 → 바로가기(역할별).
 *   리더(명단상, 운영자 겸임 포함)  이번 주 상태 · 작성하기 · streak — 2단계 리더 홈의 윗부분
 *   목사님                         제출 N/M 한 줄. 전체 제출 현황(P-1)은 /pastor
 *   운영자(명단 밖)                 승인 대기 한 줄. 운영 홈은 /admin
 *   임원진(명단 밖, 2026-10-30)     전체 명단으로 가는 한 장
 *   미승인                          /apply (탭바 없음)
 * 로그인 안 했으면 프록시가 먼저 /login 으로 보내지만, 낙관적 확인이라 여기서 한 번 더 본다.
 */
/** 앱을 켤 때 홈이 늦게 뜨는 까닭 찾기(2026-11-04, 잠시) — 이름 없이 걸린 시간만 남긴다 */
async function timedUserContext() {
  const t0 = performance.now();
  const me = await getUserContext();
  console.info(`[home-timing] ctx=${Math.round(performance.now() - t0)}ms role=${me?.role ?? "none"}`);
  return me;
}

export default async function HomePage() {
  const me = await timedUserContext();
  if (!me) redirect("/login");
  // 첫 접속 동의(2026-11-13) — 홈은 requireUser 를 거치지 않아 여기서 따로 본다
  if (me.termsVersion !== TERMS_VERSION) redirect("/terms");
  if (me.role === "pending") redirect("/apply");

  if (me.leadsGroup || me.role === "pastor" || me.role === "admin" || me.role === "officer") return <Launcher me={me} />;

  // leader 인데 명단상 리더가 아닌 경우(휴면·미배정) — 내 정보의 안내로
  redirect("/me");
}
