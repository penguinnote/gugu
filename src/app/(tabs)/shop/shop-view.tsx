"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { worldBuy } from "@/app/world/actions";
import { BerryIcon } from "@/components/berry-icon";
import { berryText } from "@/lib/berries";
import { ROOM_GROUPS, YARD_GROUPS, shopGroupOf } from "@/lib/shop-groups";
import { Gugu } from "@/components/gugu";
import { GLASS_PILL, TabTitle } from "@/components/tab-title";
import { GuguSays } from "@/components/ui";
import { groupLabel } from "@/lib/labels";
import type { WorldItem, WorldItemCat, WorldRooms } from "@/lib/world-state";

/**
 * 상점 화면 본체(World 6 · 디자인 1 · 구구 테마). 위에서부터 큰 제목 '상점'(탭 첫 화면 공통 모양) + 오른쪽 우리 목장 열매 · 네 칸(목장 / 집 안 / 꾸미기 / 쿠폰) ·
 * 물건 카드 두 줄 격자(그림 칸을 낮춰 한 화면에 여섯 개쯤) · 쿠폰은 가로로 넓은 한 장 · 칸 안내는 목록 아래.
 * 카드의 값 단추를 누르면 가운데 확인 창으로 한 번 더 묻고(열매는 되돌릴 수 없다 · 2026-11-11 카드 안에서 창으로), 사면 DB 가 돌려준 새 열매·가진 물건으로 바꾼다.
 * 판정(리더인가 · 열매 · 울타리·소품은 한 번 · 쿠폰 수)은 전부 DB 함수(world_buy)가 한다. 여기 계산은 단추를 미리 끄는 것뿐이다.
 */
type Tab = "village" | "furniture" | "wear" | "ticket";
const TABS: [Tab, string][] = [
  ["village", "마당"],
  ["furniture", "집 안"],
  ["wear", "캐릭터 꾸미기"],
  ["ticket", "쿠폰"],
];
const VILLAGE_CATS: [WorldItemCat, string][] = [
  ["house", "집"],
  ["fence", "울타리"],
  ["nature", "나무·꽃"],
  ["prop", "놀이·소품"],
];
const SLOT_LABEL: Record<string, string> = { hat: "모자", face: "얼굴", neck: "목", back: "등", hand: "손" };
const SLOT_ORDER = ["hat", "face", "neck", "back", "hand"];

