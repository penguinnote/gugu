import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildRosterModel, rosterFileName, rosterTitle, type RosterPersonRow } from "@/lib/export/roster-model";
import { buildRosterWorkbook, layoutMinistries } from "@/lib/export/roster-xlsx";
import { canAddTo, canEditGroup, ministryDiff, validateRosterForm, emptyForm } from "@/lib/roster-edit";

/**
 * 명단 엑셀 · 명단 고치기(2026-10-28) — 교회가 쓰던 명단 엑셀과 같은 모양.
 *   · 순서: 목장은 명단 순서, 안에서는 목장장 → 리더 → 양(이름순). 떠난 사람은 빠진다. 목장 첫 줄은 굵게, 목장마다 줄 색이 번갈아
 *   · 섬김(M) = COUNTIF(부서 표 전체), 부서(N) = TEXTJOIN 배열 수식 — 모든 줄에, 같은 범위. 계산값도 함께
 *   · 통계 · 마을별 · 목장별 현황은 COUNTIF, 기준일은 내보낸 날
 * 이름은 모두 지어낸 것이다.
 */

const G = (id: string, name: string, number: number, village: string | null) => ({ id, name, number, village });
const P = (id: string, name: string, group_id: string, extra: Partial<RosterPersonRow> = {}): RosterPersonRow => ({
  id,
  name,
  group_id,
  group_role: "member",
  is_group_head: false,
  status: "active",
  training_stage: null,
  birth_year: 2001,
  gender: "male",
  occupation: "대학생",
  affiliation: null,
  youth_member: true,
  assembly_member: false,
  note: null,
  ...extra,
});

function fixture() {
  return buildRosterModel({
    groups: [G("g2", "나래", 2, "소망"), G("g1", "가온", 1, "믿음")],
    people: [
      P("a", "다온", "g1"),
      P("b", "가람", "g1", { group_role: "leader", is_group_head: true, gender: "female" }),
      P("c", "나리", "g1", { group_role: "leader" }),
      P("d", "라희", "g2", { gender: "female" }),
      P("e", "마루", "g2", { status: "left" }),
    ],
    ministries: [
      { id: "m2", name: "임원진", sort: 2 },
      { id: "m1", name: "찬양팀", sort: 1 },
      { id: "m3", name: "수찬기", sort: 3 },
      { id: "m4", name: "국제사역부", sort: 4 },
    ],
    memberships: [
      { person_id: "a", ministry_id: "m4" },
      { person_id: "a", ministry_id: "m1" },
      { person_id: "b", ministry_id: "m1" },
      { person_id: "e", ministry_id: "m1" },
    ],
    asOf: "2026-10-28",
  });
}

describe("명단 모델", () => {
  it("목장 순서 · 목장장 → 리더 → 양 · 떠난 사람 빠짐 · 첫 줄 · 줄 색 ★", () => {
    const m = fixture();
    expect(m.lines.map((l) => [l.group, l.name, l.kind, l.first, l.groupIndex])).toEqual([
      ["가온", "가람", "리더", true, 0],
      ["가온", "나리", "리더", false, 0],
      ["가온", "다온", "양", false, 0],
      ["나래", "라희", "양", true, 1],
    ]);
    expect(m.groups).toEqual(["가온", "나래"]);
    expect(m.villages).toEqual(["믿음", "소망"]);
    expect(m.ministries.map((x) => [x.name, x.people])).toEqual([
      ["찬양팀", ["가람", "다온"]],
      ["임원진", []],
      ["수찬기", []],
      ["국제사역부", ["다온"]],
    ]);
    expect(rosterFileName("2026-10-28")).toBe("261028_로뎀나무교회 청년대학부 명단.xlsx");
  });

  it("부서 표 자리 — 셋씩, 원본 높이(18 · 16 …), 사람이 많으면 늘어난다", () => {
    const many = Array.from({ length: 20 }, (_, i) => `사람${i}`);
    const boxes = layoutMinistries([
      { name: "찬양팀", people: many },
      { name: "임원진", people: [] },
      { name: "수찬기", people: [] },
      { name: "국제사역부", people: [] },
    ]);
    expect(boxes.map((b) => [b.header, b.first, b.last])).toEqual([
      [4, 5, 24],
      [25, 26, 41],
    ]);
  });
});

