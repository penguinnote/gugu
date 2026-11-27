import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonRow } from "@/app/(tabs)/reports/report-form";

/**
 * 보고서 화면 새가족 추가(2026-11-26) — 이름만으로, 추가 뒤 쓰던 입력 그대로. 같은 이름 알림은 뺐다(사용자 — 필요 없음).
 */
vi.mock("@/app/(tabs)/reports/actions", () => ({ submitReport: vi.fn(), touchPresence: vi.fn(async () => []) }));
const addNewFamily = vi.fn(async (): Promise<{ ok: true; id: string } | { ok: false; message: string }> => ({ ok: true, id: "new1" }));
vi.mock("@/app/(tabs)/reports/new-family-actions", () => ({ addNewFamily: (...a: unknown[]) => addNewFamily(...(a as [])) }));
const { ReportForm } = await import("@/app/(tabs)/reports/report-form");

const persons: PersonRow[] = [
  { id: "p1", name: "가온", groupRole: "leader", isSelf: true },
  { id: "p2", name: "나래", groupRole: "member", isSelf: false },
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  addNewFamily.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  const stamp = new Date(0).toISOString();
  await act(async () =>
    root.render(
      <ReportForm
        reportId="r1"
        weekKey="2026-11-22"
        groupName="가온"
        persons={persons}
        initialRows={[]}
        prev={{}}
        initialNote={null}
        submittedAt={null}
        isLate={false}
        initialViewers={[]}
        initialStreak={null}
        serverStamp={stamp}
        serverNow={new Date("2026-11-23T10:00:00+09:00").toISOString()}
        newFamilyGroupId="g1"
      />,
    ),
  );
}
const q = <T extends HTMLElement = HTMLElement>(id: string) => container.querySelector<T>(`[data-testid=${id}]`) ?? document.querySelector<T>(`[data-testid=${id}]`);
async function type(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = async (el: HTMLElement | null) => act(async () => el!.click());

describe("새가족 추가", () => {
  it("이름만으로 추가 — 카드가 명단 맨 아래에 '새가족' 표시로, 쓰던 입력은 그대로 ★", async () => {
    await render();
    const prayer = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="나래 기도제목"]')!;
    await type(prayer, "나래의 기도제목");
    await click(q("new-family-open"));
    await type(q<HTMLInputElement>("new-family-name")!, "다솜");
    await click(q("new-family-save"));
    expect(addNewFamily).toHaveBeenCalledWith("2026-11-22", "다솜");
    const names = [...container.querySelectorAll("[data-testid=report-person-name]")].map((n) => n.textContent);
    expect(names).toEqual(["가온", "나래", "다솜"]);
    expect(container.querySelectorAll("[data-testid=new-family-badge]")).toHaveLength(1);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="나래 기도제목"]')!.value).toBe("나래의 기도제목");
  });

  it("같은 이름 알림 없이 바로 넣는다 — 우리 목장에 같은 이름이 있으면 그 까닭을 보이고 창은 그대로", async () => {
    addNewFamily.mockResolvedValueOnce({ ok: false, message: "그 목장에 같은 이름이 있습니다." });
    await render();
    await click(q("new-family-open"));
    await type(q<HTMLInputElement>("new-family-name")!, "나래");
    await click(q("new-family-save"));
    expect(addNewFamily).toHaveBeenCalledWith("2026-11-22", "나래");
    expect(q("new-family")!.textContent).toContain("그 목장에 같은 이름이 있습니다.");
    expect(container.querySelectorAll("[data-testid=report-person-name]")).toHaveLength(2);
  });
});
