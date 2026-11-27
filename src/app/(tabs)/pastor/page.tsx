import { PastorHomeScreen } from "./pastor-home-screen";

/**
 * P-1 목사님 제출 현황. 2단계(2026-09-30)엔 홈(`/`)이었고 이 경로는 리다이렉트였다.
 * World 1(2026-10-08)부터 홈은 런처라 제출 현황 본체는 여기서 그린다(주차 이동도 ?week= 로 여기서).
 * 상세(/pastor/reports/[group])는 그대로.
 */
export default async function PastorHomePage({ searchParams }: PageProps<"/pastor">) {
  return <PastorHomeScreen searchParams={searchParams} basePath="/pastor" />;
}
