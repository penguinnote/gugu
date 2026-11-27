import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VisibleRow } from "@/app/(tabs)/reports/actions";
import { ReportForm, type PersonRow } from "@/app/(tabs)/reports/report-form";

/**
 * 로컬 초안(localStorage) 과 서버 값의 관계.
 *
 * 운영에서 실제로 일어나는 시나리오:
 *   리더가 어떤 주차를 열어 뭔가 쓰다 닫는다 → 며칠 뒤 다시 연다 → 초안이 조용히
 *   폼에 들어간다 → 눈치 못 채고 제출한다 → 다른 사람의 기도제목이 본인도 모르게 바뀐다.
 *
 * 규칙: 화면을 열면 **항상 서버 값**을 그린다. 초안은 배너로 알리기만 하고,
 * '복원' 을 눌러야 폼에 들어간다.
 */

vi.mock("@/app/(tabs)/reports/actions", () => ({
  submitReport: vi.fn(),
  touchPresence: vi.fn(async () => []),
}));

const { submitReport } = await import("@/app/(tabs)/reports/actions");

const REPORT_ID = "r1";
const KEY = `nn:report:${REPORT_ID}`;
const SERVER_PRAYER = "가족의 건강";
const DRAFT_PRAYER = "며칠 전에 쓰다 만 기도제목";

const persons: PersonRow[] = [
  { id: "p1", name: "가", groupRole: "leader", isSelf: false },
  { id: "p2", name: "나", groupRole: "member", isSelf: false },
];

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const H = 60 * 60 * 1000;
const D = 24 * H;

function row(personId: string, updatedAt: string): VisibleRow {
  return {
    person_id: personId,
    worship_attended: true,
    group_meeting_attended: true,
    one_on_one_contacted: false,
    prayer_request: SERVER_PRAYER,
    updated_at: updatedAt,
  } as unknown as VisibleRow;
}

function draft(savedAt: string, prayer: string) {
  return JSON.stringify({
    savedAt,
    values: {
      p1: { attendance: "present", prayer, contact: false },
      p2: { attendance: "present", prayer: SERVER_PRAYER, contact: false },
    },
    note: "",
  });
}

let container: HTMLDivElement;
let root: Root;

