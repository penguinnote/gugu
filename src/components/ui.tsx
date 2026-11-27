import type { ReactNode } from "react";

import { Gugu, type GuguMood, type GuguView } from "./gugu";

/**
 * 화면 공통 조각 — 구구 테마(2026-10-12) → 새 얼굴(2026-10-23 시네마틱 · 라임). 말을 거는 마스코트는 빈 화면에서만.
 *   CARD        카드 — 테두리 없이 옅은 그림자(globals.css .gg-card)
 *   BTN         알약 단추 — 누르면 살짝 작아진다. 색: sky(라임, 기본) · leaf · sun · berry · white
 *   TINT        옅은 바탕 + 그 위 글씨 여섯 가지(라임 · 잎 · 해 · 열매 · 라일락 · 돌)
 *   IconTile    둥근 사각 안 선 그림 아이콘(회색 칸, 살펴볼 것만 제 색)
 *   SectionHead 카드 머리 — 아이콘 · 제목(둥근 글씨) · 한 줄 설명 · 오른쪽 것
 *   GuguSays    구구 + 말풍선 — 화면이 사용자에게 건네는 한마디
 *   Pill        작은 알약(마감 · 연속 · 상태)
 */
export const CARD = "gg-card";

export type BtnTone = "sky" | "leaf" | "sun" | "berry" | "stone" | "white" | "ghost";
export function BTN(tone: BtnTone = "sky", size: "md" | "sm" = "md"): string {
  return `gg-btn gg-btn-${tone}${size === "sm" ? " gg-btn-sm" : ""}`;
}

export type Tint = "sky" | "leaf" | "sun" | "berry" | "lilac" | "stone";
export const TINT: Record<Tint, string> = {
  sky: "bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]",
  leaf: "bg-[var(--gg-leaf-soft)] text-[var(--gg-leaf-ink)]",
  sun: "bg-[var(--gg-sun-soft)] text-[var(--gg-sun-ink)]",
  berry: "bg-[var(--gg-berry-soft)] text-[var(--gg-berry-ink)]",
  lilac: "bg-[var(--gg-lilac-soft)] text-[var(--gg-lilac-ink)]",
  stone: "bg-[var(--gg-stone-soft)] text-[var(--gg-stone-ink)]",
};
/** 진한 색 칸(고른 칸 · 아이콘 타일) — 납작한 바탕, 라임 위엔 어두운 글씨 */
export const SOLID: Record<Tint, string> = {
  sky: "bg-[var(--gg-sky)] text-[var(--gg-on-sky)]",
  leaf: "bg-[var(--gg-leaf)] text-[var(--gg-on-sky)]",
  sun: "bg-[var(--gg-sun)] text-[#5a3a00]",
  berry: "bg-[var(--gg-berry)] text-white",
  lilac: "bg-[var(--gg-lilac)] text-white",
  stone: "bg-[var(--gg-stone)] text-white",
};

/** 24칸 선 그림 — 화면들이 쓰는 것만 */
export const ICON = {
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5",
  home: "M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0",
  admin: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  export: "M12 4v11M8 11l4 4 4-4M5 19h14",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5M16 5.5a3 3 0 0 1 0 5.5M18 14.8c1.5.6 2.5 2 3 4.2",
  sprout: "M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  check: "M5 12.5l4.2 4.2L19 7",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  write: "M5 19h4l10-10-4-4L5 15v4zM13 7l4 4",
  history: "M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v3h3",
  flame: "M12.6 2.5c.4 3-1.4 4.6-2.9 6.2C8.2 10.3 7 11.9 7 14.4A5 5 0 0 0 12 19.5a5 5 0 0 0 5-5.1c0-2.1-.9-3.6-1.9-4.8-.2 1.3-.9 2.2-1.9 2.6.6-2.9.1-6.4-.6-9.7z",
} as const;

export function Icon({ d, className = "h-5 w-5", strokeWidth = 2 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** 아이콘 칸(2026-10-23 새 얼굴) — 강조색은 하나라서 칸은 회색 바탕에 선 아이콘. 해빛 · 열매빛(살펴볼 것)만 옅은 제 색 */
const TILE: Record<Tint, string> = {
  sky: "bg-[var(--gg-field)] text-foreground",
  leaf: "bg-[var(--gg-field)] text-foreground",
  lilac: "bg-[var(--gg-field)] text-foreground",
  stone: "bg-[var(--gg-field)] text-foreground",
  sun: TINT.sun,
  berry: TINT.berry,
};
export function IconTile({ d, tint, size = "md" }: { d: string; tint: Tint; size?: "sm" | "md" }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${size === "sm" ? "size-8 rounded-[11px]" : "size-10 rounded-[13px]"} ${TILE[tint]}`}>
      <Icon d={d} className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} />
    </span>
  );
}

export function SectionHead({ icon, tint, title, sub, aside, id }: { icon: string; tint: Tint; title: ReactNode; sub?: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start gap-3">
      <IconTile d={icon} tint={tint} />
      <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
        <h2 id={id} className="gg-display text-[17px] leading-snug">
          {title}
        </h2>
        {sub ? <p className="text-[12.5px] leading-relaxed text-muted">{sub}</p> : null}
      </div>
      {aside ? <div className="shrink-0 pt-1">{aside}</div> : null}
    </div>
  );
}

export function Pill({ tint, children, className = "", testId }: { tint: Tint; children: ReactNode; className?: string; testId?: string }) {
  return (
    <span className={`gg-pill ${TINT[tint]} ${className}`} data-testid={testId}>
      {children}
    </span>
  );
}

/**
 * 구구가 하는 말 — 왼쪽에 구구, 오른쪽에 말풍선. 화면 맨 위에서 "지금 무엇을 하면 되는지" 를 한마디로.
 * lines 로 주면 한 줄에 한 문장씩, 문장 가운데서 줄이 바뀌지 않는다(nowrap) — 그래서 한 줄은 짧게(열한 자 안팎) 쓴다.
 * 사용자가 쓴 글(목장 소개 등)처럼 길이를 알 수 없는 말은 children 으로 — 그건 보통처럼 줄이 바뀐다.
 */
export function GuguSays({
  mood = "base",
  view = "front",
  size = 84,
  lines,
  children,
  className = "",
  bob = false,
}: {
  mood?: GuguMood;
  view?: GuguView;
  size?: number;
  lines?: string[];
  children?: ReactNode;
  className?: string;
  /** 구구가 제자리에서 살짝 떠오르기를 되풀이한다 */
  bob?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <div className={`shrink-0 ${bob ? "gg-bob" : ""}`}>
        <Gugu mood={mood} view={view} size={size} />
      </div>
      <div className="gg-bubble min-w-0 flex-1 text-[15px] leading-snug">{lines ? <SayLines lines={lines} /> : children}</div>
    </div>
  );
}

/** 말풍선 안의 줄들 — 한 줄에 한 문장, 줄 가운데서 끊기지 않게 */
export function SayLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l) => (
        <span key={l} className="block font-semibold whitespace-nowrap">
          {l}
        </span>
      ))}
    </>
  );
}

/** 오른쪽 화살표 — 링크 줄 끝 */
export function Chevron({ className = "h-4 w-4" }: { className?: string }) {
  return <Icon d={ICON.chevron} className={className} strokeWidth={2.4} />;
}
