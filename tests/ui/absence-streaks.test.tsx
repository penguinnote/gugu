// @vitest-environment node
import { describe, expect, it } from "vitest";

import { absenceStreaks, type StreakPerson, type StreakRecord } from "@/lib/absence-streaks";

// 가짜 이름만 쓴다
const G = [{ id: "g1", name: "하늘" }, { id: "g2", name: "가온" }];
const person = (id: string, name: string, group_id: string, over: Partial<StreakPerson> = {}): StreakPerson => ({ id, name, group_id, care_status: "active", status: "active", ...over });
const rec = (person_id: string, week_key: string, here: boolean, contact = false): StreakRecord => ({ person_id, week_key, worship_attended: here, one_on_one_contacted: contact });

describe("연속 결석(목사님 화면)", () => {
  it("2주 이상 연속 결석은 컨택과 상관없이 — 컨택했으면 '개별 연락으로 교제함', 오래 빠진 사람부터 ★", () => {
    const people = [person("a", "김가람", "g1"), person("b", "이나윤", "g2"), person("c", "박다인", "g2")];
    const recs = [
      rec("a", "2026-11-01", true), rec("a", "2026-11-08", false), rec("a", "2026-11-15", false, true),
      rec("b", "2026-10-25", false), rec("b", "2026-11-01", false), rec("b", "2026-11-15", false),
      rec("c", "2026-11-08", false), rec("c", "2026-11-15", true),
    ];
    expect(absenceStreaks(people, G, recs)).toEqual([
      { id: "b", name: "이나윤", group: "가온", weeks: 3, contacted: false, since: "2026-10-25" }, // 11/8 은 기록 없음 — 건너뛴다
      { id: "a", name: "김가람", group: "하늘", weeks: 2, contacted: true, since: "2026-11-08" },
    ]);
  });

  it("출석을 세지 않는 사람 · 활동 중이 아닌 사람은 뺀다 · 온라인은 출석", () => {
    const people = [
      person("a", "김가람", "g1", { care_status: "military" }),
      person("b", "이나윤", "g1", { attendance_off: "교환" }),
      person("c", "박다인", "g1", { report_hidden: true }),
      person("d", "최라희", "g1", { status: "dormant" }),
      person("e", "정마루", "g1"),
    ];
    const recs = ["a", "b", "c", "d"].flatMap((id) => [rec(id, "2026-11-08", false), rec(id, "2026-11-15", false)]);
    recs.push(rec("e", "2026-11-08", false), { person_id: "e", week_key: "2026-11-15", worship_attended: true, one_on_one_contacted: false });
    expect(absenceStreaks(people, G, recs)).toEqual([]);
  });
});
