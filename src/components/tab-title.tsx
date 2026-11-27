import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { StatusVeil } from "./status-veil";

/**
 * 탭 첫 화면 맨 위의 모양 — 왼쪽 위 큰 제목 · 아래 한 줄 · 오른쪽 작은 것 하나.
 * 서버 화면은 TabHeader(프리뷰 읽기 전용 표시를 스스로 판단)를, 클라이언트 화면(상점)은 이것을 직접 쓴다.
 * photo 를 주면(2026-10-23 시네마틱) 월드 그림이 화면 끝까지 깔리고 아래로 바탕색에 녹아들며, 제목은 그림 위 흰 글씨.
 * 상태바가 비쳐(black-translucent) 그림이 시계 자리까지 올라가고, 스크롤해 그림이 지나가면 시계 자리에 바탕색 유리가 깔린다(StatusVeil).
 *   목장 = 우리 목장 집 안(월드가 찍은 사진, 없으면 빈 이름판 hd-room-blank.webp + photoLabel),
 *   상점 = 집과 마당 물건이 좌우로 같은 그림(hd-shop-sym.webp — 2026-11-16, 그 전엔 놀이터 hd-play.webp), 기록 = 가운데에 로뎀나무가 선 좌우 같은 그림(hd-records-sym.webp — 2026-11-16, 그 전엔 hd-records.webp — 2026-11-15, 예전엔 마을 · 연못)
 *   그림은 월드를 4배로 그려 줄인 1290px(화면에 보이는 크기 그대로) — 다시 누르지 않게 unoptimized 로 원본을 그대로 쓴다
 * 홈은 따로 그린다(home/launcher.tsx HomeHero).
 */
