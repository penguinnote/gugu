import ExcelJS from "exceljs";

import { groupLabel } from "@/lib/labels";

import { EXPORT_STATUS_LABELS, kstDateTime, shortWeek, type ExportModel, type ExportStatus } from "./model";

/**
 * Excel 내보내기 (Step 10, PRD §6.5) — 시트 5장: 요약 · 출석 · 개인별 · 기도제목 · 특이사항.
 * 명단 엑셀(roster-xlsx.ts)과 같은 결로 다시 그렸다(2026-10-29): 맑은 고딕, 파란 머리글 · 흰 굵은 글씨, 목장마다 연두 · 흰 줄,
 * 상태 칸은 상태마다 색, 숫자는 함수(COUNTIF · COUNTIFS)이고 계산값도 함께 넣어 계산하지 않는 미리보기에서도 보인다.
 *
 *   1행  제목(시트 이름)   2행  대외비 표기(02 §3.3) — Excel 은 워터마크를 새길 수 없어 고정된 윗줄이 표기 자리다
 *   3행  머리글 — 1~3행을 고정하고, 목록 시트는 머리글에 자동 필터
 *
 *   요약      목장 × 주차 상태, 제출 =COUNTIF(정시)+COUNTIF(지각), 대상 주 =COUNTA−COUNTIF(휴주), 제출률 = 제출/대상.
 *             맨 아래 '제출 목장' 줄(주차마다 COUNTIF). 그 아래 주차별 출석 — 출석 시트를 COUNTIFS 로 센다
 *   출석      한 줄에 한 사람 · 한 주(O 표시). 다른 시트의 함수가 이 시트를 본다
 *   개인별    목장 · 이름마다 기록 주 · 예배 · 목장 모임 · 컨택(출석 시트 COUNTIFS)과 참석률
 *   기도제목  쓴 것만      특이사항  목장 × 주차 한 줄, 상태 색 · 제출 시각
 */

const FONT = "맑은 고딕";
const BLUE = "FF4F81BD";
const GREEN = "FFEBF1DE";
const WHITE = "FFFFFFFF";
const NAVY = "FF1F497D";
const RED = "FFB42318";
const SOFT = "FFF7F9FC"; // 합계 줄

/** 상태 칸 색 — 바탕 · 글씨 */
const STATUS_COLOR: Record<ExportStatus, [string, string]> = {
  on_time: ["FFD8EBC4", "FF3B5E14"],
  late: ["FFFFF2CC", "FF7F6000"],
  draft: ["FFFDE9D9", "FF974706"],
  missing: ["FFF2DCDB", "FF953734"],
  skipped: ["FFEDEDED", "FF7F7F7F"],
};

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };
const BOX: Partial<ExcelJS.Borders> = { left: thin, right: thin, top: thin, bottom: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const font = (size: number, bold = false, argb?: string): Partial<ExcelJS.Font> => ({ name: FONT, size, bold, family: 2, color: argb ? { argb } : { theme: 1 } });
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
const LEFT_TOP: Partial<ExcelJS.Alignment> = { horizontal: "left", vertical: "top", wrapText: true };
const PCT = "0%";
const FIRST = 4;

/** 1 → A, 27 → AA */
export function colName(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
const O = (b: boolean) => (b ? "O" : null);
const ratio = (a: number, b: number) => (b === 0 ? "" : a / b);

type Col = { head: string; width: number };

function sheet(wb: ExcelJS.Workbook, name: string, mark: string, cols: Col[], xSplit = 0): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", xSplit, ySplit: 3, topLeftCell: `${colName(xSplit + 1)}4` }],
    properties: { defaultRowHeight: 18 },
  });
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.getRow(1).height = 28;
  ws.getRow(3).height = 26;
  const title = ws.getCell("A1");
  title.value = name === "요약" ? "로뎀나무교회 청년대학부 목장보고서" : `목장보고서 · ${name}`;
  title.font = font(16, true);
  const m = ws.getCell("A2");
  m.value = mark;
  m.font = font(10, true, RED);
  cols.forEach((c, i) => head(ws.getCell(3, i + 1), c.head));
  return ws;
}

function head(c: ExcelJS.Cell, value: string) {
  c.value = value;
  c.font = font(11, true, WHITE);
  c.fill = fill(BLUE);
  c.border = BOX;
  c.alignment = { ...CENTER, wrapText: true };
}

function cell(ws: ExcelJS.Worksheet, r: number, c: number, value: ExcelJS.CellValue, style: Partial<ExcelJS.Style>) {
  const x = ws.getCell(r, c);
  x.value = value;
  Object.assign(x, { border: BOX, font: font(11), alignment: CENTER, ...style });
  return x;
}

