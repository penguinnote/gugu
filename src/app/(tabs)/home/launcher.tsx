import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Gugu } from "@/components/gugu";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { PhotoTop } from "@/components/theme-color";
import { PHOTO_WIDE, ReadOnlyBadge } from "@/components/tab-title";
import type { UserContext } from "@/lib/auth/session";
import type { WorldSummary } from "@/lib/berries";
import { groupLabel } from "@/lib/labels";
import { previewWritesBlocked } from "@/lib/preview-guard";
import { STATUS_SKY } from "@/lib/system-bar";
import { createClient } from "@/lib/supabase/server";
import { loadWorldState } from "@/lib/world-state";
import { currentWeekKey } from "@/lib/week";

import { BerryCount } from "./berry-count";
import { type LeaderWeek, LeaderStatus, loadLeaderWeek } from "./leader-status";
import { AdminStatus, OfficerStatus, PastorStatus } from "./role-status";
import { StreakLine } from "./streak-line";

/**
 * 홈 맨 위(2026-10-23 시네마틱) — 실제 로뎀 월드 화면이 화면 끝까지 깔리고 아래로 바탕색에 녹아든다.
 * 위 줄: 구구 얼굴 · 이름(리더는 목장 이름) | 연속 불꽃 · 열매(유리 알약). 아래쪽: '로뎀 월드' + 흰 '들어가기' 알약 → /world.
 * 그림은 public/home/hd-home.webp(월드를 4배로 그려 줄인 1290×1720, 세로 화면을 늘리지 않고 채운다 — unoptimized 로 원본 그대로).
 * 디자인 확인 화면(dev/design)도 같은 것을 쓴다.
 * 홈은 스크롤하지 않는다(2026-10-23) — 그림이 남는 높이를 다 채우고(flex-1), 아래 카드 · 바로가기는 제 높이. HOME_FIT 참고.
 */
