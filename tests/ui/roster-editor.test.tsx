import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { orderReportPersons } from "@/lib/report-order";

/**
 * 보고서 명단 편집(2026-11-14) — 순서(↑ ↓) · 숨기기 · 다시 보이기, 저장하면 화면 순서대로 1부터. 이름은 지어낸 것.
 */
const { RosterEditor } = await import("@/app/(tabs)/reports/roster-editor");

const ITEMS = [
  { id: "a", name: "가나다", hidden: false },
  { id: "b", name: "라마바", hidden: false },
  { id: "c", name: "사아자", hidden: true },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const rows = () => [...host.querySelectorAll<HTMLElement>("[data-testid=roster-row]")];
const rowOf = (id: string) => rows().find((r) => r.dataset.person === id)!;

describe("RosterEditor", () => {
  it("'명단 편집' 을 누르면 판이 열리고 숨긴 사람은 '보이기' 로 보인다", () => {
    act(() => root.render(<RosterEditor items={ITEMS} save={vi.fn()} onSaved={vi.fn()} />));
    expect(host.querySelector("[data-testid=roster-edit]")).toBeNull();
    act(() => q<HTMLButtonElement>("[data-testid=roster-edit-open]").click());
    expect(rows().map((r) => r.dataset.person)).toEqual(["a", "b", "c"]);
    expect(rowOf("c").querySelector("[data-testid=roster-toggle]")!.textContent).toBe("보이기");
    expect(rowOf("a").querySelector("[data-testid=roster-toggle]")!.textContent).toBe("숨기기");
  });

  it("아래로 · 숨기기 · 다시 보이기 한 뒤 저장 — 화면 순서대로 1부터 보내고 바뀐 명단을 돌려준다 ★", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    const onSaved = vi.fn();
    act(() => root.render(<RosterEditor items={ITEMS} save={save} onSaved={onSaved} />));
    act(() => q<HTMLButtonElement>("[data-testid=roster-edit-open]").click());
    act(() => rowOf("a").querySelector<HTMLButtonElement>("[data-testid=roster-down]")!.click());
    act(() => rowOf("b").querySelector<HTMLButtonElement>("[data-testid=roster-toggle]")!.click());
    act(() => rowOf("c").querySelector<HTMLButtonElement>("[data-testid=roster-toggle]")!.click());
    await act(async () => q<HTMLButtonElement>("[data-testid=roster-save]").click());
    expect(save).toHaveBeenCalledWith([
      { id: "b", hidden: true, order: 1 },
      { id: "a", hidden: false, order: 2 },
      { id: "c", hidden: false, order: 3 },
    ]);
    expect(onSaved).toHaveBeenCalledWith([
      { id: "b", name: "라마바", hidden: true },
      { id: "a", name: "가나다", hidden: false },
      { id: "c", name: "사아자", hidden: false },
    ]);
    expect(host.querySelector("[data-testid=roster-edit]")).toBeNull();
  });

  it("저장이 실패하면 판을 닫지 않고 사유를 보인다", async () => {
    const onSaved = vi.fn();
    act(() => root.render(<RosterEditor items={ITEMS} save={async () => ({ ok: false, message: "다른 목장 사람은 편집할 수 없습니다." })} onSaved={onSaved} />));
    act(() => q<HTMLButtonElement>("[data-testid=roster-edit-open]").click());
    await act(async () => q<HTMLButtonElement>("[data-testid=roster-save]").click());
    expect(host.textContent).toContain("다른 목장 사람은 편집할 수 없습니다.");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("보고서 순서", () => {
  const P = [
    { id: "l", name: "하리더", groupRole: "leader" as const },
    { id: "m1", name: "가양", groupRole: "member" as const },
    { id: "m2", name: "나양", groupRole: "member" as const },
    { id: "new", name: "다새친구", groupRole: "member" as const },
  ];
  it("정한 순서가 있으면 그대로 위에, 정하지 않은 사람은 아래에 예전 규칙대로 ★", () => {
    const custom = new Map([["m2", 1], ["l", 2], ["m1", 3]]);
    expect(orderReportPersons(P, new Set(), custom).map((p) => p.id)).toEqual(["m2", "l", "m1", "new"]);
  });
  it("정한 순서가 없으면 예전 그대로(리더 먼저 · 가나다)", () => {
    expect(orderReportPersons(P, new Set()).map((p) => p.id)).toEqual(["l", "m1", "m2", "new"]);
  });
});
