// @vitest-environment node
import { describe, expect, it } from "vitest";

import { bookWeeks, buildBook, buildCampus, membershipOf, offLabelOf, type BookPersonIn, type Mark } from "@/lib/attendance-book";
import ExcelJS from "exceljs";
import JSZip from "jszip";

import { attendanceFileName, attendanceXlsxBuffer, buildAttendanceWorkbook } from "@/lib/export/attendance-xlsx";

// 가짜 이름만 쓴다
const person = (id: string, name: string, group_id: string, over: Partial<BookPersonIn> = {}): BookPersonIn => ({
  id, name, group_id, group_role: "member", is_group_head: false, care_status: "active", assembly_member: false, campus: null, ...over,
});
const weeksN = (n: number) => bookWeeks("2026-11-22", "2030-01-01").slice(0, n);
const marks = (s: string): (Mark | null)[] => [...s].map((c) => (c === "O" ? "onsite" : c === "L" ? "online" : c === "X" ? "absent" : null));

describe("출석부 주 · 회원 자격", () => {
  it("주일만, 휴주는 뺀다", () => {
    expect(bookWeeks("2026-11-22", "2026-12-13", ["2026-11-29"])).toEqual(["2026-11-22", "2026-12-06", "2026-12-13"]);
    expect(bookWeeks("2026-11-29", "2026-11-22")).toEqual([]);
  });

  it("회원이 8주 연속 결석하면 잃고, 4주 연속 출석하면 되찾는다(온라인도 출석) ★", () => {
    const w = weeksN(20);
    expect(membershipOf(true, w, marks("OXXXXXXX"), false).state).toBe("member"); // 7주
    const lost = membershipOf(true, w, marks("OXXXXXXXX"), false);
    expect([lost.state, lost.lostAt]).toEqual(["lost", w[8]]);
    expect(membershipOf(true, w, marks("XXXXXXXXOLO"), false).state).toBe("lost"); // 3주
    expect(membershipOf(true, w, marks("XXXXXXXXOLOL"), false).state).toBe("regained");
    expect(membershipOf(true, w, marks("XXXXXXXXOLXOLO"), false).state).toBe("lost"); // 끊기면 다시 센다
    // 온라인으로 이어 가면 결석이 아니다
    expect(membershipOf(true, w, marks("XXXXLXXXXXXX"), false).state).toBe("member");
  });

  it("보고서가 없던 주는 건너뛴다 · 합당한 사유(군 복무 등)는 결석을 세지 않는다", () => {
    const w = weeksN(20);
    expect(membershipOf(true, w, marks("XXXX-XXXX"), false).state).toBe("lost");
    expect(membershipOf(true, w, marks("XXXX-XXX"), false).state).toBe("member");
    expect(membershipOf(true, w, marks("XXXXXXXXXXXX"), true).state).toBe("member");
  });

  it("회원이 아닌 사람 — 26주 이상 기록에 3/4 이상 출석이면 '출석 요건 충족', 회원으로 올리지는 않는다", () => {
    const w = weeksN(30);
    expect(membershipOf(false, w, marks("O".repeat(20) + "X".repeat(6)), false).state).toBe("qualified"); // 20/26
    expect(membershipOf(false, w, marks("O".repeat(19) + "X".repeat(7)), false).state).toBe("none"); // 19/26
    expect(membershipOf(false, w, marks("O".repeat(25)), false).state).toBe("none"); // 25주
  });
});

