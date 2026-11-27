import { previewWritesBlocked } from "@/lib/preview-guard";

import { BackButton } from "./back-button";
import { ReadOnlyBadge } from "./tab-title";
import { StatusTop } from "./theme-color";

/**
 * 안쪽 화면(명단 · 운영 · 내보내기 · 보고서 작성 …)의 머리 — 2026-11-11 사용자 선택 B안(토스처럼).
 * 바탕색 위에 왼쪽 ‹ 단추 하나만, 위에 붙어 있다. 큰 제목(26px)은 화면 맨 위 내용으로 두어 스크롤하면 같이 올라간다.
 * ‹ 는 들어온 곳으로(아이폰 밀기 · 안드로이드 뒤로와 같다), 바로 열었으면 back 으로. 예전 하늘색 띠 · 구구 로고 · '내 정보' 는 뺐다
 * ('내 정보' 는 전체 탭에 있다). 상태바는 바탕색.
 */
/** wide — 1024px 이상에서 넓은 배치(1200px)인 화면(제출 현황 · 목장보고서 · 출석부 · 명단, 2026-11-27)이면 ‹ 를 본문 왼쪽 끝에 맞춘다 */
export function AppHeader({ back = "/", wide = false }: { back?: string; wide?: boolean }) {
  // 출시 뒤 프리뷰는 읽기 전용이다(Step 9c). 화면에서 바로 알 수 있게 — 저장이 왜 안 되는지 헤매지 않도록.
  const readOnly = previewWritesBlocked();
  return (
    <header className="sticky top-0 z-10 bg-[var(--background)] pt-[var(--nn-safe-top)] print:hidden">
      <StatusTop color={null} />
      <div className={`mx-auto flex h-[52px] w-full gg-col items-center justify-between px-2 ${wide ? "lg:max-w-[1200px] lg:px-5" : ""}`}>
        <BackButton fallback={back} />
        {readOnly ? <ReadOnlyBadge /> : null}
      </div>
    </header>
  );
}
