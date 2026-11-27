import Link from "next/link";

import { Gugu } from "@/components/gugu";
import { TabTitle } from "@/components/tab-title";

/**
 * 404 — 없는 주소와 권한 없는 화면이 똑같이 여기로 온다(requireRole 은 403 이 아니라
 * notFound). 그래서 문구는 기본 404 와 같은 수준으로만 말하고, 갈 곳 하나만 준다.
 * `/` 는 갈림길이라 로그인 여부·역할에 맞는 첫 화면으로 알아서 보낸다. 구구 테마: 고개를 갸웃(옆모습)하는 구구.
 */
export default function NotFound() {
  return (
    <>
      {/* 맨 위는 월드 그림 — 시계 자리까지 이어진다(2026-10-23) */}
      <TabTitle title="구구" photo="/home/hd-home.webp" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 pt-4 pb-16 text-center">
        <Gugu view="side" size={120} />
        <div className="space-y-2">
          <p className="gg-display text-[44px] leading-none text-[var(--gg-sky-ink)] tabular-nums">404</p>
          <p className="text-[15px] leading-relaxed text-muted">페이지를 찾을 수 없습니다.</p>
        </div>
        <Link href="/" className="gg-btn gg-btn-sky w-full">
          홈으로
        </Link>
      </main>
    </>
  );
}
