import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorldItem, WorldState } from "@/lib/world-state";

/**
 * 상점 탭(World 6)
 *   · 마당 / 집 안 / 캐릭터 꾸미기 / 쿠폰(2026-11-16), 캐릭터 꾸미기는 자리(모자·얼굴·…)별 · 마당 · 집 안은 작은 묶음(탈것 · 놀이기구 …)
 *   · 값 단추 → 가운데 확인 창으로 한 번 더 묻고 → 사면 DB 가 돌려준 새 열매·가진 물건으로
 *   · 열매가 모자라면 단추가 꺼지고 모자란 수, 울타리·소품은 한 번(가짐), 쿠폰은 가득 차면 꺼진다
 *   · 맡은 목장이 없으면(목사님·운영자) 구경만
 *   · 실패하면 DB 문구 그대로
 */
vi.mock("@/app/world/actions", () => ({ worldBuy: vi.fn() }));
const { worldBuy } = await import("@/app/world/actions");
const { ShopView } = await import("@/app/(tabs)/shop/shop-view");

const ITEMS: WorldItem[] = [
  { id: "cabin", name: "초록 지붕 집", cat: "house", price: 30, slot: null, blurb: "아담한 집" },
  { id: "wood", name: "나무 울타리", cat: "fence", price: 20, slot: null, blurb: "" },
  { id: "swing", name: "그네", cat: "prop", price: 55, slot: null, blurb: "나란히 타는 그네" },
  { id: "strawhat", name: "밀짚모자", cat: "wear", price: 40, slot: "hat", blurb: "넓은 챙" },
  { id: "scarf", name: "목도리", cat: "wear", price: 30, slot: "neck", blurb: "" },
  { id: "freeze", name: "연속 지키기 쿠폰", cat: "ticket", price: 80, slot: null, blurb: "" },
];

