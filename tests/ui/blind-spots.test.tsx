import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlindSpotSection } from "@/components/blind-spots";
import { blindSpotTag, lastSeenLine, listedBlindSpotIds, summarizeBlindSpots, type BlindSpotPerson } from "@/lib/blind-spots";

/**
 * 돌봄 사각지대 화면 — care_blind_spots() 결과를 목록으로.
 *   · 기준 v2(2026-10-30): 2주 연속 결석 ∪ 4주 목장 불참 — 컨택이 없다는 것만으로는 사각지대가 아니다
 *   · 순서: 둘 다(최우선) → 연속 결석 → 목장 불참
 *   · 집계 중이면 판정을 그리지 않고 needs_check 사람만 출발점으로
 *   · 단독 연결은 공백과 별도 묶음, 신규는 수만
 */

let seq = 0;
function person(over: Partial<BlindSpotPerson> = {}): BlindSpotPerson {
  seq += 1;
  return {
    person_id: `p${seq}`,
    group_id: "g1",
    group_role: "member",
    care_status: "active",
    needs_check: null as unknown as boolean,
    state: "judged",
    contact_gap: false,
    meeting_gap: false,
    contact_leaders: 2,
    weeks_recorded: 4,
    last_contact_week: "2026-09-20",
    last_meeting_week: "2026-09-27",
    window_start: "2026-09-06",
    window_end: "2026-09-27",
    absent_streak: false,
    last_worship_week: "2026-09-27",
    name: `사람${seq}`,
    groupName: "토브",
    ...over,
  };
}

describe("summarizeBlindSpots", () => {
  it("최우선(둘 다) → 연속 결석 → 목장 불참 순, 같은 묶음은 들어온 순서 ★", () => {
    const m = person({ name: "목장만", meeting_gap: true, last_meeting_week: null as unknown as string });
    const a1 = person({ name: "결석1", absent_streak: true });
    const both = person({ name: "둘다", absent_streak: true, meeting_gap: true });
    const a2 = person({ name: "결석2", absent_streak: true });
    const ok = person({ name: "괜찮음" });
    const s = summarizeBlindSpots([m, a1, both, ok, a2]);
    expect(s.state).toBe("judged");
    if (s.state !== "judged") return;
    expect(s.spots.map((p) => p.name)).toEqual(["둘다", "결석1", "결석2", "목장만"]);
    expect(s.priority).toBe(1);
  });

  it("컨택이 없다는 것만으로는 사각지대가 아니다 — 컨택이 있어도 결석이 이어지면 사각지대 ★", () => {
    const noContact = person({ name: "컨택없음", contact_gap: true, contact_leaders: 0 });
    const contactedAbsent = person({ name: "컨택결석", absent_streak: true, contact_leaders: 2 });
    const s = summarizeBlindSpots([noContact, contactedAbsent]);
    if (s.state !== "judged") throw new Error("judged 여야 한다");
    expect(s.spots.map((p) => p.name)).toEqual(["컨택결석"]);
  });

  it("단독 연결은 공백이 아닌 사람 중 contact_leaders = 1", () => {
    const single = person({ name: "한명", contact_leaders: 1 });
    const gapSingle = person({ name: "공백", meeting_gap: true, contact_leaders: 1 });
    const s = summarizeBlindSpots([single, gapSingle, person()]);
    if (s.state !== "judged") throw new Error("judged 여야 한다");
    expect(s.singleLinks.map((p) => p.name)).toEqual(["한명", "공백"]);
  });

  it("신규는 수만 센다 — 목록에 넣지 않는다", () => {
    const s = summarizeBlindSpots([person({ state: "new", contact_gap: null as unknown as boolean }), person()]);
    if (s.state !== "judged") throw new Error("judged 여야 한다");
    expect(s.newcomers).toBe(1);
    expect(s.spots).toHaveLength(0);
  });

  it("집계 중이면 판정 대신 needs_check 사람만 ★", () => {
    const s = summarizeBlindSpots([
      person({ state: "collecting", needs_check: true, name: "확인" }),
      person({ state: "collecting", needs_check: false }),
      person({ state: "collecting" }),
    ]);
    expect(s.state).toBe("collecting");
    if (s.state !== "collecting") return;
    expect(s.needsCheck.map((p) => p.name)).toEqual(["확인"]);
  });
});

