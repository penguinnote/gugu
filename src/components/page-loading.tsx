import { AppHeader } from "./app-header";

/**
 * 안쪽 화면 불러오기(2026-11-11 — 누르는 즉시 넘어가는 느낌). 화면 폴더마다 loading.tsx 가 이것을 쓴다:
 * Next 가 이 껍데기를 미리 받아 두어(부분 미리 받기) 링크를 누르면 바로 이 화면으로 넘어가고, 내용이 오면 갈아 끼운다.
 * 모양은 안쪽 화면과 같다 — ‹ 머리 · 큰 제목 자리 · 흰 카드 둘(옅게 깜빡). 글씨는 없다.
 */
export function PageLoading() {
  const bar = "rounded-full bg-[var(--gg-line)]";
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8" aria-busy="true" data-testid="page-loading">
        <div className={`gg-skel h-[30px] w-[45%] ${bar}`} />
        {[0, 1].map((k) => (
          <div key={k} className="gg-skel space-y-3 rounded-[22px] bg-[var(--gg-card)] px-4 py-4 shadow-[var(--gg-card-shadow)]">
            <div className={`h-4 w-[38%] ${bar}`} />
            <div className={`h-3.5 w-[86%] ${bar}`} />
            <div className={`h-3.5 w-[72%] ${bar}`} />
            <div className={`h-3.5 w-[64%] ${bar}`} />
          </div>
        ))}
      </main>
    </>
  );
}