export function TabTitle({
  title,
  sub,
  aside,
  readOnly = false,
  photo,
  photoLabel,
  photoHref,
  compact = false,
  pin = false,
  pinDrop = 0,
  pinTop = false,
  pinMid = false,
}: {
  title: string;
  sub?: ReactNode;
  aside?: ReactNode;
  readOnly?: boolean;
  photo?: string;
  /** 기본 집 안 그림(hd-room-blank)의 빈 이름판에 얹는 글씨 — '토브 목장' */
  photoLabel?: string;
  /** 그림을 누르면 가는 곳 */
  photoHref?: string;
  /** 낮은 머리(상점 — 그림이 없는 고른 색 판이라 크게 둘 까닭이 없다) */
  compact?: boolean;
  /**
   * 고정 머리(2026-11-15 사용자 요청 — 목장 · 기록): 천장(그림 위쪽)을 반쯤 줄인 낮은 그림, 아래에 붙여 잘라 쓴다.
   * 화면은 FixedPage 로 감싸 문서가 움직이지 않고 그 아래 칸만 스크롤된다. 그림이 늘 보이므로 시계 자리 유리(StatusVeil)는 켜지 않는다
   */
  pin?: boolean;
  /** 고정 머리를 이만큼(px) 더 높인다 — 그림이 아래에 붙어 있어 그만큼 그림이 내려온다(목장 8px ≈ 0.2cm, 2026-11-15 — 이름판이 시계에 가리지 않게) */
  pinDrop?: number;
  /** 고정 머리에서 그림을 위에 붙인다(기록 — 로뎀나무가 잘리지 않고 아래 풀밭이 잘린다). 기본은 아래에 붙인다(목장 — 천장이 잘린다) */
  pinTop?: boolean;
  /** 고정 머리에서 그림을 가운데에 둔다(기록 — 위아래 · 좌우가 대칭인 그림, 2026-11-16). 위아래로 같은 만큼 잘린다 */
  pinMid?: boolean;
}) {
  if (photo) {
    const art = (
      <>
        {photoLabel ? (
          // 그림과 같은 비율의 판을 object-cover 처럼 채워 깔고, 그 위 이름판 자리(가운데 · 위에서 35.6% — 2026-11-10 빈 방 그림)에 월드와 같은 글씨로 얹는다
          <div
            className={`absolute left-1/2 -z-10 aspect-[1290/1092] w-[max(100cqw,calc(100cqh*1290/1092))] -translate-x-1/2 [container-type:inline-size] ${pin ? "bottom-0" : "top-1/2 -translate-y-1/2"}`}
          >
            <Image src={photo} alt="" fill priority unoptimized sizes="100vw" className="object-cover" />
            <span className="absolute top-[35.6%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-[family-name:var(--font-round)] text-[2.97cqw] leading-none whitespace-nowrap text-[#6b4a33]">
              {photoLabel}
            </span>
          </div>
        ) : (
          <Image src={photo} alt="" fill priority unoptimized sizes="100vw" className={`-z-10 object-cover ${pin ? (pinMid ? "object-center" : pinTop ? "object-top" : "object-bottom") : ""}`} />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(rgb(0_0_0/0.3),transparent_30%,rgb(0_0_0/0.24)_64%,var(--background)_100%)]" />
      </>
    );
    return (
      <>
        <StatusVeil shade={PHOTO_SHADE} fallback={PHOTO_TOP[photo] ?? null} never={pin} />
        <div
          className={`${compact ? PHOTO_H_COMPACT : pin ? PHOTO_H_PIN : PHOTO_H} relative isolate w-full shrink-0 overflow-hidden [container-type:size] ${PHOTO_WIDE}`}
          data-testid="tab-photo"
          data-pin={pin && !compact ? "" : undefined}
          style={pin && !compact && pinDrop ? { height: `calc(clamp(176px, 26vh, 216px) + ${pinDrop}px + var(--nn-safe-top))` } : undefined}
        >
          {art}
          {photoHref ? <Link href={photoHref} prefetch={false} aria-label="캐릭터 꾸미기" className="absolute inset-0" /> : null}
          <header className={`pointer-events-none relative mx-auto flex h-full w-full gg-col items-end justify-between gap-3 px-5 [&_a]:pointer-events-auto [&_button]:pointer-events-auto ${compact ? "pb-6" : "pb-10"}`}>
            <div className="min-w-0 space-y-1 text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.4)]">
              {sub ? <p className="text-[13px] font-semibold text-white/90">{sub}</p> : null}
              <h1 className="gg-display truncate text-[30px] leading-tight">{title}</h1>
              {readOnly ? <ReadOnlyBadge /> : null}
            </div>
            {aside ? <div className="shrink-0">{aside}</div> : null}
          </header>
        </div>
      </>
    );
  }
  return (
    <header className="mx-auto flex w-full gg-col items-end justify-between gap-3 px-5 pt-[calc(var(--nn-safe-top)+1.25rem)]">
      <div className="min-w-0 space-y-1.5">
        <h1 className="gg-display truncate text-[30px] leading-none">{title}</h1>
        {sub ? <p className="text-[13px] text-muted">{sub}</p> : null}
        {readOnly ? <ReadOnlyBadge /> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}

/**
 * 넓은 화면(2026-11-27, 768px 이상) — 그림 머리는 본문 열(640px)을 넘지 않게 가운데에, 아래 모서리를 둥글게.
 * 그림은 늘 object-cover 라 비율이 그대로다(늘이지 않고 잘라 채운다)
 */
export const PHOTO_WIDE = "md:mx-auto md:max-w-[640px] md:rounded-b-[28px]";
/** 그림 머리 높이 — 시계 자리만큼 더 높다(그림이 시계 밑까지 올라가도 보이는 부분은 그대로) */
/** 그림 위 그늘의 맨 위 알파 — 아래 linear-gradient 의 첫 값과 같다 */
const PHOTO_SHADE = 0.3;
/** 기본 그림들의 맨 위 색(그늘 포함) — 그림을 읽기 전 상태바 색. 월드가 찍은 사진은 받은 뒤 읽는다 */
const PHOTO_TOP: Record<string, string> = {
  "/home/hd-room-blank.webp": "#aba69c",
  "/home/hd-avatar.webp": "#5e8aa9",
  "/home/hd-play.webp": "#678da8",
  "/home/hd-records.webp": "#5f8aa8",
  // 2026-11-16 — 좌우가 거울처럼 같은 그림(가운데에 로뎀나무 · 가운데에 집), 위아래도 가운데에 맞췄다
  "/home/hd-shop-sym.webp": "#5d88a9",
  "/home/hd-records-sym.webp": "#5d88a9",
};
const PHOTO_H = "h-[calc(clamp(220px,32vh,264px)+var(--nn-safe-top))]";
const PHOTO_H_COMPACT = "h-[calc(136px+var(--nn-safe-top))]";
/** 고정 머리 — PHOTO_H 에서 천장 몫(그림 높이의 약 15%)만큼 낮다. 그림은 아래에 붙여 위쪽(천장)을 자른다 */
const PHOTO_H_PIN = "h-[calc(clamp(176px,26vh,216px)+var(--nn-safe-top))]";

/**
 * 고정 머리 화면(2026-11-15 목장 · 기록) — 탭바 위까지 딱 맞는 높이, 문서는 움직이지 않는다([data-no-scroll]).
 * 머리 그림과 stuck(기록의 우리 목장 박스)은 제자리, children 만 그 아래 칸 안에서 스크롤된다.
 */
export function FixedPage({ header, stuck, children }: { header: ReactNode; stuck?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-var(--nn-tabbar))] flex-col overflow-hidden" data-no-scroll data-testid="fixed-page">
      {header}
      {stuck ? <div className="mx-auto w-full gg-col shrink-0 px-4 pt-1 pb-3">{stuck}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="fixed-scroll">
        {children}
      </div>
    </div>
  );
}

/** 그림 위에 얹는 유리 알약(목장 '프로필' · 상점 열매) — 홈의 연속 · 열매 칩과 같은 결 */
export const GLASS_PILL =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-white/25 bg-black/25 px-3.5 text-[14px] font-semibold text-white backdrop-blur-xl [text-shadow:none]";

export function ReadOnlyBadge() {
  return (
    <span className="inline-block rounded-full bg-[var(--gg-field)] px-2 py-0.5 text-[10px] font-semibold text-muted [text-shadow:none]" data-testid="preview-readonly">
      프리뷰 · 읽기 전용
    </span>
  );
}