let container: HTMLDivElement;
let root: Root;
const render = async (props: Partial<React.ComponentProps<typeof ShopView>> = {}) => {
  await act(async () =>
    root.render(<ShopView items={ITEMS} owned={{ wood: 1 }} berries={50} groupName="가온" couponMax={2} {...props} />),
  );
};
const q = (sel: string) => container.querySelector(sel);
const button = (name: string, scope: ParentNode = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
const click = async (b: Element | null | undefined) => {
  await act(async () => (b as HTMLElement).click());
};

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(worldBuy).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("상점 탭", () => {
  it("마당 칸에는 마당 물건, 캐릭터 꾸미기 칸에는 자리별 소품, 쿠폰 칸에는 쿠폰", async () => {
    await render();
    expect(q('[data-testid="item-cabin"]')).not.toBeNull();
    expect(q('[data-testid="item-strawhat"]')).toBeNull();
    await click(button("캐릭터 꾸미기"));
    expect(q('[data-testid="item-strawhat"]')).not.toBeNull();
    expect(container.textContent).toContain("모자");
    expect(container.textContent).toContain("목");
    expect(q('[data-testid="item-cabin"]')).toBeNull();
    await click(button("쿠폰"));
    expect(q('[data-testid="item-freeze"]')).not.toBeNull();
  });

  it("값을 누르면 한 번 묻고, 사면 새 열매·가진 물건으로 바뀐다", async () => {
    const state: WorldState = { items: ITEMS, villages: [], mine: { group_id: "g", berries: 20, owned: { wood: 1, cabin: 1 } }, look: null };
    vi.mocked(worldBuy).mockResolvedValue({ ok: true, state });
    await render();
    const card = q('[data-testid="item-cabin"]')!;
    await click(card.querySelector("button"));
    const dialog = q('[data-testid="buy-confirm"]')!;
    expect(dialog.textContent).toContain("초록 지붕 집");
    expect(dialog.textContent).toContain("열매 30개로 살까요?");
    expect(worldBuy).not.toHaveBeenCalled();
    await click(button("사기", dialog));
    expect(worldBuy).toHaveBeenCalledWith("cabin");
    expect(q('[data-testid="buy-confirm"]')).toBeNull();
    expect(q('[data-testid="shop-berries"]')?.textContent).toContain("20");
    expect(q('[data-testid="item-cabin"]')?.textContent).toContain("가진 것 1개");
    expect(q('[role="status"]')?.textContent).toContain("초록 지붕 집을(를) 샀어요");
  });

  it("열매가 모자라면 단추가 꺼지고 모자란 수를 말한다", async () => {
    await render();
    const b = q('[data-testid="item-swing"] button') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain("5개 더");
  });

  it("울타리는 가지면 '가짐', 쿠폰은 가득 차면 꺼진다", async () => {
    await render({ owned: { wood: 1, freeze: 2 }, berries: 500 });
    const fence = q('[data-testid="item-wood"] button') as HTMLButtonElement;
    expect(fence.disabled).toBe(true);
    expect(fence.textContent).toBe("가짐");
    await click(button("쿠폰"));
    const coupon = q('[data-testid="item-freeze"] button') as HTMLButtonElement;
    expect(coupon.disabled).toBe(true);
    expect(coupon.textContent).toBe("가득 찼어요");
  });

  it("맡은 목장이 없으면 구경만 — 열매 표시 없이 단추가 꺼진다", async () => {
    await render({ berries: null, owned: {} });
    expect(q('[data-testid="shop-berries"]')).toBeNull();
    expect(container.textContent).toContain("구경만");
    expect((q('[data-testid="item-cabin"] button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("실패하면 DB 문구를 그대로 보인다", async () => {
    vi.mocked(worldBuy).mockResolvedValue({ ok: false, message: "열매가 모자랍니다." });
    await render();
    const card = q('[data-testid="item-cabin"]')!;
    await click(card.querySelector("button"));
    await click(button("사기", q('[data-testid="buy-confirm"]')!));
    expect(q('[role="alert"]')?.textContent).toBe("열매가 모자랍니다.");
  });

  it("확인 창에서 취소하면 사지 않고 닫힌다 ★", async () => {
    await render();
    await click(q('[data-testid="item-cabin"] button'));
    await click(button("취소", q('[data-testid="buy-confirm"]')!));
    expect(q('[data-testid="buy-confirm"]')).toBeNull();
    expect(worldBuy).not.toHaveBeenCalled();
  });
});

describe("빈 칸", () => {
  it("그 칸에 물건이 없으면 제목 없이 '곧 들어와요'", async () => {
    await act(async () => root.render(<ShopView items={ITEMS.filter((i) => i.cat !== "wear")} owned={{}} berries={50} groupName="가온" couponMax={2} />));
    await click(button("캐릭터 꾸미기"));
    expect(container.textContent).toContain("곧 들어와요");
    expect(container.querySelector("section")).toBeNull();
  });
});

describe("상점 묶음(2026-11-16)", () => {
  it("마당은 집 · 울타리 · 나무·꽃 · 탈것 · 놀이기구 · 소품, 집 안은 의자·침대 · 탁자·수납 · 부엌 · 조명·가전 · 장식 ★", async () => {
    const { shopGroupOf } = await import("@/lib/shop-groups");
    const g = (id: string, cat: string) => shopGroupOf({ id, cat });
    expect([g("cabin", "house"), g("picket", "fence"), g("apple", "nature")]).toEqual(["house", "fence", "nature"]);
    expect([g("bus", "prop"), g("bicycle", "prop"), g("airballoon", "prop")]).toEqual(["ride", "ride", "ride"]);
    expect([g("slide", "prop"), g("trampoline", "prop")]).toEqual(["play", "play"]);
    expect([g("bench", "prop"), g("새물건", "prop")]).toEqual(["prop", "prop"]); // 표에 없는 새 물건은 소품으로
    expect([g("sofa", "furniture"), g("desk", "furniture"), g("fridge", "furniture"), g("tvset", "furniture"), g("rugoval", "furniture")]).toEqual(["seat", "table", "kitchen", "light", "decor"]);
    expect(g("strawhat", "wear")).toBeNull();
  });
});
