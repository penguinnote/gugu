import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { upcomingWeeks } from "@/lib/week";

/**
 * Step 9a 운영 화면 — 순수 계산과 배선.
 *   · 휴주 목록은 이번 주부터 앞으로만. 버튼이 곧 저장 — 액션 결과로만 줄이 바뀐다. 실패면 알리고 그대로
 *   · 푸시 현황은 미등록이 먼저
 *   · 청년부 블록은 비어 있으면 운영자에게만 보인다
 *   · 요약 카드는 갈 곳이 있을 때만 링크다
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { WeeksForm } = await import("@/app/(tabs)/admin/weeks/weeks-form");
const { PushStatusTable } = await import("@/app/(tabs)/admin/push/push-status-table");
const { AdminSummary } = await import("@/app/(tabs)/admin/admin-summary");


describe("휴주 주차 계산", () => {
  it("이번 주부터 앞으로 n 주, 전부 일요일", () => {
    const w = upcomingWeeks("2026-10-04", 3);
    expect(w).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]);
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

function button(label: string): HTMLButtonElement {
  const b = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!b) throw new Error(`없음: ${label}`);
  return b;
}

const WEEKS = [
  { weekKey: "2026-10-04", skipped: false, reason: null },
  { weekKey: "2026-10-11", skipped: true, reason: "수련회" },
];

describe("휴주 폼", () => {
  it("켜기는 액션에 (주차, true, 사유) 로 가고, 성공하면 줄이 바뀐다 ★", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    await render(<WeeksForm initial={WEEKS} save={save} />);

    const reason = container.querySelector<HTMLInputElement>('input[aria-label="10월 4일 사유"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "방학");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("10월 4일 휴주 지정").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(save).toHaveBeenCalledWith("2026-10-04", true, "방학");
    const first = container.querySelector('[data-testid="weeks"] li')!;
    expect(first.getAttribute("data-skipped")).toBe("true");
    expect(button("10월 4일 휴주 해제")).toBeDefined();
  });

  it("끄기는 false 로 가고, 실패하면 알리고 줄은 그대로", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, message: "지난 주차의 휴주는 바꿀 수 없습니다." });
    await render(<WeeksForm initial={WEEKS} save={save} />);
    await act(async () => button("10월 11일 휴주 해제").click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(save).toHaveBeenCalledWith("2026-10-11", false, "수련회");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("지난 주차");
    const rows = container.querySelectorAll('[data-testid="weeks"] li');
    expect(rows[1].getAttribute("data-skipped")).toBe("true");
  });

  it("이미 휴주인 줄의 사유 입력은 잠긴다", async () => {
    await render(<WeeksForm initial={WEEKS} save={vi.fn()} />);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="10월 11일 사유"]')!.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="10월 4일 사유"]')!.disabled).toBe(false);
  });
});

describe("푸시 현황", () => {
  it("미등록이 먼저, 각 사람에 목장 또는 역할", async () => {
    await render(
      <PushStatusTable
        rows={[
          { userId: "u1", name: "가", roleLabel: "리더", groupLabel: "가온 목장", devices: 2, lastSuccess: "오늘 오전 9:00" },
          { userId: "u2", name: "나", roleLabel: "목사님", groupLabel: null, devices: 0, lastSuccess: null },
          { userId: "u3", name: "다", roleLabel: "리더", groupLabel: "나래 목장", devices: 0, lastSuccess: null },
        ]}
      />,
    );
    const un = [...container.querySelectorAll('[data-testid="push-unregistered"] li')].map((li) => li.textContent);
    expect(un).toEqual(["나목사님미등록", "다나래 목장미등록"]);
    const reg = [...container.querySelectorAll('[data-testid="push-registered"] li')].map((li) => li.textContent);
    expect(reg).toEqual(["가가온 목장기기 2 · 오늘 오전 9:00"]);
  });

  it("아무도 없으면 한 줄", async () => {
    await render(<PushStatusTable rows={[]} />);
    expect(container.textContent).toContain("아직 계정이 없어요");
  });
});


describe("운영 홈 요약", () => {
  it("갈 곳이 있는 카드만 링크다", async () => {
    await render(
      <AdminSummary
        cards={[
          { href: "/approvals", title: "승인 대기", value: "2", note: "x" },
          { href: null, title: "확인 필요", value: "24", note: "9b" },
        ]}
      />,
    );
    const items = [...container.querySelectorAll('[data-testid="admin-summary"] li')];
    expect(items[0].querySelector("a")?.getAttribute("href")).toBe("/approvals");
    expect(items[1].querySelector("a")).toBeNull();
    expect(items[1].textContent).toContain("24");
  });
});
