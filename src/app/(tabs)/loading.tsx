import { Gugu } from "@/components/gugu";

/**
 * 탭 화면을 옮겨 갈 때의 불러오기 화면 — 누르는 즉시 뜬다(미리 받아 둔 껍데기). 화면이 다 그려지면 자동으로 바뀐다.
 * 구구가 제자리에서 날갯짓하며 둥실, 아래에 '잠깐만요' 와 점 셋. 탭바는 그대로 남는다.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full gg-col flex-1 flex-col items-center justify-center gap-4 px-5 py-16" aria-busy="true">
      <div className="gg-bob">
        <Gugu view="fly" size={86} />
      </div>
      <p className="gg-display flex items-center gap-1 text-[19px] text-[var(--gg-sky-ink)]" role="status">
        잠깐만요
        <span className="gg-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </p>
    </main>
  );
}
