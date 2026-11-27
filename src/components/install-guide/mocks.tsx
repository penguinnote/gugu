/* eslint-disable @next/next/no-img-element -- 앱 아이콘(public/icon-192.png)을 그대로 쓴다 */
import type { ReactNode } from "react";

/**
 * 설치 안내 그림(2026-11-11) — 휴대폰 화면을 단순하게 흉내 내고, 눌러야 할 곳에 라임 테두리가 숨 쉬듯 퍼진다.
 * 실제 화면을 찍은 사진이 아니라 위치만 알려 주는 그림이다(사파리 · 삼성 인터넷 · 크롬의 한국어 메뉴 이름 그대로).
 */

const ICON = "/icon-192.png";

/** 눌러야 할 곳 — 라임 테두리 + 퍼지는 고리 */
function Hot({ children, className = "", round = "rounded-full" }: { children: ReactNode; className?: string; round?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ring-[3px] ring-[var(--gg-sky)] ${round} ${className}`} data-testid="install-hot">
      <span aria-hidden className={`pointer-events-none absolute -inset-0.5 animate-ping ring-[3px] ring-[var(--gg-sky)] ${round} opacity-50`} />
      {children}
    </span>
  );
}

function Svg({ children, className = "size-[22px]" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const Back = () => <Svg><path d="M15 5l-7 7 7 7" /></Svg>;
const Fwd = () => <Svg><path d="M9 5l7 7-7 7" /></Svg>;
const Share = () => <Svg><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5v9h14v-9h-1" /></Svg>;
const Book = () => <Svg><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /></Svg>;
const Tabs = () => <Svg><rect x="4" y="7" width="12" height="12" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v10" /></Svg>;
const Dots = () => <Svg><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></Svg>;
const VDots = () => <Svg><circle cx="12" cy="5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="19" r="1.3" fill="currentColor" /></Svg>;
const Menu = () => <Svg><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
const Home = () => <Svg><path d="M4 11l8-7 8 7v9H4z" /></Svg>;
const PlusSq = () => <Svg><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></Svg>;
const Plus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
const Star = () => <Svg><path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.3 7 19l1.2-5.6L4 9.6 9.6 9z" /></Svg>;
const Down = () => <Svg><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;
const Clock = () => <Svg><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>;
const Copy = () => <Svg><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></Svg>;
const Compass = () => <Svg><circle cx="12" cy="12" r="8" /><path d="M15 9l-2 4-4 2 2-4z" /></Svg>;

/** 휴대폰 화면 틀 — 옅은 웹 페이지 위에 브라우저 막대 · 메뉴를 얹는다 */
function Screen({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`relative h-[340px] w-full overflow-hidden rounded-[26px] bg-[var(--gg-card)] shadow-[var(--gg-card-shadow)] ${className}`} data-testid="install-mock">
      <div aria-hidden className="space-y-2.5 px-6 pt-8">
        <div className="h-24 rounded-2xl bg-[var(--gg-tile)]" />
        <div className="h-3 w-3/4 rounded-full bg-[var(--gg-tile)]" />
        <div className="h-3 w-1/2 rounded-full bg-[var(--gg-tile)]" />
      </div>
      {children}
    </div>
  );
}

/** 아래에서 올라온 판(메뉴 · 공유 시트) */
function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end bg-black/25">
      <div className={`rounded-t-[22px] bg-[#f2f2f7] px-3 pt-3 pb-4 ${className}`}>{children}</div>
    </div>
  );
}

function Row({ icon, label, hot = false }: { icon: ReactNode; label: string; hot?: boolean }) {
  const inner = (
    <span className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-[15px] font-medium text-[#1c1c1e]">
      {label}
      <span className="text-[#3a3a3c]">{icon}</span>
    </span>
  );
  return hot ? (
    <Hot round="rounded-xl" className="w-full bg-[var(--gg-sky-soft)]">
      {inner}
    </Hot>
  ) : (
    inner
  );
}

function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-black/5 rounded-xl bg-white">{children}</div>;
}

function AppIcon({ size = 56, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <img src={ICON} alt="" width={size} height={size} className="rounded-[22%] shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" style={{ width: size, height: size }} />
      {label ? <span className="text-[12px] font-semibold text-[#1c1c1e]">구구</span> : null}
    </span>
  );
}

/* ───────── 아이폰 ───────── */

/** 막대 고르기 그림 — 사파리 아래 막대 두 모양(설정 · 버전에 따라 다르다) */
export function IosBarShare() {
  return (
    <span className="flex w-full items-center justify-around rounded-full bg-[#f2f2f7] px-2 py-2.5 text-[#1c1c1e]">
      <Back />
      <span className="opacity-40">
        <Fwd />
      </span>
      <Share />
      <Book />
      <Tabs />
    </span>
  );
}
export function IosBarMore() {
  return (
    <span className="flex w-full items-center gap-1.5 text-[#1c1c1e]">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f2f7]">
        <Back />
      </span>
      <span className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-full bg-[#f2f2f7] px-2 text-[12px] text-[#3a3a3c]">
        <span className="truncate">gugu.example.com</span>
      </span>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f2f7]">
        <Dots />
      </span>
    </span>
  );
}