export function ShopView({
  items,
  owned: initialOwned,
  berries: initialBerries,
  groupName,
  place = null,
  couponMax,
  readOnly = false,
  village = null,
}: {
  items: WorldItem[];
  owned: Record<string, number>;
  /** 내 목장 열매. 맡은 목장이 없으면(목사님·운영자) null — 구경만 */
  berries: number | null;
  groupName: string | null;
  /** 목회자 · 운영자 집(2026-11-06) — 그 집 이름. 마당은 세 칸, 쿠폰은 목장만 */
  place?: string | null;
  couponMax: number;
  /** 프리뷰 읽기 전용 표시(Step 9c) */
  readOnly?: boolean;
  /** 내 마을의 놓인 모습(2026-11-05) — 자리 일곱 칸 중 몇 칸을 썼는지, 가구를 들일 집이 있는지 보인다 */
  village?: { slots: (string | null)[]; rooms: WorldRooms } | null;
}) {
  const [tab, setTab] = useState<Tab>("village");
  const [owned, setOwned] = useState(initialOwned);
  const [berries, setBerries] = useState(initialBerries);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const canBuy = berries !== null;
  const slotsUsed = village?.slots.filter(Boolean).length ?? 0;
  const slotMax = place ? 3 : (village?.slots.length ?? 7);
  const tabs = place ? TABS.filter(([k]) => k !== "ticket") : TABS;
  const housesPlaced = village?.slots.filter((s) => s && items.find((i) => i.id === s)?.cat === "house").length ?? 0;

  const buy = async (it: WorldItem) => {
    setBusy(true);
    setNotice(null);
    const r = await worldBuy(it.id);
    setBusy(false);
    setAsking(null);
    if (!r.ok) {
      setNotice({ ok: false, text: r.message });
      return;
    }
    if (r.state?.mine) {
      setOwned(r.state.mine.owned ?? {});
      setBerries(Number(r.state.mine.berries));
    }
    setNotice({ ok: true, text: boughtText(it, place) });
  };

  const askingItem = asking ? (items.find((i) => i.id === asking) ?? null) : null;
  const shown = (cat: WorldItemCat) => items.filter((i) => i.cat === cat);

  return (
    <>
    <TabTitle
      title="상점"
      photo="/home/hd-shop-sym.webp"
      compact
      readOnly={readOnly}
      aside={
        canBuy ? (
          <p className={`${GLASS_PILL} !pl-2.5`} data-testid="shop-berries">
            <BerryIcon className="h-5 w-5" />
            <span className="sr-only">{place ?? groupLabel(groupName)} 열매</span>
            <span className="text-[17px] leading-none font-extrabold tabular-nums">{berries === null ? null : berryText(berries)}</span>
          </p>
        ) : null
      }
    />
    <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-10" data-testid="shop">

      {!canBuy ? (
        <GuguSays mood="base" size={64} lines={["물건은 리더가 사요.", "여기선 구경만 해요."]} />
      ) : null}

      <div role="tablist" aria-label="상점 칸" className="flex gap-5 px-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setAsking(null);
            }}
            className={`h-10 text-[16px] font-semibold transition-colors ${tab === k ? "text-foreground shadow-[inset_0_-2.5px_0_var(--gg-sky)]" : "text-[var(--gg-section)]"}`}
          >
            {place && k === "village" ? "마당" : label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed font-semibold ${notice.ok ? "bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]" : "bg-[var(--gg-berry-soft)] text-[var(--gg-berry-ink)]"}`}
        >
          {notice.text}
          {notice.ok && tab !== "ticket" ? (
            <>
              {" "}
              <Link href="/world" prefetch={false} className="font-semibold underline underline-offset-4">
                로뎀 월드로
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {(tab === "village" ? items.some((i) => VILLAGE_CATS.some(([c]) => c === i.cat)) : items.some((i) => i.cat === tab)) ? null : (
        <div className="flex flex-col items-center gap-2 rounded-[22px] bg-[var(--gg-field)] px-4 py-6 text-center">
          <Gugu mood="sleepy" size={64} />
          <p className="text-[13px] text-muted">곧 들어와요</p>
        </div>
      )}

      {/* 마을 자리는 일곱 칸 — 더 사면 바꿔 놓을 수 있지만 한꺼번에 다 놓지는 못한다(2026-11-05). 가구는 마을에 놓은 집 안에만 */}
      {village && (tab === "village" || tab === "furniture") ? (
        <p className="flex justify-end" data-testid="village-room">
          <span className="gg-pill bg-[var(--gg-stone-soft)] text-[var(--gg-stone-ink)] tabular-nums">
            {tab === "village" ? `${place ? "마당 자리" : "마을 자리"} ${slotsUsed} / ${slotMax}` : housesPlaced > 0 ? `가구 들일 집 ${housesPlaced}채` : "마을에 놓은 집 없음"}
          </span>
        </p>
      ) : null}

      {tab === "village"
        ? YARD_GROUPS.map(({ key, label }) => (
            <Section key={key} title={label}>
              {items
                .filter((i) => VILLAGE_CATS.some(([c]) => c === i.cat) && shopGroupOf(i) === key)
                .map((it) => (
                  <Card key={it.id} it={it} {...cardProps(it)} />
                ))}
            </Section>
          ))
        : tab === "furniture"
          ? ROOM_GROUPS.map(({ key, label }) => (
              <Section key={key} title={label}>
                {shown("furniture")
                  .filter((i) => shopGroupOf(i) === key)
                  .map((it) => (
                    <Card key={it.id} it={it} {...cardProps(it)} />
                  ))}
              </Section>
            ))
        : tab === "wear"
          ? SLOT_ORDER.map((slot) => (
              <Section key={slot} title={SLOT_LABEL[slot]}>
                {shown("wear")
                  .filter((i) => i.slot === slot)
                  .map((it) => (
                    <Card key={it.id} it={it} {...cardProps(it)} />
                  ))}
              </Section>
            ))
          : (
            <section className="space-y-2.5">
              <h2 className="gg-display px-1 text-[18px]">연속 지키기</h2>
              <ul className="flex flex-col gap-2.5">
                {shown("ticket").map((it) => (
                  <WideCard key={it.id} it={it} {...cardProps(it)} />
                ))}
              </ul>
            </section>
          )}

    </main>
    {askingItem ? (
      <BuyConfirm
        it={askingItem}
        busy={busy}
        onCancel={() => {
          if (!busy) setAsking(null);
        }}
        onBuy={() => buy(askingItem)}
      />
    ) : null}
    </>
  );

  function cardProps(it: WorldItem) {
    const have = owned[it.id] ?? 0;
    const placed = VILLAGE_CATS.some(([c]) => c === it.cat) ? (village?.slots.filter((s) => s === it.id).length ?? null) : null;
    const once = it.cat === "fence" || it.cat === "wear";
    const full = it.cat === "ticket" && have >= couponMax;
    return {
      have,
      done: (once && have > 0) || full,
      status: statusText(it, have, couponMax, placed),
      canBuy,
      short: canBuy ? Math.max(0, it.price - (berries ?? 0)) : 0,
      onAsk: () => {
        setNotice(null);
        setAsking(it.id);
      },
    };
  }
}

function statusText(it: WorldItem, have: number, couponMax: number, placed: number | null): string {
  if (have <= 0) return "아직 없어요";
  if (it.cat === "fence") return "가지고 있어요";
  if (it.cat === "wear") return "옷장에 있어요";
  if (it.cat === "ticket") return `${have}장 / ${couponMax}장`;
  // 마을 물건은 몇 개를 놓았는지도(2026-11-05) — 가진 것과 놓은 것이 다르면 남는 것이 보인다
  return placed !== null ? `가진 것 ${have}개 · 놓은 것 ${placed}개` : `가진 것 ${have}개`;
}

function boughtText(it: WorldItem, place: string | null): string {
  const where = place ?? "내 목장";
  if (it.cat === "wear") return `${it.name}을(를) 옷장에 넣었어요. 월드의 꾸미기에서 입어요.`;
  if (it.cat === "fence") return `${it.name}를 샀어요. 월드의 ${where}에서 바꿔요.`;
  if (it.cat === "ticket") return `${it.name}을 샀어요. 놓친 주가 생기면 홈에서 써요.`;
  if (it.cat === "furniture") return `${it.name}을(를) 샀어요. 월드의 ${place ?? "목장 집"} 안에서 놓아요.`;
  return `${it.name}을(를) 샀어요. 월드의 ${where}에서 놓아요.`;
}

function Section({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (children.length === 0) return null; // 그 칸에 물건이 없으면(아직 DB 에 없는 칸) 제목도 숨긴다
  return (
    <section className="space-y-2.5">
      <h2 className="gg-display px-1 text-[18px]">{title}</h2>
      <ul className="grid grid-cols-2 gap-3">{children}</ul>
    </section>
  );
}

type CardProps = {
  it: WorldItem;
  have: number;
  done: boolean;
  status: string;
  canBuy: boolean;
  short: number;
  onAsk: () => void;
};

/** 값 단추 — 두 카드 모양이 같이 쓴다. 누르면 가운데 확인 창(BuyConfirm) */
function BuyControl({ it, done, canBuy, short, onAsk }: CardProps) {
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={!canBuy || done || short > 0}
      aria-label={`${it.name} 열매 ${it.price}개`}
      className={`gg-btn gg-btn-sm !h-9 w-full !gap-1 !px-1 !text-[15px] tabular-nums ${done ? "gg-btn-white !text-muted !opacity-100 !filter-none" : "gg-btn-sky"}`}
    >
      {done ? (
        it.cat === "ticket" ? "가득 찼어요" : "가짐"
      ) : (
        <>
          <span className="grid size-5 place-items-center rounded-full bg-white">
            <BerryIcon className="h-3.5 w-3.5" />
          </span>
          {it.price}
          {canBuy && short > 0 ? <span className="ml-0.5 font-[family-name:var(--font-sans)] text-[11px] font-bold">· {short}개 더</span> : null}
        </>
      )}
    </button>
  );
}

/**
 * 사기 전 확인 창(2026-11-11 사용자 요청 — 카드 안에서 묻던 것을 팝업으로). 로그아웃 확인 창과 같은 모양:
 * 가운데 흰 창 · 물건 그림 · 이름 · '열매 n개로 살까요?' · 취소 / 사기. 바깥을 누르거나 Esc 면 닫힌다(사는 중에는 닫히지 않는다).
 */
function BuyConfirm({ it, busy, onCancel, onBuy }: { it: WorldItem; busy: boolean; onCancel: () => void; onBuy: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onCancel]);
  const bg = it.cat === "ticket" ? "bg-[var(--gg-sun-soft)]" : it.cat === "wear" ? "bg-[var(--gg-lilac-soft)]" : "bg-[var(--gg-leaf-soft)]";
  return (
    <div className="gg-fade-in fixed inset-0 z-50 grid place-items-center bg-black/40 px-8" onClick={onCancel} data-testid="buy-confirm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="buy-title"
        className="w-full max-w-[320px] rounded-[24px] bg-[var(--gg-card)] px-5 pt-5 pb-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`relative mx-auto grid size-28 place-items-center overflow-hidden rounded-[22px] ${bg}`}>
          {it.cat === "ticket" ? (
            <TicketArt />
          ) : (
            <Image src={`/rodem-world/thumbs/${it.id}.webp`} alt="" width={200} height={160} unoptimized className="absolute inset-0 h-full w-full object-contain" />
          )}
        </div>
        <p className="mt-3.5 text-[15px] font-semibold text-[var(--gg-section)]">{it.name}</p>
        <p id="buy-title" className="mt-1 flex items-center justify-center gap-1.5 text-[19px] font-bold">
          <BerryIcon className="h-5 w-5" />
          <span className="tabular-nums">열매 {it.price}개로 살까요?</span>
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="gg-btn gg-btn-white gg-btn-sm !h-11 flex-1">
            취소
          </button>
          <button type="button" onClick={onBuy} disabled={busy} className="gg-btn gg-btn-sky gg-btn-sm !h-11 flex-1" data-testid="buy-ok">
            {busy ? "사는 중…" : "사기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 쿠폰 — 가로로 넓은 한 장: 왼쪽 그림, 오른쪽 이름 · 설명 · 가진 수 · 값 */
function WideCard(p: CardProps) {
  return (
    <li className="gg-card flex overflow-hidden" data-testid={`item-${p.it.id}`}>
      <div className="grid w-[38%] shrink-0 place-items-center bg-[var(--gg-sun-soft)] py-4">
        <TicketArt />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3.5 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="gg-display text-[17px]">{p.it.name}</p>
          {p.it.blurb ? <p className="text-[12px] leading-snug text-muted">{p.it.blurb}</p> : null}
          <p className="text-[12px] font-bold text-[var(--gg-sun-ink)]">{p.status}</p>
        </div>
        <div className="mt-auto">
          <BuyControl {...p} />
        </div>
      </div>
    </li>
  );
}

function Card(p: CardProps) {
  const { it, have, status } = p;
  return (
    <li
      className="gg-card flex flex-col overflow-hidden"
      data-testid={`item-${it.id}`}
    >
      <div className={`relative grid aspect-[16/10] place-items-center ${it.cat === "wear" ? "bg-[var(--gg-lilac-soft)]" : "bg-[var(--gg-leaf-soft)]"}`}>
        <Image src={`/rodem-world/thumbs/${it.id}.webp`} alt="" width={200} height={160} unoptimized className="absolute inset-0 h-full w-full object-contain" />
        {have > 0 ? (
          <span className="gg-pill absolute top-2 left-2 !h-6 bg-[var(--gg-card)] !px-2 !text-[11px] text-[var(--gg-leaf-ink)]">{status}</span>
        ) : null}
        {it.cat === "wear" ? (
          // 입어 보기 — 월드 꾸미기로 가서 이 소품을 바로 입혀 본다(사기 전에는 저장하지 않는다)
          <Link
            href={`/world?try=${encodeURIComponent(it.id)}`}
            prefetch={false}
            className="gg-pill absolute top-2 right-2 !h-6 bg-[var(--gg-card)] !px-2 !text-[11px] font-bold text-foreground"
            data-testid={`try-${it.id}`}
          >
            입어 보기
          </Link>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 pt-2 pb-2.5">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-bold">{it.name}</p>
          {it.blurb ? <p className="truncate text-[12px] leading-snug text-muted">{it.blurb}</p> : null}
        </div>
        <div className="mt-auto">
          <BuyControl {...p} />
        </div>
      </div>
    </li>
  );
}

function TicketArt() {
  return (
    <svg viewBox="0 0 100 80" className="h-[70%] w-[70%]" aria-hidden>
      <g transform="rotate(-8 50 40)">
        <path d="M14 22h72v12a6 6 0 0 0 0 12v12H14V46a6 6 0 0 0 0-12z" fill="#ffd36e" stroke="#d99a2b" strokeWidth="3" strokeLinejoin="round" />
        <path d="M64 24v32" stroke="#d99a2b" strokeWidth="3" strokeDasharray="4 4" />
        <path d="M38 30c-4 5-8 8-8 13a8 8 0 0 0 16 0c0-3-1.4-5.4-3-7-.3 2-1.4 3.4-3 4 .8-3.5 0-7-2-10z" fill="#f08a3e" />
      </g>
    </svg>
  );
}
