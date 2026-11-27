import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { personFlags } from "@/lib/people-admin";

/** 임원진 맡기기를 명단 화면에서(2026-11-26) */
const setOfficer = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/app/(tabs)/admin/people/[id]/actions", () => ({ setOfficer: (...a: unknown[]) => setOfficer(...(a as [])) }));
const { OfficerToggle } = await import("@/app/(tabs)/admin/people/[id]/officer-toggle");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  setOfficer.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid=${id}]`);

describe("임원진 켜고 끄기", () => {
  it("계정이 없는 사람은 흐리고 켤 수 없다 — 까닭 한 줄 ★", async () => {
    await act(async () => root.render(<OfficerToggle personId="p1" linked={false} initial={false} />));
    expect((q("officer-check") as HTMLInputElement).disabled).toBe(true);
    expect(q("officer-toggle")!.textContent).toContain("앱 계정이 연결된 사람만 맡길 수 있어요");
  });

  it("계정이 있으면 확인 창 뒤 맡긴다", async () => {
    await act(async () => root.render(<OfficerToggle personId="p1" linked initial={false} />));
    await act(async () => q("officer-check")!.click());
    expect(q("officer-confirm")!.textContent).toContain("임원진을 맡길까요?");
    await act(async () => q("confirm-ok")!.click());
    expect(setOfficer).toHaveBeenCalledWith("p1", true);
    expect((q("officer-check") as HTMLInputElement).checked).toBe(true);
  });

  it("운영자 명단 목록 — 임원진이면 '임원진' 표시", () => {
    const base = { id: "p", name: "가", group_id: "g", group_role: "leader" as const, is_group_head: false, status: "active" as const, care_status: "active" as const, needs_check: null, user_id: "u", birth_year: null };
    const labels = { status: {} as never, care: {} as never };
    expect(personFlags({ ...base, is_officer: true }, labels)).toContain("임원진");
    expect(personFlags({ ...base, is_officer: false }, labels)).not.toContain("임원진");
  });
});