describe("목장 명단", () => {
  it("같은 모양에 그 목장만 — 제목 · 파일 이름에 목장 이름, 부서 표 · 현황도 그 목장만 ★", async () => {
    const m = buildRosterModel({
      groups: [G("g1", "가온", 1, "믿음")],
      people: [P("a", "다온", "g1"), P("b", "가람", "g1", { group_role: "leader", is_group_head: true })],
      ministries: [{ id: "m1", name: "찬양팀", sort: 1 }],
      memberships: [
        { person_id: "a", ministry_id: "m1" },
        { person_id: "x", ministry_id: "m1" }, // 다른 목장 사람 — 빠진다
      ],
      asOf: "2026-10-28",
      scope: "가온",
    });
    expect(m.lines.map((l) => l.name)).toEqual(["가람", "다온"]);
    expect(m.groups).toEqual(["가온"]);
    expect(m.ministries[0].people).toEqual(["다온"]);
    expect(rosterFileName("2026-10-28", m.scope)).toBe("261028_로뎀나무교회 청년대학부 가온 목장 명단.xlsx");
    expect(rosterTitle(null)).toBe("로뎀나무교회 청년대학부 명단");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildRosterWorkbook(m).xlsx.writeBuffer()) as ArrayBuffer);
    expect(wb.getWorksheet("명단_및_현황")!.getCell("A1").value).toBe("로뎀나무교회 청년대학부 가온 목장 명단");
  });
});

