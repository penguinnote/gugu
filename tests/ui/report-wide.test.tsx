import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chipOn, tapChip, tapMeeting, toFlags, type Attendance } from "@/lib/attendance";

/**
 * 넓은 화면 목장보고서(2026-11-27, 1024px 이상) — 같은 폼을 표로 다시 배치한다.
 *   · 출석은 칩 넷 대신 예배(현장 · 온라인 · 결석) · 목장 모임(참석 · 불참) — 규칙은 휴대폰 칩과 같다
 *   · 넓은 칸을 눌러도 휴대폰 칩과 같은 값이 저장된다(같은 상태 하나)
 *   · 붙여넣기는 기도제목만 채우고 출석은 채우지 않는다
 *   · 작은 화면에서는 넓은 칸이 display:none, 휴대폰 칩은 lg:hidden
 */
vi.mock("@/app/(tabs)/reports/actions", () => ({ submitReport: vi.fn(), touchPresence: vi.fn(async () => []) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const { ReportForm } = await import("@/app/(tabs)/reports/report-form");

const IN: Attendance = { worship: "in_person", meetingOff: false };

describe("목장 모임 칸(참석 · 불참)", () => {
  it("예배를 고르기 전이면 현장 예배가 함께 켜진다 — 휴대폰 '목장 모임 불참' 칩과 같은 결과", () => {
    expect(tapMeeting(null, true)).toEqual(IN);
    expect(tapMeeting(null, false)).toEqual({ worship: "in_person", meetingOff: true });
    expect(tapMeeting(null, false)).toEqual(tapChip(null, "meeting_off"));
  });
  it("현장 예배면 참석 ↔ 불참, 고른 칸을 다시 눌러도 그대로", () => {
    expect(tapMeeting(IN, false)).toEqual({ worship: "in_person", meetingOff: true });
    expect(tapMeeting({ worship: "in_person", meetingOff: true }, true)).toEqual(IN);
    expect(tapMeeting(IN, true)).toEqual(IN);
  });
  it("온라인 · 결석이면 바꾸지 않는다(온라인은 불참이 잠긴 채 켜져 있다)", () => {
    const online: Attendance = { worship: "online", meetingOff: true };
    const absent: Attendance = { worship: "absent", meetingOff: true };
    expect(tapMeeting(online, true)).toBe(online);
    expect(tapMeeting(absent, true)).toBe(absent);
    expect(chipOn(online, "meeting_off")).toBe(true);
    expect(toFlags(online)).toEqual({ worship_attended: true, group_meeting_attended: false, worship_online: true });
  });
});

describe("넓은 칸과 휴대폰 칩은 같은 상태", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async () =>
    act(async () =>
      root.render(
        <ReportForm
          reportId="r1"
          weekKey="2026-11-22"
          groupName="가온"
          persons={[{ id: "p1", name: "가람", groupRole: "member", isSelf: false }]}
          initialRows={[]}
          prev={{}}
          initialNote={null}
          submittedAt={null}
          isLate={false}
          initialViewers={["나리"]}
          serverStamp={new Date(0).toISOString()}
          serverNow="2026-11-22T03:00:00.000Z"
          initialStreak={null}
        />,
      ),
    );
  const groupButtons = (label: string) => [...container.querySelectorAll<HTMLButtonElement>(`[role=group][aria-label="${label}"] button`)];
  const press = async (b: HTMLButtonElement) => act(async () => b.click());

  it("넓은 칸에서 온라인을 고르면 휴대폰 칩도 온라인 · 목장 불참(잠김), 사유 칸은 온라인 사유 하나", async () => {
    await render();
    await press(groupButtons("가람 예배").find((b) => b.textContent === "온라인")!);
    const chips = groupButtons("가람 출석");
    expect(chips.find((b) => b.textContent === "온라인 예배")?.getAttribute("aria-pressed")).toBe("true");
    expect(chips.find((b) => b.textContent === "목장 모임 불참")?.getAttribute("aria-pressed")).toBe("true");
    expect(groupButtons("가람 목장 모임").every((b) => b.disabled)).toBe(true);
    expect([...container.querySelectorAll("input[data-testid^=reason-]")].map((i) => i.getAttribute("data-testid"))).toEqual(["reason-online"]);
  });

  it("휴대폰 칩에서 고른 것도 넓은 칸에 그대로 — 출석을 고르면 줄의 노란 표시가 빠진다", async () => {
    await render();
    const row = container.querySelector("[data-testid=report-person]")!;
    expect(row.className).toContain("lg:bg-[var(--gg-row-todo)]");
    await press(groupButtons("가람 출석").find((b) => b.textContent === "현장 예배")!);
    expect(groupButtons("가람 예배").find((b) => b.textContent === "현장")?.getAttribute("aria-pressed")).toBe("true");
    expect(groupButtons("가람 목장 모임").find((b) => b.textContent === "참석")?.getAttribute("aria-pressed")).toBe("true");
    expect(row.className).not.toContain("lg:bg-[var(--gg-row-todo)]");
  });

  it("넓은 화면 머리 — 같이 보고 있는 리더 · 지난 목장보고서, 표 머리 '이번 주 명단 n명'", async () => {
    await render();
    expect(container.querySelector("[data-testid=report-viewers]")?.textContent).toContain("나리");
    expect(container.querySelector("[data-testid=report-past]")?.getAttribute("href")).toBe("/reports");
    expect(container.querySelector("[data-testid=report-table-head]")?.textContent).toContain("이번 주 명단 1명");
    expect(container.querySelector("[data-testid=report-notify-hint]")?.textContent).toContain("목사님");
  });

  it("작은 화면에서는 넓은 칸이 숨고(display:none) 휴대폰 칩은 넓은 화면에서 숨는다", async () => {
    await render();
    for (const label of ["가람 예배", "가람 목장 모임"]) {
      expect(container.querySelector(`[role=group][aria-label="${label}"]`)!.className).toMatch(/(^| )hidden( |$)/);
    }
    expect(container.querySelector('[role=group][aria-label="가람 출석"]')!.className).toContain("lg:hidden");
    expect(container.querySelector("[data-testid=report-table-head]")!.className).toMatch(/(^| )hidden( |$)/);
    expect(container.querySelector("[data-testid=report-wide-head]")!.className).toMatch(/(^| )hidden( |$)/);
  });
});

describe("배치(CSS)", () => {
  it("넓은 격자는 1024px 이상에서만 — 1280px 이상은 왼쪽 360px · 오른쪽 표", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const at = css.indexOf(".gg-report-grid {");
    const lg = css.lastIndexOf("@media (min-width: 64rem)", at);
    expect(lg).toBeGreaterThan(-1);
    expect(css.slice(lg, at)).not.toContain("}\n}");
    expect(css).toMatch(/@media \(min-width: 80rem\) \{\s*\.gg-report-grid \{\s*grid-template-columns: 360px minmax\(0, 1fr\);/);
  });
});