export function HomeHero({ title = "구구", aside, readOnly = false, gugu = false }: { title?: string; aside?: ReactNode; readOnly?: boolean; gugu?: boolean }) {
  // 구구 얼굴 칸 44px · 구구 36px(2026-11-12 사용자 요청 — 챗봇 입구라 조금 크게)
  const face = <Gugu size={36} />;
  return (
    <section className={`relative isolate min-h-[200px] w-full flex-1 overflow-hidden ${PHOTO_WIDE}`} data-testid="home-hero">
      {/* 안드로이드 상태바 = 그림 맨 위 색(그늘 0.28 포함, 읽기 전에는 하늘색) */}
      <PhotoTop selector="[data-testid=home-hero]" shade={0.28} fallback={STATUS_SKY} />
      <Image src="/home/hd-home.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(rgb(0_0_0/0.28),transparent_30%,transparent_52%,var(--background)_100%)]" />
      <header className="mx-auto flex w-full gg-col items-center gap-2 px-5 pt-[calc(var(--nn-safe-top)+0.75rem)]">
        {/* 구구 챗봇 입구(2026-11-12 — 탭바 옆에서 옮김): 구구 AI 가 켜져 있으면 목장 이름 왼쪽 구구 얼굴을 누르면 열린다 */}
        {gugu ? (
          <Link
            href="/gugu"
            aria-label="구구에게 물어보기"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgb(0_0_0/0.15)] transition-transform active:scale-90 data-pressing:scale-90"
            data-testid="home-gugu"
          >
            {face}
          </Link>
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgb(0_0_0/0.15)]">{face}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]">{title}</h1>
          {readOnly ? <ReadOnlyBadge /> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </header>
      <div className="absolute inset-x-0 bottom-12 mx-auto flex w-full gg-col items-end gap-3 px-5">
        <p className="min-w-0 flex-1 text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-white [text-shadow:0_2px_14px_rgb(0_0_0/0.35)]">로뎀 월드</p>
        <Link
          href="/world"
          prefetch={false}
          data-testid="world-portal"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-bold text-[#16181d] shadow-[0_4px_14px_rgb(0_0_0/0.18)] transition-[transform,background-color] active:scale-[0.96] active:bg-[#e9ebee] data-pressing:scale-[0.96] data-pressing:bg-[#e9ebee]"
        >
          들어가기
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

/**
 * 홈 한 화면 — 탭바 위까지 딱 맞는 높이(문서 스크롤은 globals.css 의 [data-no-scroll] 이 막는다).
 * 아래 카드가 길어지면(알림 꺼짐 안내 · 쿠폰 제안 등) 그림이 줄어들고, 그래도 넘치면 아래 칸만 안에서 스크롤한다.
 */
/** 맨 위 유리 알약을 누르는 자리 — 누르면 살짝 줄어든다 */
const CHIP_LINK = "rounded-full transition-transform active:scale-95 data-pressing:scale-95";

export const HOME_FIT = "relative flex h-[calc(100dvh-var(--nn-tabbar))] flex-col overflow-hidden";
// 아래 카드 · 바로가기는 제 높이 — 다만 짧은 화면(아이폰 SE 375×667 · 운영자 바로가기 9개 등)에서 그림을 최소 높이까지 줄여도 모자라면
// 잘리지 않고 이 칸 안에서만 스크롤된다(shrink, 2026-11-10 — 전에는 shrink-0 이라 바로가기 아래가 탭바 밑으로 잘렸다)
export const HOME_MAIN = "relative mx-auto -mt-6 flex min-h-0 w-full gg-col shrink flex-col gap-4 overflow-y-auto px-4 pb-3 [&>*]:shrink-0";

/**
 * 홈(런처) — World 1(2026-10-08) · 구구 테마(2026-10-12). 위에서부터
 *   0 맨 위 월드 그림  구구 얼굴 · 목장 이름 | 연속 불꽃 · 열매(유리) · 아래쪽 '로뎀 월드 · 들어가기'(2026-10-23)
 *   1 이번 주 카드    구구가 말을 건네고, 열자마자 할 일이 보인다(02 §2 홈 원칙). 역할별. 리더는 streak · 쿠폰으로 지키기까지
 *   (바로가기 칸은 2026-11-10 뺐다 — 갈 곳은 모두 탭바의 '전체'(lib/all-menu.ts). 그만큼 카드 · 구구를 키웠다)
 */
/** 이번 주 한 건과 열매 — 서로 기다리지 않는다(2026-11-04 — 앱을 켤 때 홈이 늦게 떠서). 실패해도 홈은 그린다 — 열매 자리만 빠진다 */
async function loadHome(me: UserContext, weekKey: string): Promise<[LeaderWeek | null, WorldSummary | null]> {
  if (!me.leadsGroup) return [null, null];
  const t0 = performance.now();
  const res = await Promise.all([
    loadLeaderWeek(me, weekKey),
    createClient()
      .then((supabase) => supabase.rpc("world_summary"))
      .then(({ data }) => (data as WorldSummary | null) ?? null),
  ]);
  // 홈이 늦게 뜨는 까닭 찾기(잠시) — 이름 없이 걸린 시간만 남긴다
  console.info(`[home-timing] data=${Math.round(performance.now() - t0)}ms`);
  return res;
}

/**
 * 열매가 안 보이던 것(2026-11-10) — 운영자 겸 리더는 월드에서 '운영자 집' 열매를 쓰는데, world_summary 는 활동 목장만 셈해서 비어 있었다.
 * 그때만 월드 상태(world_state)의 내 열매를 읽어 맨 위 열매 알약에 쓴다(월드 오른쪽 위 숫자와 같다)
 */
async function worldBerries(): Promise<number | null> {
  const state = await loadWorldState(await createClient());
  return state?.mine ? Number(state.mine.berries) : null;
}

export async function Launcher({ me }: { me: UserContext }) {
  const weekKey = currentWeekKey();
  const [week, summary] = await loadHome(me, weekKey);
  const berries = summary ? Number(summary.berries) : week ? await worldBerries() : null;
  // 구구 챗봇 입구(맨 위 구구 얼굴 · 카드 속 구구) — 구구 AI 가 켜져 있고 리더 · 목사님일 때만
  const chat = (me.leadsGroup || me.role === "pastor") && guguAiEnabled();
  return (
    // data-home-ready — 홈이 다 그려졌다는 표시. 뒤로가기 덫 칸을 이때 덮는다(lib/nav-history — 아이폰 밀기 미리보기에 불러오기 화면이 찍히지 않게)
    <div className={HOME_FIT} data-home-ready data-no-scroll>
      <HomeHero
        title={me.leadsGroup ? groupLabel(me.groupName) : "구구"}
        readOnly={previewWritesBlocked()}
        gugu={chat}
        aside={
          week ? (
            // 누르면 연속 → 기록, 열매 → 상점(2026-11-15 사용자 요청)
            <>
              <Link href="/records" aria-label="기록 보기" className={CHIP_LINK} data-testid="home-streak-link">
                <StreakLine streak={week.streak} variant="chip" />
              </Link>
              {berries !== null ? (
                <Link href="/shop" aria-label="상점 가기" className={CHIP_LINK} data-testid="home-berry-link">
                  <BerryCount berries={berries} groupName={me.groupName} />
                </Link>
              ) : null}
            </>
          ) : null
        }
      />
      <main className={HOME_MAIN}>
        {me.leadsGroup && week ? (
          <LeaderStatus weekKey={weekKey} summary={summary} week={week} chat={chat} />
        ) : me.role === "pastor" ? (
          <PastorStatus weekKey={weekKey} chat={chat} />
        ) : me.role === "officer" ? (
          <OfficerStatus weekKey={weekKey} />
        ) : (
          <AdminStatus weekKey={weekKey} />
        )}
      </main>
    </div>
  );
}