async function flush(ms = 400) {
  // 복원 판단은 setTimeout(0), 로컬 저장은 300ms 디바운스다. 둘 다 지나가게 한다.
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(serverStamp: string) {
  await act(async () => {
    root.render(
      <ReportForm
        reportId={REPORT_ID}
        weekKey="2026-09-20"
        groupName="가온"
        persons={persons}
        initialRows={[row("p1", serverStamp), row("p2", serverStamp)]}
        prev={{}}
        initialNote={null}
        submittedAt={serverStamp}
        isLate={false}
        initialViewers={[]}
        initialStreak={{ streak: 3, currentIncluded: false, everOnTime: true, broken: false }}
        serverStamp={serverStamp}
        serverNow={iso(0)}
      />,
    );
  });
  await flush();
}

function prayerOf(name: string): string {
  const el = container.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${name} 기도제목"]`);
  if (!el) throw new Error(`${name} 의 기도제목 입력이 없다`);
  return el.value;
}

function submitButton(): HTMLButtonElement {
  const btn = [...container.querySelectorAll("button")].find((b) =>
    /^(제출|제출됨|다시 제출|저장 중…)$/.test(b.textContent?.trim() ?? ""),
  );
  if (!btn) throw new Error("제출 버튼이 없다");
  return btn;
}

function buttonNamed(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.mocked(submitReport).mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("로컬 초안이 있는 채로 화면을 열었을 때", () => {
  it("아무것도 누르지 않고 제출하면 서버 값이 그대로 남는다 ★", async () => {
    const serverStamp = iso(-2 * H);
    localStorage.setItem(KEY, draft(iso(-1 * H), DRAFT_PRAYER));

    await render(serverStamp);

    await act(async () => {
      submitButton().click();
    });
    await flush(50);

    // 고친 것이 없으므로 서버로 아무것도 가지 않는다.
    const calls = vi.mocked(submitReport).mock.calls;
    const sentRows = calls.flatMap(([input]) => input.rows);
    expect(sentRows, "서버로 간 행").toEqual([]);
    // 화면도 서버 값이어야 한다 — 초안이 폼에 먼저 들어가면 안 된다.
    expect(prayerOf("가")).toBe(SERVER_PRAYER);
  });

  it("배너의 '복원' 을 눌러야 초안이 폼에 들어간다", async () => {
    const serverStamp = iso(-2 * H);
    localStorage.setItem(KEY, draft(iso(-1 * H), DRAFT_PRAYER));

    await render(serverStamp);

    const restore = buttonNamed("복원");
    expect(restore, "'복원' 버튼").toBeDefined();
    expect(prayerOf("가")).toBe(SERVER_PRAYER);

    await act(async () => {
      restore!.click();
    });
    await flush(50);

    expect(prayerOf("가")).toBe(DRAFT_PRAYER);
    expect(submitButton().textContent?.trim()).toBe("다시 제출");
  });

  it("결정하기 전에는 초안이 지워지지 않고, '버리기' 를 누르면 지워진다", async () => {
    const serverStamp = iso(-2 * H);
    localStorage.setItem(KEY, draft(iso(-1 * H), DRAFT_PRAYER));

    await render(serverStamp);
    await flush(); // 저장 디바운스가 한 번 더 지나가도

    expect(localStorage.getItem(KEY), "결정 전 초안").not.toBeNull();

    await act(async () => {
      buttonNamed("버리기")!.click();
    });
    await flush(50);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(prayerOf("가")).toBe(SERVER_PRAYER);
    expect(buttonNamed("복원")).toBeUndefined();
  });

  it("서버가 더 새로우면 초안은 말없이 버려진다", async () => {
    const serverStamp = iso(-1 * H);
    localStorage.setItem(KEY, draft(iso(-2 * H), DRAFT_PRAYER));

    await render(serverStamp);

    expect(buttonNamed("복원")).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(prayerOf("가")).toBe(SERVER_PRAYER);
  });
});

describe("초안의 수명", () => {
  it("이 화면 것이든 다른 주차 것이든, 7일 지난 초안은 화면을 열 때 지워진다", async () => {
    const serverStamp = iso(-30 * D);
    localStorage.setItem(KEY, draft(iso(-8 * D), DRAFT_PRAYER)); // 이 화면, 만료
    localStorage.setItem("nn:report:other-old", draft(iso(-8 * D), "x")); // 다른 주차, 만료
    localStorage.setItem("nn:report:other-fresh", draft(iso(-1 * D), "y")); // 다른 주차, 유효
    localStorage.setItem("nn:report:broken", "{not json"); // 깨진 것
    localStorage.setItem("unrelated", "keep"); // 우리 것 아님

    await render(serverStamp);

    expect(buttonNamed("복원")).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem("nn:report:other-old")).toBeNull();
    expect(localStorage.getItem("nn:report:broken")).toBeNull();
    expect(localStorage.getItem("nn:report:other-fresh")).not.toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});

describe("연속 제출 — 제출하는 순간 오른다 (Step 6)", () => {
  it("보고서 화면에는 연속 알약이 없고(2026-11-14), 제출해 4주가 되면 홈이 강조하도록 적어 둔다 ★", async () => {
    const serverStamp = iso(-2 * H);
    vi.mocked(submitReport).mockResolvedValue({
      ok: true,
      submitted: true,
      conflicts: [],
      isLate: false,
      lateNow: false,
      rows: [],
      streak: { streak: 4, currentIncluded: true, everOnTime: true, broken: false },
      berries: { base: 30, bonus: 15, late: false },
    });

    await render(serverStamp);
    expect(container.querySelector('[data-testid="streak"]')).toBeNull();
    expect(container.textContent).not.toContain("연속 제출 중");

    // 뭔가 고쳐야 제출이 나간다 — 기도제목 한 글자
    const ta = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="가 기도제목"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, "가족의 건강, 그리고 시험");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      submitButton().click();
    });
    await flush(50);

    expect(vi.mocked(submitReport)).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("nn:streak-bump")).toBe("4");
    // 받은 열매가 하단 바 위에 한 줄로 뜨고, 홈이 한 번 더 알리도록 적어 둔다(World 5)
    expect(container.querySelector('[data-testid="berry-gain"]')?.textContent).toBe("가온 목장 열매 +30 (연속 보너스 +15)");
    expect(JSON.parse(sessionStorage.getItem("nn:berry-gain") ?? "null")).toEqual({ base: 30, bonus: 15, late: false });
  });

  it("고쳐 낸 제출(열매 없음)에는 열매 줄이 없다", async () => {
    sessionStorage.clear();
    vi.mocked(submitReport).mockResolvedValue({
      ok: true,
      submitted: true,
      conflicts: [],
      isLate: false,
      lateNow: false,
      rows: [],
      streak: null,
      berries: null,
    });
    await render(iso(-2 * H));
    const ta = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="가 기도제목"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, "다시 고친 기도제목");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      submitButton().click();
    });
    await flush(50);
    expect(container.querySelector('[data-testid="berry-gain"]')).toBeNull();
    expect(sessionStorage.getItem("nn:berry-gain")).toBeNull();
  });
});