/** 사파리 26 — 떠 있는 아래 막대 '‹ · 주소 · ⋯' */
export function IosMore() {
  return (
    <Screen>
      <div className="absolute inset-x-3 bottom-4 flex items-center gap-2">
        <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[#1c1c1e] shadow-[0_2px_10px_rgb(0_0_0/0.12)]">
          <Back />
        </span>
        <span className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-white/90 px-3 text-[13px] text-[#3a3a3c] shadow-[0_2px_10px_rgb(0_0_0/0.12)]">
          <span className="truncate">gugu.example.com</span>
        </span>
        <Hot className="size-11 bg-white text-[#1c1c1e]">
          <Dots />
        </Hot>
      </div>
    </Screen>
  );
}

/** 공유 — 사파리 26 은 ⋯ 메뉴의 맨 위, 그 전 사파리는 아래 막대 가운데 */
export function IosShare({ modern }: { modern: boolean }) {
  if (!modern) {
    return (
      <Screen>
        <div className="absolute inset-x-3 bottom-4 flex items-center justify-around rounded-full bg-white px-2 py-1.5 text-[#1c1c1e] shadow-[0_2px_12px_rgb(0_0_0/0.12)]">
          <Back />
          <span className="opacity-40">
            <Fwd />
          </span>
          <Hot className="size-11 bg-white">
            <Share />
          </Hot>
          <Book />
          <Tabs />
        </div>
      </Screen>
    );
  }
  return (
    <Screen>
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute right-3 bottom-16 w-[72%] space-y-1.5 rounded-[18px] bg-[#f2f2f7]/95 p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.18)]">
        <Row icon={<Share />} label="공유" hot />
        <List>
          <Row icon={<Star />} label="즐겨찾기에 추가" />
          <Row icon={<Book />} label="책갈피 추가" />
        </List>
      </div>
      <div className="absolute right-3 bottom-4 grid size-11 place-items-center rounded-full bg-white text-[#1c1c1e] shadow-[0_2px_10px_rgb(0_0_0/0.12)]">
        <Dots />
      </div>
    </Screen>
  );
}

/** 공유 창 머리 — 페이지 이름 · 앱 칸 한 줄(색 칸은 앱 그림 대신) */
function ShareHead() {
  const apps: [string, string][] = [
    ["AirDrop", "#3b9cf5"],
    ["메시지", "#34c759"],
    ["메일", "#2f80ed"],
    ["메모", "#f7c948"],
  ];
  return (
    <>
      <div className="mb-3 flex items-center gap-2.5 px-1">
        <AppIcon size={40} label={false} />
        <span className="min-w-0 text-left">
          <span className="block text-[14px] font-semibold text-[#1c1c1e]">구구</span>
          <span className="block truncate text-[12px] text-[#8e8e93]">gugu.example.com</span>
        </span>
      </div>
      <div className="mb-3 flex justify-around">
        {apps.map(([n, c]) => (
          <span key={n} className="flex flex-col items-center gap-1">
            <span className="size-11 rounded-[12px]" style={{ background: c }} />
            <span className="text-[11px] text-[#3a3a3c]">{n}</span>
          </span>
        ))}
      </div>
    </>
  );
}

/** 공유 창이 처음 뜬 모습 — '홈 화면에 추가' 는 아래에 숨어 있어 위로 쓸어 올린다(손가락 동그라미가 위로 움직인다) */
export function IosScroll() {
  return (
    <Screen>
      <Sheet className="!pb-0">
        <ShareHead />
        <List>
          <Row icon={<Copy />} label="복사" />
          <Row icon={<Book />} label="읽기 목록에 추가" />
        </List>
      </Sheet>
      <span aria-hidden className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center" data-testid="install-hot">
        <span className="gg-swipe-up grid size-12 place-items-center rounded-full bg-[var(--gg-sky)]/85 text-[var(--gg-on-sky)] ring-4 ring-white/70">
          <Svg className="size-6">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </Svg>
        </span>
      </span>
    </Screen>
  );
}

/** 쓸어 올린 뒤 — 아래쪽 줄들 사이에 '홈 화면에 추가' */
export function IosAdd() {
  return (
    <Screen>
      <Sheet>
        <div className="space-y-2">
          <List>
            <Row icon={<Star />} label="즐겨찾기에 추가" />
            <Row icon={<Svg><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Svg>} label="페이지에서 찾기" />
          </List>
          <Row icon={<PlusSq />} label="홈 화면에 추가" hot />
          <List>
            <Row icon={<Svg><path d="M4 20l4-1 11-11-3-3L5 16z" /></Svg>} label="마크업" />
          </List>
        </div>
      </Sheet>
    </Screen>
  );
}

export function IosConfirm({ ios26 }: { ios26: boolean }) {
  return (
    <Screen>
      <Sheet className="!bg-[#f2f2f7]">
        <div className="mb-3 flex items-center justify-between px-1 text-[15px]">
          <span className="text-[#007aff]">취소</span>
          <span className="font-semibold text-[#1c1c1e]">홈 화면에 추가</span>
          <Hot round="rounded-lg" className="bg-white px-2 py-0.5 font-semibold text-[#007aff]">
            추가
          </Hot>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3">
          <AppIcon size={48} label={false} />
          <span className="min-w-0 flex-1 text-left">
            <span className="block border-b border-black/5 pb-1.5 text-[15px] text-[#1c1c1e]">구구</span>
            <span className="block truncate pt-1.5 text-[12px] text-[#8e8e93]">gugu.example.com</span>
          </span>
        </div>
        {ios26 ? (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-[#1c1c1e]">
            웹 앱으로 열기
            <span className="relative h-[26px] w-[44px] rounded-full bg-[#34c759]">
              <span className="absolute top-[2px] right-[2px] size-[22px] rounded-full bg-white" />
            </span>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** 다른 앱 안(인스타그램 등) — 오른쪽 위 ⋯ → Safari로 열기 */
export function IosInApp() {
  return (
    <Screen>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-white px-4 py-3 text-[#1c1c1e] shadow-[0_1px_0_rgb(0_0_0/0.05)]">
        <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>
        <span className="truncate px-3 text-[13px] text-[#3a3a3c]">gugu.example.com</span>
        <Hot className="size-9 bg-white">
          <Dots />
        </Hot>
      </div>
      <div className="absolute top-16 right-3 w-[70%] rounded-[16px] bg-white p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.18)]">
        <Row icon={<Compass />} label="Safari로 열기" hot />
        <Row icon={<Copy />} label="링크 복사" />
      </div>
    </Screen>
  );
}

/** 다른 브라우저(아이폰) — 사파리 주소창에 붙여넣기 */
export function IosSafari() {
  return (
    <Screen>
      <div className="absolute inset-x-3 bottom-4 flex items-center gap-2">
        <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[#1c1c1e] shadow-[0_2px_10px_rgb(0_0_0/0.12)]">
          <Back />
        </span>
        <Hot className="h-11 min-w-0 flex-1 bg-white px-3 text-[13px] font-semibold text-[#007aff]">붙여넣기 및 이동</Hot>
        <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[#1c1c1e] shadow-[0_2px_10px_rgb(0_0_0/0.12)]">
          <Dots />
        </span>
      </div>
    </Screen>
  );
}

/* ───────── 갤럭시 · 삼성 인터넷 ───────── */

export function SamMenu() {
  return (
    <Screen>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-black/5 bg-white px-2 pt-2 pb-4 text-[#3a3a3c]">
        <Back />
        <span className="opacity-40">
          <Fwd />
        </span>
        <Home />
        <span className="grid size-6 place-items-center rounded-md border-2 border-current text-[11px] font-bold">2</span>
        <Hot className="size-11 bg-white">
          <Menu />
        </Hot>
      </div>
    </Screen>
  );
}

export function SamAdd() {
  const tile = (icon: ReactNode, label: string, hot = false) => {
    const body = (
      <span className="flex flex-col items-center gap-1.5 px-1 py-2 text-[11.5px] font-medium text-[#1c1c1e]">
        <span className="text-[#3a3a3c]">{icon}</span>
        {label}
      </span>
    );
    return hot ? (
      <Hot round="rounded-xl" className="bg-[var(--gg-sky-soft)]">
        {body}
      </Hot>
    ) : (
      body
    );
  };
  return (
    <Screen>
      <Sheet className="!bg-white">
        <div className="grid grid-cols-4 gap-1 text-center">
          {tile(<Star />, "북마크")}
          {tile(<Clock />, "기록")}
          {tile(<Down />, "다운로드")}
          {tile(<Share />, "공유")}
          {tile(<Plus />, "현재 페이지 추가", true)}
          {tile(<Book />, "저장된 페이지")}
          {tile(<Tabs />, "탭")}
          {tile(<Svg><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></Svg>, "설정")}
        </div>
      </Sheet>
    </Screen>
  );
}

export function SamHome() {
  return (
    <Screen>
      <Sheet className="!bg-white">
        <p className="mb-2 px-3 text-left text-[15px] font-bold text-[#1c1c1e]">현재 페이지 추가</p>
        <div className="space-y-1">
          <Row icon={<Star />} label="북마크" />
          <Row icon={<Svg><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></Svg>} label="퀵액세스" />
          <Row icon={<Home />} label="홈 화면" hot />
        </div>
      </Sheet>
    </Screen>
  );
}

function AndDialog({ title, ok }: { title: string; ok: string }) {
  return (
    <Screen>
      <div className="absolute inset-0 grid place-items-center bg-black/25 px-6">
        <div className="w-full rounded-[22px] bg-white px-5 pt-5 pb-4">
          <p className="text-left text-[17px] font-bold text-[#1c1c1e]">{title}</p>
          <div className="mt-4 flex items-center gap-3">
            <AppIcon size={44} label={false} />
            <span className="min-w-0 text-left">
              <span className="block text-[15px] font-semibold text-[#1c1c1e]">구구</span>
              <span className="block truncate text-[12px] text-[#8e8e93]">gugu.example.com</span>
            </span>
          </div>
          <div className="mt-5 flex justify-end gap-2 text-[15px] font-semibold">
            <span className="px-3 py-1.5 text-[#3a3a3c]">취소</span>
            <Hot round="rounded-lg" className="bg-white px-3 py-1.5 text-[#1a73e8]">
              {ok}
            </Hot>
          </div>
        </div>
      </div>
    </Screen>
  );
}

export const SamConfirm = () => <AndDialog title="홈 화면에 추가" ok="추가" />;

/* ───────── 갤럭시 · 크롬 ───────── */

export function ChrMenu() {
  return (
    <Screen>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-white px-3 py-2.5 text-[#3a3a3c] shadow-[0_1px_0_rgb(0_0_0/0.05)]">
        <Home />
        <span className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-[#f1f3f4] px-3.5 text-[13px]">
          <span className="truncate">gugu.example.com</span>
        </span>
        <span className="grid size-6 place-items-center rounded-md border-2 border-current text-[11px] font-bold">1</span>
        <Hot className="size-10 bg-white">
          <VDots />
        </Hot>
      </div>
    </Screen>
  );
}

export function ChrAdd() {
  return (
    <Screen>
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute top-3 right-3 w-[74%] space-y-0.5 rounded-[14px] bg-white p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.2)]">
        <Row icon={<Plus />} label="새 탭" />
        <Row icon={<Clock />} label="기록" />
        <Row icon={<Down />} label="다운로드" />
        <Row icon={<Share />} label="공유" />
        <Row icon={<PlusSq />} label="홈 화면에 추가" hot />
      </div>
    </Screen>
  );
}

export const ChrConfirm = () => <AndDialog title="앱 설치" ok="설치" />;

/* ───────── 끝 · 단추 단계 ───────── */

/** 홈 화면 — 앱 칸 사이에 구구 */
export function HomeScreen() {
  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-[26px] bg-[linear-gradient(160deg,#cfe7f7,#e9f5d5)] shadow-[var(--gg-card-shadow)]" data-testid="install-mock">
      <div className="grid grid-cols-4 gap-x-3 gap-y-5 px-6 pt-8">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span className="size-14 rounded-[22%] bg-white/70" />
            <span className="h-2 w-8 rounded-full bg-white/70" />
          </span>
        ))}
        <Hot round="rounded-[18px]" className="bg-white/40 p-1">
          <AppIcon size={52} />
        </Hot>
      </div>
    </div>
  );
}

/** 설치 창 · 바깥 브라우저 단계 — 화면 대신 앱 아이콘 하나 */
export function AppCard() {
  return (
    <div className="grid h-[340px] w-full place-items-center rounded-[26px] bg-[var(--gg-card)] shadow-[var(--gg-card-shadow)]" data-testid="install-mock">
      <AppIcon size={96} />
    </div>
  );
}