describe("출석부 만들기 · 엑셀", () => {
  const weeks = weeksN(5);
  const groups = [{ id: "g2", name: "새벽", number: 2 }, { id: "g1", name: "빛길", number: 1 }];
  const people = [
    person("a", "김가온", "g1", { group_role: "leader", is_group_head: true, assembly_member: true, campus: "이공캠" }),
    person("b", "이나래", "g1", { assembly_member: true }),
    person("c", "박도윤", "g2", { campus: "인문캠" }),
    person("d", "최하늘", "g2", { assembly_member: true, campus: "이공캠" }),
  ];
  const rec = (person_id: string, s: string) => [...s].flatMap((c, i) => (c === "-" ? [] : [{ person_id, week_key: weeks[i], onsite: c === "O", online: c === "L" }]));
  const book = buildBook({ weeks, groups, people, records: [...rec("a", "OOOOL"), ...rec("b", "OLLXO"), ...rec("c", "XX-OO"), ...rec("d", "-----")] });

  it("목장 번호 순 · 목자 먼저, 횟수와 온라인 비율, 1/5 초과면 표시 ★", () => {
    expect(book.groups.map((g) => [g.name, g.rows.map((r) => r.name)])).toEqual([["빛길", ["김가온", "이나래"]], ["새벽", ["박도윤", "최하늘"]]]);
    const [a, b] = book.groups[0].rows;
    expect([a.onsite, a.online, a.absent, a.onlineShare, a.flagged]).toEqual([4, 1, 0, 0.2, false]); // 딱 1/5 은 아니다
    expect([b.onsite, b.online, b.absent, b.flagged]).toEqual([2, 2, 1, true]);
    const [c, d] = book.groups[1].rows;
    expect(c.marks).toEqual(["absent", "absent", null, "onsite", "onsite"]);
    expect([d.onlineShare, d.flagged, d.membership.state]).toEqual([null, false, "member"]);
  });

  it("엑셀 — 출석 현황(지표만) · 해마다 출석부(주를 옆으로) · 회원 명단 · 요약, 함수와 색 ★", () => {
    // 해를 넘기는 5주: 2026 에 셋(12/13 · 12/20 · 12/27), 2027 에 둘(1/3 · 1/10)
    const w2 = bookWeeks("2026-12-13", "2027-01-10");
    const rec2 = (person_id: string, s: string) => [...s].flatMap((c, i) => (c === "-" ? [] : [{ person_id, week_key: w2[i], onsite: c === "O", online: c === "L" }]));
    const b2 = buildBook({ weeks: w2, groups, people, records: [...rec2("a", "OOOOL"), ...rec2("b", "OLLXO"), ...rec2("c", "XX-OO"), ...rec2("d", "-----")] });
    const wb = buildAttendanceWorkbook(b2);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["출석 현황", "출석부 2027", "출석부 2026", "회원 명단", "요약"]);
    const bg = (sheet: ExcelJS.Worksheet, addr: string) => (sheet.getCell(addr).fill as { fgColor?: { argb?: string } })?.fgColor?.argb;

    // 출석 현황 — 주 칸 없이 지표만. 횟수는 해마다의 시트를 더한다. 5행 = 이나래
    const ws = wb.getWorksheet("출석 현황")!;
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.getRow(3).values).toEqual([undefined, "목장", "이름", "현장", "온라인", "결석", "출석률\n(현장)", "출석률\n(현장 + 온라인)", "온라인\n비율", "연속\n결석", "자격"]);
    expect([ws.getCell("A4").value, ws.getCell("A5").value, ws.getCell("B5").value]).toEqual(["빛길", "빛길", "이나래"]);
    expect(ws.getCell("C5").value).toEqual({ formula: "'출석부 2026'!F5+'출석부 2027'!E5", result: 2 });
    expect(ws.getCell("D5").value).toEqual({ formula: "'출석부 2026'!G5+'출석부 2027'!F5", result: 2 });
    expect(ws.getCell("E5").value).toEqual({ formula: "'출석부 2026'!H5+'출석부 2027'!G5", result: 1 });
    expect(ws.getCell("F5").value).toEqual({ formula: 'IF(C5+D5+E5=0,0,C5/(C5+D5+E5))', result: 0.4 });
    expect(ws.getCell("G5").value).toEqual({ formula: 'IF(C5+D5+E5=0,0,(C5+D5)/(C5+D5+E5))', result: 0.8 });
    expect(ws.getCell("H5").value).toEqual({ formula: 'IF(C5+D5=0,0,D5/(C5+D5))', result: 0.5 });
    expect([ws.getCell("I5").value, ws.getCell("J5").value, ws.getCell("J6").value]).toEqual([0, "회원", ""]);
    expect([ws.getCell("G5").numFmt, ws.getCell("C5").numFmt]).toEqual(["0%", "0"]); // 집계되는 사람은 0 그대로('-' 없이, 2026-11-17)
    expect([bg(ws, "B5"), bg(ws, "H5"), bg(ws, "B4") === "FFFFFF00"]).toEqual(["FFFFFF00", "FFFFFF00", false]);
    // 합계 — 사람 줄(4~7) 아래 한 줄 띄고 9행
    expect([ws.getCell("A9").value, ws.getCell("B9").value, ws.getCell("C9").value]).toEqual(["합계", { formula: "COUNTA(B4:B7)", result: 4 }, { formula: "SUM(C4:C7)", result: 8 }]);
    expect(ws.autoFilter).toEqual({ from: { row: 3, column: 1 }, to: { row: 7, column: 10 } });

    // 해마다 출석부 — 그 해의 주만 옆으로, 같은 줄 = 같은 사람
    const y26 = wb.getWorksheet("출석부 2026")!;
    expect(y26.getCell("A1").value).toBe("2026년 출석부");
    expect(y26.getRow(3).values).toEqual([undefined, "목장", "이름", "12/13", "12/20", "12/27", "현장", "온라인", "결석", "출석률\n(현장)", "출석률\n(현장 + 온라인)", "온라인\n비율"]);
    expect(["C", "D", "E"].map((c) => y26.getCell(`${c}5`).value)).toEqual(["O", "온", "온"]);
    expect([bg(y26, "C5"), bg(y26, "D5")]).toEqual(["FFE2F0C8", "FFDDEBF7"]);
    expect(y26.getCell("F5").value).toEqual({ formula: 'COUNTIF(C5:E5,"O")', result: 1 });
    expect(y26.getCell("G5").value).toEqual({ formula: 'COUNTIF(C5:E5,"온")', result: 2 });
    expect(y26.getCell("J5").value).toEqual({ formula: 'IF(F5+G5+H5=0,0,(F5+G5)/(F5+G5+H5))', result: 1 });
    // 주별 합계 9~14행: 12/13 주 현장 2(가온 · 나래) · 결석 1(도윤)
    expect([9, 10, 11, 12, 13, 14].map((r) => y26.getCell(r, 2).value)).toEqual(["현장", "온라인", "출석(현장 + 온라인)", "결석", "출석률(현장)", "출석률(현장 + 온라인)"]);
    expect(y26.getCell("C9").value).toEqual({ formula: 'COUNTIF(C4:C7,"O")', result: 2 });
    expect(y26.getCell("C11").value).toEqual({ formula: "C9+C10", result: 2 });
    expect(y26.getCell("C14").value).toEqual({ formula: 'IF(C9+C10+C12=0,0,(C9+C10)/(C9+C10+C12))', result: 2 / 3 });
    // 합계 줄 오른쪽 — 주 평균 인원(F) · 합계(G) · 그 해 출석률. 2026 세 주: 현장 2 · 1 · 1, 온라인 0 · 1 · 1, 결석 1 · 1 · 0
    expect([y26.getCell("F8").value, y26.getCell("G8").value]).toEqual(["주 평균", "합계"]);
    expect(y26.getCell("F9").value).toEqual({ formula: 'IFERROR(AVERAGE(C9:E9),"")', result: 4 / 3 });
    expect(y26.getCell("G9").value).toEqual({ formula: "SUM(C9:E9)", result: 4 });
    expect(y26.getCell("F11").value).toEqual({ formula: 'IFERROR(AVERAGE(C11:E11),"")', result: 2 });
    expect(y26.getCell("F13").value).toEqual({ formula: 'IF(G9+G10+G12=0,0,G9/(G9+G10+G12))', result: 0.5 });
    expect(y26.getCell("F14").value).toEqual({ formula: 'IF(G9+G10+G12=0,0,(G9+G10)/(G9+G10+G12))', result: 0.75 });
    expect([y26.getCell("F9").numFmt, y26.getCell("F14").numFmt]).toEqual(["0.0", "0%"]);
    const y27 = wb.getWorksheet("출석부 2027")!;
    expect([y27.getCell("C3").value, y27.getCell("D3").value]).toEqual(["1/3", "1/10"]);
    expect(["C", "D"].map((c) => y27.getCell(`${c}5`).value)).toEqual(["X", "O"]);
    expect(bg(y27, "C5")).toBe("FFFBE1E3");

    // 회원 명단 — 명단 셋이 옆으로: A 회원 · J 회원 자격 중지 · S 출석 요건 충족. 값은 출석 현황을 가리킨다
    const ms = wb.getWorksheet("회원 명단")!;
    expect([ms.getCell("A1").value, ms.getCell("J1").value, ms.getCell("S1").value]).toEqual(["회원 명단 (3명)", "회원 자격 중지 (0명)", "출석 요건 충족 (0명)"]);
    expect([4, 5, 6].map((r) => [ms.getCell(r, 1).value, ms.getCell(r, 2).value, ms.getCell(r, 7).value])).toEqual([["빛길", "김가온", "회원"], ["빛길", "이나래", "회원"], ["새벽", "최하늘", "회원"]]);
    expect(ms.getCell("E5").value).toEqual({ formula: "'출석 현황'!G5", result: 0.8 });
    expect(ms.getCell("F5").value).toEqual({ formula: "'출석 현황'!H5", result: 0.5 });
    expect(bg(ms, "B5")).toBe("FFFFFF00");
    expect(ms.getCell("J4").value).toBe("없음");

    // 요약 — 전체(A:B) · 주별 추이(D:I, 최근 주가 위) · 목장별(K:R)
    const sm = wb.getWorksheet("요약")!;
    expect([sm.getCell("A1").value, sm.getCell("D1").value, sm.getCell("K1").value]).toEqual(["전체", "주별 추이", "목장별"]);
    expect([sm.getCell("A4").value, sm.getCell("B4").value]).toEqual(["전체 인원", { formula: "COUNTA('출석 현황'!$B$4:$B$7)", result: 4 }]);
    expect(sm.getCell("B5").value).toEqual({ formula: "COUNTA('회원 명단'!$B$4:$B$6)", result: 3 });
    expect(sm.getCell("B8").value).toEqual({ formula: "COUNTIF('출석 현황'!$H$4:$H$7,\">0.2\")", result: 1 });
    expect(sm.getCell("B10").value).toEqual({ formula: "'출석부 2027'!D9", result: 2 });
    expect([sm.getCell("D4").value, sm.getCell("E4").value, sm.getCell("I4").value]).toEqual(["27. 1/10", { formula: "'출석부 2027'!D9", result: 2 }, { formula: "'출석부 2027'!D14", result: 1 }]);
    expect([sm.getCell("D8").value, sm.getCell("E8").value]).toEqual(["26. 12/13", { formula: "'출석부 2026'!C9", result: 2 }]);
    expect([sm.getCell("K4").value, sm.getCell("L4").value]).toEqual(["빛길", { formula: "COUNTIF('출석 현황'!$A$4:$A$7,$K4)", result: 2 }]);
    expect(sm.getCell("M4").value).toEqual({ formula: "SUMIF('출석 현황'!$A$4:$A$7,$K4,'출석 현황'!$C$4:$C$7)", result: 6 });
    expect(sm.getCell("R4").value).toEqual({ formula: "COUNTIF('회원 명단'!$A$4:$A$6,$K4)", result: 2 });
    expect([sm.getCell("K6").value, sm.getCell("L6").value]).toEqual(["합계", { formula: "SUM(L4:L5)", result: 4 }]);
    expect(attendanceFileName(b2)).toBe("270110_로뎀나무교회 청년부 출석부.xlsx");
  });

  it("파일 — 다시 열리고, 시트마다 초록 세모(수식 경고)를 끈다", async () => {
    const buf = await attendanceXlsxBuffer(book);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    expect(back.worksheets.map((w) => w.name)).toEqual(["출석 현황", "출석부 2026", "회원 명단", "요약"]);
    expect(back.getWorksheet("출석 현황")!.getCell("B5").value).toBe("이나래");
    const zip = await JSZip.loadAsync(buf);
    for (const n of [1, 2, 3, 4].map((i) => `xl/worksheets/sheet${i}.xml`)) {
      const xml = await zip.file(n)!.async("string");
      expect(xml.match(/<ignoredErrors>/g)).toHaveLength(1);
      // 자리 — 조건부 서식 · 쪽 설정 뒤, 시트 끝 앞
      expect(xml.indexOf("<ignoredErrors>")).toBeGreaterThan(xml.lastIndexOf("<conditionalFormatting"));
      expect(xml.indexOf("<ignoredErrors>")).toBeGreaterThan(xml.indexOf("<pageSetup"));
    }
  });

  it("목장은 가나다 순, 화면이면 내 목장 맨 위(2026-11-17)", () => {
    const gs = [{ id: "z", name: "하늘", number: 1 }, { id: "y", name: "가온", number: 2 }, { id: "x", name: "나래", number: 3 }];
    const ps = gs.map((g, i) => person(`q${i}`, `사람${i}`, g.id));
    expect(buildBook({ weeks, groups: gs, people: ps, records: [] }).groups.map((g) => g.name)).toEqual(["가온", "나래", "하늘"]);
    expect(buildBook({ weeks, groups: gs, people: ps, records: [], own: "z" }).groups.map((g) => g.name)).toEqual(["하늘", "가온", "나래"]);
  });

  it("출석을 세지 않는 사람 — 결석 · 빈 주는 'off'(결석으로 안 셈), 사유는 출석 제외 칸 → 돌봄 상태 → 숨김 순 ★", () => {
    const ps = [
      person("e1", "가교환", "g1", { attendance_off: "교환", assembly_member: true }),
      person("e2", "나군인", "g1", { care_status: "military" }),
      person("e3", "다숨김", "g1", { report_hidden: true }),
      person("e4", "라새로", "g1", { attendance_off: "교환", joined_at: weeks[2] }),
    ];
    const recs = [
      ...rec("e1", "OX-XO"),
      ...rec("e2", "XXXXX"),
    ];
    const b = buildBook({ weeks, groups, people: ps, records: recs });
    const rows = Object.fromEntries(b.groups[0].rows.map((r) => [r.name, r]));
    expect(rows["가교환"].marks).toEqual(["onsite", "off", "off", "off", "onsite"]);
    expect([rows["가교환"].off, rows["가교환"].onsite, rows["가교환"].absent, rows["가교환"].membership.state]).toEqual(["교환", 2, 0, "member"]);
    expect([rows["나군인"].off, rows["나군인"].absent, rows["나군인"].marks.every((m) => m === "off")]).toEqual(["군복무", 0, true]);
    expect([rows["다숨김"].off, rows["다숨김"].marks.every((m) => m === "off")]).toEqual(["제외", true]);
    // 들어오기 전 주는 빈칸 그대로
    expect(rows["라새로"].marks).toEqual([null, null, "off", "off", "off"]);
    expect(offLabelOf({ care_status: "remote", attendance_off: "  ", report_hidden: false })).toBe("원거리");
    expect(offLabelOf({ care_status: "long_absent", attendance_off: null, report_hidden: false })).toBeNull();

    // 엑셀 — 회색 칸 · 검정 글씨 · 사유, 결석 수에 들지 않는다
    const wb = buildAttendanceWorkbook(b);
    const ys = wb.getWorksheet("출석부 2026")!;
    const r = 4; // 가교환 — 목장 하나 · 이름 가나다 첫 줄
    expect(ys.getCell(r, 2).value).toBe("가교환");
    expect([ys.getCell(r, 3).value, ys.getCell(r, 4).value]).toEqual(["O", "교환"]);
    expect((ys.getCell(r, 4).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FFD9D9D9");
    expect(ys.getCell(r, 4).font.color?.argb).toBe("FF000000");
    expect(ys.getCell(r, 10).value).toEqual({ formula: 'COUNTIF(C4:G4,"X")' }); // 결석 0 — 계산값 0 은 싣지 않는다
    // 출석을 세지 않는 사람은 '-' · 빈칸, 집계되는 사람은 기록이 없어도 0%
    const main = wb.getWorksheet("출석 현황")!;
    const rowOf = (name: string) => { for (let i = 4; i <= main.rowCount; i++) if (main.getCell(i, 2).value === name) return i; return -1; };
    const hidden = rowOf("다숨김");
    expect(main.getCell(hidden, 3).numFmt).toBe('0;-0;"-"');
    expect(main.getCell(hidden, 7).value).toEqual({ formula: `IF(C${hidden}+D${hidden}+E${hidden}=0,"",(C${hidden}+D${hidden})/(C${hidden}+D${hidden}+E${hidden}))` }); // 빈 계산값은 싣지 않는다
  });

  it("캠퍼스 명단 — 캠퍼스별, 그 안에서는 목장 가나다 순", () => {
    expect(buildCampus(people, groups)).toEqual([
      { campus: "이공캠", people: [{ id: "a", name: "김가온", group: "빛길" }, { id: "d", name: "최하늘", group: "새벽" }] },
      { campus: "인문캠", people: [{ id: "c", name: "박도윤", group: "새벽" }] },
    ]);
  });
});
