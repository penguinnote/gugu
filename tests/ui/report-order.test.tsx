import { describe, expect, it } from "vitest";

import { orderReportPersons } from "@/lib/report-order";

const p = (id: string, name: string, groupRole: "leader" | "member" = "member") => ({ id, name, groupRole });

describe("보고서 사람 순서", () => {
  it("사각지대는 맨 뒤, 그 안은 역할 상관없이 가나다 ★", () => {
    const people = [p("1", "하늘"), p("2", "가온", "leader"), p("3", "다솜"), p("4", "나래", "leader"), p("5", "바다")];
    const out = orderReportPersons(people, new Set(["4", "3"]));
    expect(out.map((x) => x.name)).toEqual(["가온", "바다", "하늘", "나래", "다솜"]);
  });
  it("사각지대가 없으면 리더 먼저 → 가나다", () => {
    const out = orderReportPersons([p("1", "다솜"), p("2", "나래", "leader"), p("3", "가온")], new Set());
    expect(out.map((x) => x.name)).toEqual(["나래", "가온", "다솜"]);
  });
});
