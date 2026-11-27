import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorldSummary } from "@/lib/berries";

/**
 * 홈의 '쿠폰으로 지키기'(World 5) · 월드 입구 아래 열매 수.
 *   · 쿠폰이 있으면 1장을 쓰고, 없으면 사서 쓴다(한 번 더 묻고 나서)
 *   · 열매가 모자라면 단추 대신 모자란 수, 학기 한도를 다 썼으면 그 말만
 *   · 실패하면 DB 문구를 그대로, 성공하면 홈을 새로 그린다
 *   · 제출하고 홈에 오면 열매 수 위로 '+N' 이 한 번 뜨고, 적어 둔 값은 지운다
 */
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(tabs)/home/actions", () => ({ keepStreak: vi.fn() }));

const { keepStreak } = await import("@/app/(tabs)/home/actions");
const { FreezeOffer } = await import("@/app/(tabs)/home/freeze-offer");
const { BerryCount } = await import("@/app/(tabs)/home/berry-count");

const THIS_WEEK = "2026-10-11";
const LAST_WEEK = "2026-10-04";
const base: WorldSummary = {
  berries: 120,
  coupons: 1,
  coupon_price: 80,
  freeze_week: LAST_WEEK,
  freeze_keeps: 3,
  freezes_used: 0,
  freezes_per_term: 2,
};

let container: HTMLDivElement;
let root: Root;
const render = async (el: React.ReactElement) => {
  await act(async () => root.render(el));
};
// 2026-11-14 — 줄 오른쪽 '지키기' 가 가운데 확인 창을 열고, 창의 '지키기' 가 쓴다
const keepBtn = () => container.querySelector<HTMLButtonElement>('[data-testid="freeze-keep"]') ?? undefined;
const okBtn = () => container.querySelector<HTMLButtonElement>('[data-testid="confirm-ok"]') ?? undefined;
const click = async (b: HTMLElement | undefined) => {
  await act(async () => b!.click());
};

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(keepStreak).mockReset();
  refresh.mockReset();
  sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("쿠폰으로 지키기", () => {
  it("쿠폰이 있으면 한 번 묻고 1장을 쓴 뒤 홈을 새로 그린다", async () => {
    vi.mocked(keepStreak).mockResolvedValue({ ok: true });
    await render(<FreezeOffer summary={base} thisWeek={THIS_WEEK} />);
    expect(container.textContent).toContain("지난주 목장보고서를 놓쳤어요");
    expect(container.textContent).toContain("3주 연속 · 이번 학기 2번 남음");
    await click(keepBtn());
    expect(keepStreak).not.toHaveBeenCalled();
    expect(container.textContent).toContain("쿠폰 1장 중 1장을 쓸까요?");
    await click(okBtn());
    expect(keepStreak).toHaveBeenCalledWith(LAST_WEEK, false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("쿠폰이 없고 열매가 되면 사서 쓴다", async () => {
    vi.mocked(keepStreak).mockResolvedValue({ ok: true });
    await render(<FreezeOffer summary={{ ...base, coupons: 0, freeze_week: THIS_WEEK }} thisWeek={THIS_WEEK} />);
    expect(container.textContent).toContain("이번 주 목장보고서를 놓쳤어요");
    await click(keepBtn());
    expect(container.textContent).toContain("열매 80개로 쿠폰을 사서 바로 쓸까요?");
    await click(okBtn());
    expect(keepStreak).toHaveBeenCalledWith(THIS_WEEK, true);
  });

  it("열매가 모자라면 단추 없이 모자란 수를 말한다", async () => {
    await render(<FreezeOffer summary={{ ...base, coupons: 0, berries: 60 }} thisWeek={THIS_WEEK} />);
    expect(keepBtn()).toBeUndefined();
    expect(container.textContent).toContain("20개 더 모으면");
  });

  it("이번 학기 한도를 다 썼으면 그 말만", async () => {
    await render(<FreezeOffer summary={{ ...base, freezes_used: 2 }} thisWeek={THIS_WEEK} />);
    expect(keepBtn()).toBeUndefined();
    expect(container.textContent).toContain("이번 학기 쿠폰을 다 썼어요");
  });

  it("실패하면 DB 문구를 그대로 보이고 새로 그리지 않는다", async () => {
    vi.mocked(keepStreak).mockResolvedValue({ ok: false, message: "쿠폰은 놓친 주의 다음 주 마감 전까지만 쓸 수 있습니다." });
    await render(<FreezeOffer summary={base} thisWeek={THIS_WEEK} />);
    await click(keepBtn());
    await click(okBtn());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("다음 주 마감 전까지만");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("지킬 주가 없으면 아무것도 그리지 않는다", async () => {
    await render(<FreezeOffer summary={{ ...base, freeze_week: null }} thisWeek={THIS_WEEK} />);
    expect(container.querySelector('[data-testid="freeze-offer"]')).toBeNull();
  });
});

describe("월드 입구 아래 열매 수", () => {
  it("제출하고 오면 '+N' 이 한 번 뜨고 적어 둔 값은 지운다", async () => {
    sessionStorage.setItem("nn:berry-gain", JSON.stringify({ base: 30, bonus: 5, late: false }));
    await render(<BerryCount berries={1240} groupName="가온" />);
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(container.textContent).toContain("가온 목장 열매");
    expect(container.textContent).toContain("1,240");
    expect(container.textContent).toContain("+35");
    expect(sessionStorage.getItem("nn:berry-gain")).toBeNull();
  });

  it("적어 둔 값이 없으면 숫자만", async () => {
    await render(<BerryCount berries={60} groupName="가온" />);
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(container.textContent).not.toContain("+");
  });
});
