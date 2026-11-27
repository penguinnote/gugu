import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PersonTimeline } from "@/components/person-timeline";
import type { BlindSpotRow } from "@/lib/blind-spots";
import { attendanceText, contactText, judgmentText, type TimelineRecord } from "@/lib/person-timeline";

/**
 * 사람 상세(L-4a / P-4a) — 판정 요약 한 줄과 6개월 타임라인.
 *   · 판정 제외는 care_status 로 말하고, 휴면·기록 제외는 말하지 않는다(호출자가 status 로 거른다)
 *   · 컨택은 그 주 작성 리더의 이름과 함께
 *   · 다른 목장에서 쓰인 기록(목사님만)에는 목장 이름
 */

function spot(over: Partial<BlindSpotRow> = {}): BlindSpotRow {
  return {
    person_id: "p", group_id: "g", group_role: "member", care_status: "active", needs_check: false,
    state: "judged", contact_gap: true, meeting_gap: false, contact_leaders: 0, weeks_recorded: 4,
    last_contact_week: null as unknown as string, last_meeting_week: "2026-09-27",
    window_start: "2026-09-06", window_end: "2026-09-27", absent_streak: false, last_worship_week: "2026-09-27",
    ...over,
  };
}

function rec(over: Partial<TimelineRecord> = {}): TimelineRecord {
  return {
    id: Math.random().toString(36).slice(2), week_key: "2026-09-27",
    worship_attended: true, group_meeting_attended: true, one_on_one_contacted: false,
    prayer_request: null, authorName: "김빛나", otherGroupName: null,
    ...over,
  };
}

describe("judgmentText", () => {
  it("판정: 기간 · 컨택 · 목장 ★", () => {
    expect(judgmentText(spot(), "active")).toBe("9월 6일 ~ 9월 27일 · 목장 참석 있음 · 개별 연락으로 교제 없음");
    expect(judgmentText(spot({ contact_gap: false, contact_leaders: 2, meeting_gap: true }), "active"))
      .toBe("9월 6일 ~ 9월 27일 · 목장 불참 4주 · 개별 연락으로 교제한 리더 2명");
    expect(judgmentText(spot({ absent_streak: true, meeting_gap: true }), "active"))
      .toBe("9월 6일 ~ 9월 27일 · 2주 연속 결석 · 목장 불참 4주 · 개별 연락으로 교제 없음");
  });
  it("보류: 집계 중 · 신규", () => {
    expect(judgmentText(spot({ state: "collecting" }), "active")).toBe("최근 4주 판정 · 집계 중");
    expect(judgmentText(spot({ state: "new" }), "active")).toContain("4주가 안 되어");
  });
  it("판정 행이 없으면 판정 제외 사유(care_status), 재적이면 아무 말도 하지 않는다", () => {
    expect(judgmentText(null, "military")).toBe("판정 제외 · 군 복무");
    expect(judgmentText(null, "active")).toBeNull();
  });
});

describe("한 줄 문구", () => {
  it("출석 두 축, 둘 다 없으면 결석", () => {
    expect(attendanceText(rec())).toBe("현장 예배 · 목장");
    expect(attendanceText(rec({ group_meeting_attended: false }))).toBe("현장 예배");
    expect(attendanceText(rec({ group_meeting_attended: false, worship_online: true }))).toBe("온라인 예배");
    expect(attendanceText(rec({ worship_attended: false, group_meeting_attended: false }))).toBe("결석");
  });
  it("컨택은 작성 리더와 함께", () => {
    expect(contactText(rec({ one_on_one_contacted: true }))).toBe("개별 연락으로 교제 · 김빛나");
    expect(contactText(rec())).toBeNull();
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

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PersonTimeline", () => {
  it("한 주에 한 줄 — 출석·컨택, 기도제목, 다른 목장 기록엔 목장 이름 ★", async () => {
    await act(async () =>
      root.render(
        <PersonTimeline
          records={[
            rec({ one_on_one_contacted: true, prayer_request: "가족의 건강" }),
            rec({ week_key: "2026-08-30", worship_attended: false, group_meeting_attended: false, otherGroupName: "새싹" }),
          ]}
        />,
      ));
    const rows = [...container.querySelectorAll('[data-testid="timeline-row"]')].map((li) => li.textContent);
    expect(rows[0]).toContain("9월 27일");
    expect(rows[0]).toContain("예배 · 목장 · 개별 연락으로 교제 · 김빛나");
    expect(rows[0]).toContain("가족의 건강");
    expect(rows[1]).toContain("새싹 목장");
    expect(rows[1]).toContain("결석");
  });

  it("기록이 없으면 그렇다고", async () => {
    await act(async () => root.render(<PersonTimeline records={[]} />));
    expect(container.textContent).toBe("이 기간 기록이 없어요.");
  });
});