describe("출석 칩 넷 · 사유 칸 (2026-10-30)", () => {
  const chip = (name: string, label: string) =>
    [...container.querySelectorAll(`[aria-label="${name} 출석"] button`)].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
  const pressed = (name: string) =>
    [...container.querySelectorAll(`[aria-label="${name} 출석"] button[aria-pressed="true"]`)].map((b) => b.textContent?.trim());
  const reasons = () => [...container.querySelectorAll<HTMLInputElement>('input[data-testid^="reason-"]')].map((i) => i.getAttribute("aria-label"));

  it("현장 예배와 목장 모임 불참은 같이 켜지고, 불참 사유 칸이 생긴다 ★", async () => {
    await render(iso(0));
    expect(pressed("가")).toEqual(["현장 예배"]);
    await act(async () => chip("가", "목장 모임 불참").click());
    expect(pressed("가")).toEqual(["현장 예배", "목장 모임 불참"]);
    expect(reasons()).toEqual(["가 목장 모임 불참 사유"]);
  });

  it("온라인 예배는 불참을 자동으로 켜고 잠근다 — 사유는 온라인 한 칸 ★", async () => {
    await render(iso(0));
    await act(async () => chip("가", "온라인 예배").click());
    expect(pressed("가")).toEqual(["온라인 예배", "목장 모임 불참"]);
    expect(chip("가", "목장 모임 불참").disabled).toBe(true);
    expect(reasons()).toEqual(["가 온라인 예배 사유"]);
  });

  it("결석은 다른 칩과 겹치지 않고 결석 사유 칸이 생긴다", async () => {
    await render(iso(0));
    await act(async () => chip("가", "목장 모임 불참").click());
    await act(async () => chip("가", "결석").click());
    expect(pressed("가")).toEqual(["결석"]);
    expect(reasons()).toEqual(["가 결석 사유"]);
  });

  it("보내는 값 — 온라인은 세 칸을 함께, 사유는 보이는 칸만", async () => {
    vi.mocked(submitReport).mockResolvedValue({ ok: false, message: "x", missingAttendance: [], missingPrayer: [] } as never);
    await render(iso(0));
    await act(async () => chip("가", "온라인 예배").click());
    const input = container.querySelector<HTMLInputElement>('input[data-testid="reason-online"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, " 출장 ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => submitButton().click());
    const rows = vi.mocked(submitReport).mock.calls[0][0].rows;
    expect(rows.find((r) => r.person_id === "p1")?.fields).toEqual({
      worship_attended: true,
      group_meeting_attended: false,
      worship_online: true,
      online_reason: "출장",
    });
  });
});