function statusCell(ws: ExcelJS.Worksheet, r: number, c: number, status: ExportStatus) {
  const [bg, fg] = STATUS_COLOR[status];
  cell(ws, r, c, EXPORT_STATUS_LABELS[status], { fill: fill(bg), font: font(10.5, true, fg) });
}

function sectionTitle(ws: ExcelJS.Worksheet, r: number, text: string, span: number) {
  for (let c = 1; c <= span; c++) ws.getCell(r, c).border = { bottom: { style: "medium", color: { argb: NAVY } } };
  const t = ws.getCell(r, 1);
  t.value = text;
  t.font = font(13, true, NAVY);
  ws.getRow(r).height = 24;
}

export function buildWorkbook(model: ExportModel, opts: { watermark: string; rangeLabel: string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "구구";
  wb.created = new Date(0); // 파일 안에 생성 시각을 남기지 않는다 — 표기와 로그가 기준이다
  wb.calcProperties.fullCalcOnLoad = true;
  const mark = `${opts.watermark} · ${opts.rangeLabel}`;
  const W = model.weeks.length;
  const G = model.groups.length;

  // ── 출석 — 다른 시트의 함수가 보는 바탕. 먼저 만들어 줄 범위를 안다
  const attCols: Col[] = [
    { head: "목장", width: 12 },
    { head: "주차", width: 12.5 },
    { head: "이름", width: 12 },
    { head: "구분", width: 7 },
    { head: "예배", width: 7 },
    { head: "목장 모임", width: 9.5 },
    { head: "개별 연락으로 교제", width: 18 },
    // 2026-10-30 — 끝에 붙인다(E · F · G 를 세는 수식은 그대로)
    { head: "온라인", width: 8 },
    { head: "사유", width: 28 },
  ];
  type Row = { group: string; week: string; name: string; role: string; worship: boolean; online: boolean; meeting: boolean; contact: boolean; reason: string | null; band: number; first: boolean };
  const attRows: Row[] = [];
  model.groups.forEach((b, gi) => {
    let first = true;
    for (const c of b.cells) {
      for (const l of c.lines) {
        attRows.push({ group: groupLabel(b.group.name), week: c.weekKey, name: l.name, role: l.role === "leader" ? "리더" : "양", worship: l.worship, online: l.online, meeting: l.meeting, contact: l.contact, reason: l.reason, band: gi, first });
        first = false;
      }
    }
  });
  const attLast = Math.max(FIRST, FIRST + attRows.length - 1);
  const ATT = (col: string) => `'출석'!$${col}$${FIRST}:$${col}$${attLast}`;

  // ── 1) 요약
  const sumCols: Col[] = [{ head: "목장", width: 13 }, ...model.weeks.map((w) => ({ head: shortWeek(w), width: 8 })), { head: "제출", width: 7 }, { head: "대상 주", width: 8 }, { head: "제출률", width: 8 }];
  const summary = sheet(wb, "요약", mark, sumCols, 1);
  const wFirst = colName(2);
  const wLast = colName(W + 1);
  const [cSub, cExp, cRate] = [W + 2, W + 3, W + 4];
  model.groups.forEach((b, i) => {
    const r = FIRST + i;
    const band = fill(i % 2 === 0 ? GREEN : WHITE);
    cell(summary, r, 1, groupLabel(b.group.name), { fill: band, font: font(11, true) });
    b.cells.forEach((c, j) => statusCell(summary, r, j + 2, c.status));
    const rng = `${wFirst}${r}:${wLast}${r}`;
    cell(summary, r, cSub, { formula: `COUNTIF(${rng}, "정시")+COUNTIF(${rng}, "지각")`, result: b.submitted }, { fill: band });
    cell(summary, r, cExp, { formula: `COUNTA(${rng})-COUNTIF(${rng}, "휴주")`, result: b.expected }, { fill: band });
    cell(summary, r, cRate, { formula: `IF(${colName(cExp)}${r}=0, "", ${colName(cSub)}${r}/${colName(cExp)}${r})`, result: ratio(b.submitted, b.expected) }, { fill: band, numFmt: PCT, font: font(11, true) });
  });
  // 주차마다 제출한 목장 수
  const tr = FIRST + G;
  const gLast = Math.max(FIRST, tr - 1);
  const totalStyle: Partial<ExcelJS.Style> = { fill: fill(SOFT), font: font(11, true) };
  cell(summary, tr, 1, "제출 목장", totalStyle);
  model.weeks.forEach((_, j) => {
    const col = colName(j + 2);
    const rng = `${col}${FIRST}:${col}${gLast}`;
    const n = model.groups.filter((b) => b.cells[j].status === "on_time" || b.cells[j].status === "late").length;
    cell(summary, tr, j + 2, { formula: `COUNTIF(${rng}, "정시")+COUNTIF(${rng}, "지각")`, result: n }, totalStyle);
  });
  const sumSub = model.groups.reduce((n, b) => n + b.submitted, 0);
  const sumExp = model.groups.reduce((n, b) => n + b.expected, 0);
  cell(summary, tr, cSub, { formula: `SUM(${colName(cSub)}${FIRST}:${colName(cSub)}${gLast})`, result: sumSub }, totalStyle);
  cell(summary, tr, cExp, { formula: `SUM(${colName(cExp)}${FIRST}:${colName(cExp)}${gLast})`, result: sumExp }, totalStyle);
  cell(summary, tr, cRate, { formula: `IF(${colName(cExp)}${tr}=0, "", ${colName(cSub)}${tr}/${colName(cExp)}${tr})`, result: ratio(sumSub, sumExp) }, { ...totalStyle, numFmt: PCT });

  // 상태 설명 한 줄
  const legend = tr + 1;
  (["on_time", "late", "draft", "missing", "skipped"] as ExportStatus[]).forEach((s, i) => {
    const [bg, fg] = STATUS_COLOR[s];
    const c = summary.getCell(legend, i + 2);
    c.value = EXPORT_STATUS_LABELS[s];
    c.fill = fill(bg);
    c.font = font(9, true, fg);
    c.alignment = CENTER;
  });
  summary.getCell(legend, 1).value = "상태";
  summary.getCell(legend, 1).font = font(9, false, "FF7F7F7F");
  summary.getCell(legend, 1).alignment = CENTER;

  // 주차별 출석 — 출석 시트를 센다
  const sec = legend + 2;
  sectionTitle(summary, sec, "주차별 출석", 8);
  const totHead = sec + 1;
  ["주차", "기록 인원", "예배", "목장 모임", "개별 연락으로 교제", "예배율", "목장 참석률", "개별 연락으로 교제 비율"].forEach((h, i) => head(summary.getCell(totHead, i + 1), h));
  summary.getRow(totHead).height = 46; // 머리글이 길어 두세 줄로 접힌다(2026-11-18)
  summary.getColumn(1).width = Math.max(summary.getColumn(1).width ?? 13, 13);
  model.totals.forEach((t, i) => {
    const r = totHead + 1 + i;
    const band = fill(i % 2 === 0 ? GREEN : WHITE);
    cell(summary, r, 1, t.weekKey, { fill: band, font: font(11, true) });
    cell(summary, r, 2, { formula: `COUNTIF(${ATT("B")}, A${r})`, result: t.people }, { fill: band });
    cell(summary, r, 3, { formula: `COUNTIFS(${ATT("B")}, A${r}, ${ATT("E")}, "O")`, result: t.worship }, { fill: band });
    cell(summary, r, 4, { formula: `COUNTIFS(${ATT("B")}, A${r}, ${ATT("F")}, "O")`, result: t.meeting }, { fill: band });
    cell(summary, r, 5, { formula: `COUNTIFS(${ATT("B")}, A${r}, ${ATT("G")}, "O")`, result: t.contact }, { fill: band });
    cell(summary, r, 6, { formula: `IF(B${r}=0, "", C${r}/B${r})`, result: ratio(t.worship, t.people) }, { fill: band, numFmt: PCT });
    cell(summary, r, 7, { formula: `IF(B${r}=0, "", D${r}/B${r})`, result: ratio(t.meeting, t.people) }, { fill: band, numFmt: PCT });
    cell(summary, r, 8, { formula: `IF(B${r}=0, "", E${r}/B${r})`, result: ratio(t.contact, t.people) }, { fill: band, numFmt: PCT });
  });

  // ── 2) 출석
  const att = sheet(wb, "출석", mark, attCols);
  attRows.forEach((a, i) => {
    const r = FIRST + i;
    const band = fill(a.band % 2 === 0 ? GREEN : WHITE);
    const values: ExcelJS.CellValue[] = [a.group, a.week, a.name, a.role, O(a.worship), O(a.meeting), O(a.contact), O(a.online), a.reason ?? ""];
    values.forEach((v, j) => cell(att, r, j + 1, v, { fill: band, font: font(11, a.first && j === 0) }));
    if (a.reason) att.getCell(r, 9).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  att.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: attCols.length } };

  // ── 3) 개인별 — 목장 · 이름마다(리더 먼저, 이름순은 출석 순서를 따른다)
  type Person = { group: string; name: string; role: string; weeks: number; worship: number; meeting: number; contact: number; band: number };
  const people = new Map<string, Person>();
  for (const a of attRows) {
    const key = `${a.group}|${a.name}`;
    const p = people.get(key) ?? { group: a.group, name: a.name, role: a.role, weeks: 0, worship: 0, meeting: 0, contact: 0, band: a.band };
    p.weeks += 1;
    p.worship += a.worship ? 1 : 0;
    p.meeting += a.meeting ? 1 : 0;
    p.contact += a.contact ? 1 : 0;
    people.set(key, p);
  }
  const list = [...people.values()].sort((x, y) => x.band - y.band || (x.role === y.role ? (x.name < y.name ? -1 : 1) : x.role === "리더" ? -1 : 1));
  const per = sheet(wb, "개인별", mark, [
    { head: "목장", width: 12 },
    { head: "이름", width: 12 },
    { head: "구분", width: 7 },
    { head: "기록 주", width: 8 },
    { head: "예배", width: 7 },
    { head: "목장 모임", width: 9.5 },
    { head: "개별 연락으로 교제", width: 18 },
    { head: "예배율", width: 8 },
    { head: "목장 참석률", width: 10.5 },
  ]);
  list.forEach((p, i) => {
    const r = FIRST + i;
    const band = fill(p.band % 2 === 0 ? GREEN : WHITE);
    const who = `${ATT("A")}, A${r}, ${ATT("C")}, B${r}`;
    cell(per, r, 1, p.group, { fill: band });
    cell(per, r, 2, p.name, { fill: band, font: font(11, true) });
    cell(per, r, 3, p.role, { fill: band });
    cell(per, r, 4, { formula: `COUNTIFS(${who})`, result: p.weeks }, { fill: band });
    cell(per, r, 5, { formula: `COUNTIFS(${who}, ${ATT("E")}, "O")`, result: p.worship }, { fill: band });
    cell(per, r, 6, { formula: `COUNTIFS(${who}, ${ATT("F")}, "O")`, result: p.meeting }, { fill: band });
    cell(per, r, 7, { formula: `COUNTIFS(${who}, ${ATT("G")}, "O")`, result: p.contact }, { fill: band });
    cell(per, r, 8, { formula: `IF(D${r}=0, "", E${r}/D${r})`, result: ratio(p.worship, p.weeks) }, { fill: band, numFmt: PCT, font: font(11, true) });
    cell(per, r, 9, { formula: `IF(D${r}=0, "", F${r}/D${r})`, result: ratio(p.meeting, p.weeks) }, { fill: band, numFmt: PCT, font: font(11, true) });
  });
  per.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 9 } };

  // ── 4) 기도제목 — 쓴 것만
  const pr = sheet(wb, "기도제목", mark, [
    { head: "목장", width: 12 },
    { head: "주차", width: 12.5 },
    { head: "이름", width: 12 },
    { head: "기도제목", width: 70 },
  ]);
  let pi = 0;
  model.groups.forEach((b, gi) => {
    const band = fill(gi % 2 === 0 ? GREEN : WHITE);
    for (const c of b.cells) {
      for (const l of c.lines) {
        if (!l.prayer) continue;
        const r = FIRST + pi++;
        cell(pr, r, 1, groupLabel(b.group.name), { fill: band, alignment: { ...CENTER, vertical: "top" } });
        cell(pr, r, 2, c.weekKey, { fill: band, alignment: { ...CENTER, vertical: "top" } });
        cell(pr, r, 3, l.name, { fill: band, font: font(11, true), alignment: { ...CENTER, vertical: "top" } });
        cell(pr, r, 4, l.prayer, { fill: band, alignment: LEFT_TOP });
      }
    }
  });
  pr.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 4 } };

  // ── 5) 특이사항 — 목장 × 주차 한 줄
  const notes = sheet(wb, "특이사항", mark, [
    { head: "목장", width: 12 },
    { head: "주차", width: 12.5 },
    { head: "상태", width: 9 },
    { head: "제출 시각", width: 17 },
    { head: "특이사항", width: 60 },
  ]);
  let ni = 0;
  model.groups.forEach((b, gi) => {
    const band = fill(gi % 2 === 0 ? GREEN : WHITE);
    b.cells.forEach((c, j) => {
      const r = FIRST + ni++;
      cell(notes, r, 1, groupLabel(b.group.name), { fill: band, font: font(11, j === 0), alignment: { ...CENTER, vertical: "top" } });
      cell(notes, r, 2, c.weekKey, { fill: band, alignment: { ...CENTER, vertical: "top" } });
      statusCell(notes, r, 3, c.status);
      cell(notes, r, 4, c.submittedAt ? kstDateTime(c.submittedAt) : null, { fill: band, alignment: { ...CENTER, vertical: "top" } });
      cell(notes, r, 5, c.note ?? null, { fill: band, alignment: LEFT_TOP });
    });
  });
  notes.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 5 } };

  return wb;
}

/** "ninetynine-2026-09-14_2026-10-04.xlsx" — 파일 이름에 사람·목장 이름을 넣지 않는다. */
export function exportFileName(from: string, to: string, ext: "xlsx" | "pdf" = "xlsx"): string {
  return `ninetynine-${from}_${to}.${ext}`;
}