describe("문구", () => {
  it("태그와 마지막 기록 줄", () => {
    const both = person({ absent_streak: true, meeting_gap: true, last_worship_week: null as unknown as string, last_meeting_week: "2026-08-23" });
    expect(blindSpotTag(both)).toBe("결석 · 목장 불참");
    expect(lastSeenLine(both)).toBe("예배 기록 없음 · 마지막 목장 8월 23일");
    expect(blindSpotTag(person({ absent_streak: true }))).toBe("2주 연속 결석");
    expect(blindSpotTag(person({ meeting_gap: true }))).toBe("4주 목장 불참");
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

describe("BlindSpotSection", () => {
  it("판정: 'N명' 제목, 사람마다 태그, 목사님 화면에는 목장 이름 ★", async () => {
    const s = summarizeBlindSpots([
      person({ name: "가", absent_streak: true, groupName: "새싹" }),
      person({ name: "나", group_role: "leader", care_status: "long_absent", meeting_gap: true }),
      person(),
    ]);
    await act(async () => root.render(<BlindSpotSection summary={s} showGroup />));
    expect(container.querySelector("h2")?.textContent).toBe("챙김이 필요한 양 2명");
    const rows = [...container.querySelectorAll('[data-testid="blind-spot-person"]')].map((li) => li.textContent);
    expect(rows[0]).toContain("가");
    expect(rows[0]).toContain("새싹 목장");
    expect(rows[0]).toContain("2주 연속 결석");
    expect(rows[1]).toContain("리더");
    expect(rows[1]).toContain("장기 미출석");
  });

  it("사람을 누르면 상세로 간다 — /groups/people/[id]", async () => {
    const p = person({ name: "가", absent_streak: true });
    await act(async () => root.render(<BlindSpotSection summary={summarizeBlindSpots([p])} showGroup />));
    expect(container.querySelector('[data-testid="blind-spot-person"] a')?.getAttribute("href")).toBe(`/groups/people/${p.person_id}`);
  });

  it("리더 화면(showGroup=false)에는 목장 이름이 없다", async () => {
    const s = summarizeBlindSpots([person({ name: "가", absent_streak: true })]);
    await act(async () => root.render(<BlindSpotSection summary={s} showGroup={false} />));
    expect(container.textContent).not.toContain("토브 목장");
  });

  it("집계 중: 판정 숫자 없이 설명과 needs_check 목록만", async () => {
    const s = summarizeBlindSpots([person({ state: "collecting", needs_check: true, name: "확인" }), person({ state: "collecting" })]);
    await act(async () => root.render(<BlindSpotSection summary={s} showGroup />));
    expect(container.querySelector("h2")?.textContent).toBe("챙김이 필요한 양 · 집계 중");
    expect(container.querySelectorAll('[data-testid="blind-spot-person"]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/\d+명$/m);
  });

  it("판정한 사람이 0명이면(전원 신규) '없습니다' 라고 말하지 않는다 ★", async () => {
    const s = summarizeBlindSpots([
      person({ state: "new", contact_gap: null as unknown as boolean }),
      person({ state: "new", contact_gap: null as unknown as boolean }),
    ]);
    await act(async () => root.render(<BlindSpotSection summary={s} showGroup={false} />));
    expect(container.querySelector("h2")?.textContent).toBe("챙김이 필요한 양 · 아직 판정 전");
    expect(container.textContent).not.toContain("없습니다.");
  });

  it("사각지대가 없으면 그렇다고 한 줄", async () => {
    const s = summarizeBlindSpots([person()]);
    await act(async () => root.render(<BlindSpotSection summary={s} showGroup />));
    expect(container.textContent).toContain("최근 4주에는 없습니다.");
  });
});

describe("보고서 순서에 쓰는 사각지대 목록 — 화면에 뜨는 사람 그대로", () => {
  it("판정이 났으면 사각지대만", () => {
    const spot = person({ absent_streak: true });
    const ok = person();
    expect([...listedBlindSpotIds([spot, ok])]).toEqual([spot.person_id]);
  });
  it("집계 중이면 확인 필요로 표시된 사람 ★", () => {
    const check = person({ state: "collecting", needs_check: true });
    const plain = person({ state: "collecting", needs_check: false });
    expect([...listedBlindSpotIds([check, plain])]).toEqual([check.person_id]);
  });
});