describe("명단 엑셀", () => {
  async function sheet() {
    const buf = await buildRosterWorkbook(fixture()).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    return { wb, ws: wb.getWorksheet("명단_및_현황")! };
  }

  it("시트 한 장 · 제목 · 기준일 · 머리글 · 고정 · 너비", async () => {
    const { wb, ws } = await sheet();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["명단_및_현황"]);
    expect(ws.getCell("A1").value).toBe("로뎀나무교회 청년대학부 명단");
    expect(ws.getCell("P2").value).toBe("기준: 2026-10-28");
    expect(ws.getCell("V2").value).toBe("기준: 2026-10-28");
    expect([1, 2, 3, 4, 5, 13, 14].map((c) => ws.getRow(3).getCell(c).value)).toEqual(["마을", "목장", "이름", "구분", "훈련단계\n(교육과정)", "섬김", "부서"]);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
    expect([ws.getColumn("I").width, ws.getColumn("L").width, ws.getColumn("N").width]).toEqual([22.66, 36.83, 32.66]);
    expect((ws.getCell("A3").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF4F81BD");
  });

  it("줄 색 · 굵은 첫 줄 · 섬김 칸은 늘 연두 ★", async () => {
    const { ws } = await sheet();
    const argb = (a: string) => (ws.getCell(a).fill as ExcelJS.FillPattern).fgColor?.argb;
    expect([argb("A4"), argb("A6"), argb("A7")]).toEqual(["FFEBF1DE", "FFEBF1DE", "FFFFFFFF"]);
    expect([argb("M7"), argb("N7")]).toEqual(["FFEBF1DE", "FFEBF1DE"]);
    expect(["C4", "C5", "A4", "C7"].map((c) => !!ws.getCell(c).font.bold)).toEqual([true, false, false, true]);
    expect(ws.getCell("J4").value).toBe("O");
    expect(ws.getCell("K4").value).toBe(null);
    expect(ws.getCell("V5").value).toBe("가람");
  });

  it("섬김 · 부서는 모든 줄에 함수 — 같은 범위, 계산값 함께 ★", async () => {
    const { ws } = await sheet();
    const m = ws.getCell("M6").value as ExcelJS.CellFormulaValue;
    expect(m).toMatchObject({ formula: "COUNTIF($V$5:$Z$39, C6)", result: 2 });
    const n = ws.getCell("N6").value as ExcelJS.CellFormulaValue & { shareType?: string };
    expect(n.formula).toBe(
      '_xlfn.TEXTJOIN(", ", TRUE, IF($V$5:$Z$22=C6, $V$4:$Z$4, ""), IF($V$24:$Z$39=C6, $V$23:$Z$23, ""))',
    );
    expect(n.result).toBe("찬양팀, 국제사역부");
    expect(n.shareType).toBe("array");
    for (let r = 4; r <= 7; r++) expect((ws.getCell(`N${r}`).value as ExcelJS.CellFormulaValue).formula).toContain(`=C${r}`);
  });

  it("통계 · 마을별 · 목장별 현황", async () => {
    const { ws } = await sheet();
    const f = (a: string) => ws.getCell(a).value as ExcelJS.CellFormulaValue;
    expect([ws.getCell("P5").value, f("Q5").formula, f("Q5").result]).toEqual(["총 재적", "COUNTA(C:C)-1", 4]);
    expect([f("Q6").result, f("Q7").result, f("Q8").result, f("Q9").result]).toEqual([2, 2, 2, 2]);
    expect([ws.getCell("P12").value, f("Q12").formula, f("Q12").result]).toEqual(["믿음", 'COUNTIF(A:A, "믿음")', 3]);
    expect([ws.getCell("S6").value, f("T6").formula, f("T6").result]).toEqual(["나래", 'COUNTIF(B:B, "나래")', 1]);
  });
});

describe("명단 고치기 규칙", () => {
  const form = { ...emptyForm(), name: " 새  사람 ", birth_year: "2003", gender: "female" as const, occupation: " 대학생 ", ministries: ["m1"] };

  it("공백을 정리하고 빈칸은 없음으로", () => {
    expect(validateRosterForm(form, 2026)).toEqual({
      ok: true,
      value: {
        name: "새 사람",
        group_role: "member",
        training_stage: null,
        birth_year: 2003,
        gender: "female",
        occupation: "대학생",
        affiliation: null,
        campus: null,
        attendance_off: null,
        youth_member: false,
        assembly_member: false,
        note: null,
      },
    });
  });

  it("거부 — 이름 없음 · 출생년도 형식 · 계정 있는 리더나 목장장을 양으로", () => {
    expect(validateRosterForm({ ...form, name: "  " }, 2026).ok).toBe(false);
    expect(validateRosterForm({ ...form, birth_year: "03" }, 2026).ok).toBe(false);
    expect(validateRosterForm({ ...form, birth_year: "2030" }, 2026).ok).toBe(false);
    expect(validateRosterForm(form, 2026, { user_id: "u", group_role: "leader", is_group_head: false })).toMatchObject({ ok: false, message: expect.stringContaining("계정") });
    // 목장장 표시를 남긴 채 양으로는 못 내린다(2026-11-06 — 목장장 칸을 풀면 같이 저장된다)
    expect(validateRosterForm({ ...form, is_group_head: true }, 2026, { user_id: null, group_role: "leader", is_group_head: true })).toMatchObject({ ok: false, message: expect.stringContaining("목자") });
    expect(validateRosterForm({ ...form, is_group_head: false }, 2026, { user_id: null, group_role: "leader", is_group_head: true }).ok).toBe(true);
  });

  it("섬김 부서 차이 · 누가 고치나", () => {
    expect(ministryDiff(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] });
    const leader = { role: "leader", leadsGroup: true, groupId: "g1" };
    expect([canEditGroup(leader, "g1"), canEditGroup(leader, "g2"), canAddTo(leader, "g1"), canAddTo(leader, "g2")]).toEqual([true, false, true, false]);
    const pastor = { role: "pastor", leadsGroup: false, groupId: null };
    expect([canEditGroup(pastor, "g2"), canAddTo(pastor, "g2")]).toEqual([true, true]);
  });
});
