import ExcelJS from "exceljs";
import JSZip from "jszip";

import { isMember, MEMBER_LABEL, ONLINE_FLAG, weekShort, type Book, type BookRow } from "@/lib/attendance-book";

/**
 * 출석부 엑셀(2026-11-16 사용자 요청 — 같은 날 세 번째 꼴). 주가 계속 늘어나므로 주마다의 칸은 해마다 시트를 나눈다.
 *
 *   시트 1 '출석 현황'     한 사람 한 줄, 주마다의 칸 없이 지표만 — 현장 · 온라인 · 결석 · 출석률(현장) · 출석률(현장 + 온라인) ·
 *                          온라인 비율 · 연속 결석 · 자격. 횟수는 해마다의 출석부 시트를 더하는 함수. 맨 아래 합계
 *   시트 2~ '출석부 2027'  그 해의 주를 옆으로 쭉(O 현장 · 온 온라인 · X 결석), 오른쪽에 그 해의 횟수 · 출석률, 아래에 주별 합계,
 *                          합계 줄 오른쪽에 주 평균 인원 · 합계 · 그 해 출석률.
 *                          최근 해가 앞. 사람 줄의 자리는 모든 시트가 같다(같은 줄 = 같은 사람)
 *   그다음 '회원 명단'      현장 + 온라인 출석으로 계산한 회원(회칙 제4조 — lib/attendance-book), 옆으로 회원 자격 중지 · 출석 요건 충족
 *   마지막 '요약'           전체 숫자 · 주별 추이 · 목장별 현황 — 모두 앞 시트를 세는 함수
 *
 *   출석률(현장) = 현장 ÷ 기록 있는 주 · 출석률(현장 + 온라인) = (현장 + 온라인) ÷ 기록 있는 주 · 온라인 비율 = 온라인 ÷ (현장 + 온라인)
 *   연속 결석 · 자격은 앱이 시작 주부터 이어서 센 값(해를 넘겨 이어지므로 함수가 아니라 값으로 넣는다)
 *   색   O 연두 · 온 하늘 · X 분홍(조건부 서식도 건다 — 손으로 고치면 색이 따라 바뀐다).
 *        출석을 세지 않는 사람(군복무 · 교환 …)의 결석 · 빈 주는 회색 칸에 검정 글씨로 사유 — O · 온 · X 가 아니라 세지 않는다. 온라인 비율이 1/5 을 넘으면 이름과 비율이 노랗다.
 *        연속 결석 4주부터 주황 · 8주부터 빨강. 출석률은 높을수록 진한 연두
 *   그 밖  목장 이름은 줄마다(필터 · SUMIF), 머리글 필터 · 고정, 가로 인쇄, 집계되는 사람은 기록이 없어도 0 · 0%('-' 는 출석을 세지 않는 사람만),
 *        '수식이 옆 칸과 다르다' 초록 세모는 끈다(ignoredErrors — exceljs 가 못 써서 파일을 다시 연다)
 * 빈칸은 그 주 보고서가 없던 것 — 결석으로 세지 않는다.
 */

const FONT = "맑은 고딕";
const BLUE = "FF4F81BD";
const BAND = "FFF3F7EA";
const YELLOW = "FFFFFF00";
const GRAY = "FFF2F2F2";
const C_ON = { bg: "FFE2F0C8", fg: "FF3B5A0B" }; // 현장
const C_ONLINE = { bg: "FFDDEBF7", fg: "FF1F4E78" }; // 온라인
const C_ABSENT = { bg: "FFFBE1E3", fg: "FF9C2B33" }; // 결석
const C_OFF = { bg: "FFD9D9D9", fg: "FF000000" }; // 출석을 세지 않는 사람 — 회색 칸에 검정 글씨로 사유(2026-11-17)
const ORANGE = "FFFCE4D6";
const RED = "FFF8CBAD";
const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };
const BOX: Partial<ExcelJS.Borders> = { left: thin, right: thin, top: thin, bottom: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const cfFill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", bgColor: { argb } });
const font = (size: number, bold = false, argb?: string): Partial<ExcelJS.Font> => ({ name: FONT, size, bold, ...(argb ? { color: { argb } } : {}) });
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

const O = "O";
const ON = "온";
const X = "X";
const HEAD = 3; // 머리글 줄
const FIRST = HEAD + 1; // 첫 사람 줄
// 집계되는 사람은 기록이 없어도 0 · 0%(2026-11-17 사용자 — '-' 없이). '-' · 빈칸은 출석을 세지 않는 사람(off)만
const COUNT_FMT = "0";
const DASH_FMT = '0;-0;"-"';
const PCT = "0%";
export const MAIN_SHEET = "출석 현황";
export const yearSheet = (year: string) => `출석부 ${year}`;

type Placed = { row: BookRow; group: string; r: number; firstOfGroup: boolean };
type CellOpts = { bold?: boolean; fill?: string; fmt?: string; color?: string; left?: boolean };
type F = { formula: string; result: number | string };
const f = (formula: string, result: number | string): F => ({ formula, result });
/** 나눌 수 없으면 0 — 출석을 세지 않는 사람(off)은 빈칸 */
const ratio = (a: number, b: number, off = false): number | "" => (b > 0 ? a / b : off ? "" : 0);

/** 1 → A, 27 → AA */
function col(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function attendanceFileName(book: Book): string {
  const d = (w: string) => w.slice(2).replaceAll("-", "");
  return `${d(book.end || book.start)}_로뎀나무교회 청년부 출석부.xlsx`;
}

function head(sheet: ExcelJS.Worksheet, r: number, c: number, text: string) {
  const cell = sheet.getCell(r, c);
  cell.value = text;
  cell.font = font(10, true, "FFFFFFFF");
  cell.fill = fill(BLUE);
  cell.alignment = { ...CENTER, wrapText: true };
  cell.border = BOX;
}

function put(sheet: ExcelJS.Worksheet, r: number, c: number, value: ExcelJS.CellValue, o: CellOpts = {}) {
  const cell = sheet.getCell(r, c);
  cell.value = value;
  cell.font = font(10, o.bold, o.color);
  cell.alignment = o.left ? { horizontal: "left", vertical: "middle", indent: 1 } : CENTER;
  cell.border = BOX;
  if (o.fill) cell.fill = fill(o.fill);
  if (o.fmt) cell.numFmt = o.fmt;
}

function title(sheet: ExcelJS.Worksheet, c: number, text: string, note: string) {
  sheet.getCell(1, c).value = text;
  sheet.getCell(1, c).font = font(14, true);
  sheet.getCell(2, c).value = note;
  sheet.getCell(2, c).font = font(9, false, "FF7F7F7F");
}

const expr = (formula: string, argb: string, priority = 1): ExcelJS.ConditionalFormattingRule => ({ type: "expression", priority, formulae: [formula], style: { fill: cfFill(argb) } });

/** 온라인 비율(shareCol)이 1/5 을 넘는 줄의 cols 칸을 노랗게 */
function flagRule(sheet: ExcelJS.Worksheet, cols: string[], shareCol: string, first: number, last: number) {
  for (const c of cols) sheet.addConditionalFormatting({ ref: `${c}${first}:${c}${last}`, rules: [expr(`AND(ISNUMBER($${shareCol}${first}),$${shareCol}${first}>${ONLINE_FLAG})`, YELLOW)] });
}

/** 출석률 — 높을수록 진한 연두 */
function rateScale(sheet: ExcelJS.Worksheet, ref: string) {
  sheet.addConditionalFormatting({
    ref,
    rules: [{ type: "colorScale", priority: 5, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: [{ argb: "FFFFFFFF" }, { argb: "FFB7DD6B" }] }],
  });
}

const markFill = (m: string) => (m === O ? C_ON : m === ON ? C_ONLINE : m === X ? C_ABSENT : null);
/** 나눌 수 없을 때 — 0(집계되는 사람 · 합계), 출석을 세지 않는 사람은 빈칸("") */
const none = (off = false) => (off ? '""' : "0");
const rateOn = (on: string, onl: string, ab: string, off = false) => `IF(${on}+${onl}+${ab}=0,${none(off)},${on}/(${on}+${onl}+${ab}))`;
const rateBoth = (on: string, onl: string, ab: string, off = false) => `IF(${on}+${onl}+${ab}=0,${none(off)},(${on}+${onl})/(${on}+${onl}+${ab}))`;
const shareOf = (on: string, onl: string, off = false) => `IF(${on}+${onl}=0,${none(off)},${onl}/(${on}+${onl}))`;

// 출석 현황 시트의 열
const M = { group: 1, name: 2, on: 3, online: 4, absent: 5, rateOn: 6, rateBoth: 7, share: 8, run: 9, state: 10 } as const;

export function buildAttendanceWorkbook(book: Book): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const landscape: Partial<ExcelJS.PageSetup> = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const n = book.weeks.length;
  const period = n ? `${book.start} ~ ${book.end} · ${n}주` : "기록 없음";

  // 사람 줄 — 모든 시트가 같은 줄을 쓴다
  const placed: Placed[] = [];
  book.groups.forEach((g) => g.rows.forEach((row, i) => placed.push({ row, group: g.name, r: FIRST + placed.length, firstOfGroup: i === 0 })));
  const bandOf = new Map(book.groups.map((g, i) => [g.name, i % 2 === 0 ? BAND : undefined]));
  const LAST = placed.length ? placed[placed.length - 1].r : FIRST;
  const TOTAL = LAST + 2;

  // 해마다 — 그 해에 드는 주의 자리(book.weeks 의 순번)
  const years = [...new Set(book.weeks.map((w) => w.slice(0, 4)))];
  const weeksOf = (y: string) => book.weeks.flatMap((w, i) => (w.startsWith(y) ? [i] : []));
  // 해 시트의 열: 주 칸 뒤에 현장 · 온라인 · 결석 · 출석률(현장) · 출석률(현장 + 온라인) · 온라인 비율
  const Y = (y: string) => {
    const k = weeksOf(y).length;
    return { w0: 3, on: 3 + k, online: 4 + k, absent: 5 + k, rateOn: 6 + k, rateBoth: 7 + k, share: 8 + k, k };
  };
  const yref = (y: string, c: number, r: number) => `'${yearSheet(y)}'!${col(c)}${r}`;
  // 해 시트 아래의 주별 합계 줄 — 현장 · 온라인 · 출석(현장 + 온라인) · 결석 · 출석률 둘
  const T = { on: TOTAL, online: TOTAL + 1, here: TOTAL + 2, absent: TOTAL + 3, rateOn: TOTAL + 4, rateBoth: TOTAL + 5 };
  const count = (m: "onsite" | "online" | "absent", i: number) => placed.filter((p) => p.row.marks[i] === m).length;
  const sumAll = (k: "onsite" | "online" | "absent") => placed.reduce((s, p) => s + p.row[k], 0);
  const tOn = sumAll("onsite");
  const tOnl = sumAll("online");
  const tAb = sumAll("absent");

  const people = (ws: ExcelJS.Worksheet) => {
    ws.getColumn(1).width = 11;
    ws.getColumn(2).width = 20;
    ws.getRow(HEAD).height = 24;
    head(ws, HEAD, 1, "목장");
    head(ws, HEAD, 2, "이름");
    for (const p of placed) {
      const band = bandOf.get(p.group);
      // 목장은 줄마다 적는다(필터 · SUMIF). 되풀이는 연한 글씨
      put(ws, p.r, 1, p.group, { bold: p.firstOfGroup, fill: band, color: p.firstOfGroup ? undefined : "FFB0B0B0" });
      put(ws, p.r, 2, p.row.name, { bold: p.row.leader, fill: p.row.flagged ? YELLOW : band });
    }
  };

  // ── 시트 1: 출석 현황 — 지표만 ───────────────────────────────────────────────
  const ws = wb.addWorksheet(MAIN_SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: HEAD }], pageSetup: { ...landscape, printTitlesRow: `${HEAD}:${HEAD}` } });
  people(ws);
  title(ws, 1, "출석 현황", `${period} · 주마다의 출석은 '출석부 ○○○○' 시트 · 노란 칸은 온라인 비율 1/5 초과`);
  const MAIN_HEADS: [number, string, number][] = [
    [M.on, "현장", 8], [M.online, "온라인", 8], [M.absent, "결석", 8], [M.rateOn, "출석률\n(현장)", 10], [M.rateBoth, "출석률\n(현장 + 온라인)", 13],
    [M.share, "온라인\n비율", 9], [M.run, "연속\n결석", 8], [M.state, "자격", 15],
  ];
  for (const [c, t, w] of MAIN_HEADS) {
    head(ws, HEAD, c, t);
    ws.getColumn(c).width = w;
  }
  const A = (c: number, r: number) => `${col(c)}${r}`;
  /** 해마다의 시트에서 같은 줄의 칸을 더한다 */
  const acrossYears = (pick: (y: string) => number, r: number) => years.map((y) => yref(y, pick(y), r)).join("+");
  for (const p of placed) {
    const { row, r } = p;
    const band = bandOf.get(p.group);
    const here = row.onsite + row.online;
    const off = row.off !== null;
    const cf = off ? DASH_FMT : COUNT_FMT;
    put(ws, r, M.on, years.length ? f(acrossYears((y) => Y(y).on, r), row.onsite) : 0, { fill: band, fmt: cf });
    put(ws, r, M.online, years.length ? f(acrossYears((y) => Y(y).online, r), row.online) : 0, { fill: band, fmt: cf });
    put(ws, r, M.absent, years.length ? f(acrossYears((y) => Y(y).absent, r), row.absent) : 0, { fill: band, fmt: cf });
    put(ws, r, M.rateOn, f(rateOn(A(M.on, r), A(M.online, r), A(M.absent, r), off), ratio(row.onsite, here + row.absent, off)), { fill: band, fmt: PCT });
    put(ws, r, M.rateBoth, f(rateBoth(A(M.on, r), A(M.online, r), A(M.absent, r), off), ratio(here, here + row.absent, off)), { fill: band, fmt: PCT });
    put(ws, r, M.share, f(shareOf(A(M.on, r), A(M.online, r), off), ratio(row.online, here, off)), { fill: row.flagged ? YELLOW : band, fmt: PCT });
    const run = row.membership.absentRun;
    put(ws, r, M.run, run, { fill: run >= 8 ? RED : run >= 4 ? ORANGE : band, fmt: cf });
    put(ws, r, M.state, MEMBER_LABEL[row.membership.state], { fill: band });
  }
  put(ws, TOTAL, 1, "합계", { bold: true, fill: GRAY });
  put(ws, TOTAL, 2, f(`COUNTA(B${FIRST}:B${LAST})`, placed.length), { bold: true, fill: GRAY, fmt: '0"명"' });
  const S = (c: number) => `SUM(${col(c)}${FIRST}:${col(c)}${LAST})`;
  put(ws, TOTAL, M.on, f(S(M.on), tOn), { bold: true, fill: GRAY, fmt: COUNT_FMT });
  put(ws, TOTAL, M.online, f(S(M.online), tOnl), { bold: true, fill: GRAY, fmt: COUNT_FMT });
  put(ws, TOTAL, M.absent, f(S(M.absent), tAb), { bold: true, fill: GRAY, fmt: COUNT_FMT });
  put(ws, TOTAL, M.rateOn, f(rateOn(A(M.on, TOTAL), A(M.online, TOTAL), A(M.absent, TOTAL)), ratio(tOn, tOn + tOnl + tAb)), { bold: true, fill: GRAY, fmt: PCT });
  put(ws, TOTAL, M.rateBoth, f(rateBoth(A(M.on, TOTAL), A(M.online, TOTAL), A(M.absent, TOTAL)), ratio(tOn + tOnl, tOn + tOnl + tAb)), { bold: true, fill: GRAY, fmt: PCT });
  put(ws, TOTAL, M.share, f(shareOf(A(M.on, TOTAL), A(M.online, TOTAL)), ratio(tOnl, tOn + tOnl)), { bold: true, fill: GRAY, fmt: PCT });
  if (placed.length) {
    flagRule(ws, [col(M.name), col(M.share)], col(M.share), FIRST, LAST);
    rateScale(ws, `${col(M.rateOn)}${FIRST}:${col(M.rateBoth)}${LAST}`);
    ws.addConditionalFormatting({ ref: `${col(M.run)}${FIRST}:${col(M.run)}${LAST}`, rules: [expr(`${col(M.run)}${FIRST}>=8`, RED, 1), expr(`${col(M.run)}${FIRST}>=4`, ORANGE, 2)] });
  }
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: LAST, column: M.state } };

  // ── 시트 2~: 해마다의 출석부 — 주를 옆으로 쭉. 최근 해가 앞 ─────────────────
  for (const y of [...years].reverse()) {
    const idx = weeksOf(y);
    const c = Y(y);
    const ys = wb.addWorksheet(yearSheet(y), { views: [{ state: "frozen", xSplit: 2, ySplit: HEAD }], pageSetup: { ...landscape, printTitlesRow: `${HEAD}:${HEAD}`, printTitlesColumn: "A:B" } });
    people(ys);
    title(ys, 1, `${y}년 출석부`, `${book.weeks[idx[0]]} ~ ${book.weeks[idx[idx.length - 1]]} · ${idx.length}주 · O 현장 · 온 온라인 · X 결석 · 빈칸은 목장보고서 없음`);
    idx.forEach((wi, j) => {
      head(ys, HEAD, c.w0 + j, weekShort(book.weeks[wi]));
      ys.getColumn(c.w0 + j).width = 7;
    });
    const tail: [number, string, number][] = [[c.on, "현장", 8], [c.online, "온라인", 8], [c.absent, "결석", 8], [c.rateOn, "출석률\n(현장)", 10], [c.rateBoth, "출석률\n(현장 + 온라인)", 13], [c.share, "온라인\n비율", 9]];
    for (const [cc, t, w] of tail) {
      head(ys, HEAD, cc, t);
      ys.getColumn(cc).width = w;
    }
    const first = col(c.w0);
    const last = col(c.w0 + c.k - 1);
    for (const p of placed) {
      const { row, r } = p;
      const band = bandOf.get(p.group);
      let on = 0;
      let onl = 0;
      let ab = 0;
      idx.forEach((wi, j) => {
        const m = row.marks[wi];
        const text = m === null ? "" : m === "onsite" ? O : m === "online" ? ON : m === "off" ? (row.off ?? "") : X;
        if (m === "onsite") on++;
        else if (m === "online") onl++;
        else if (m === "absent") ab++;
        const colors = m === "off" ? C_OFF : markFill(text);
        put(ys, r, c.w0 + j, text, { fill: colors?.bg ?? band, color: colors?.fg });
      });
      const range = `${first}${r}:${last}${r}`;
      const off = row.off !== null;
      const cf = off ? DASH_FMT : COUNT_FMT;
      put(ys, r, c.on, f(`COUNTIF(${range},"${O}")`, on), { fill: band, fmt: cf });
      put(ys, r, c.online, f(`COUNTIF(${range},"${ON}")`, onl), { fill: band, fmt: cf });
      put(ys, r, c.absent, f(`COUNTIF(${range},"${X}")`, ab), { fill: band, fmt: cf });
      put(ys, r, c.rateOn, f(rateOn(A(c.on, r), A(c.online, r), A(c.absent, r), off), ratio(on, on + onl + ab, off)), { fill: band, fmt: PCT });
      put(ys, r, c.rateBoth, f(rateBoth(A(c.on, r), A(c.online, r), A(c.absent, r), off), ratio(on + onl, on + onl + ab, off)), { fill: band, fmt: PCT });
      put(ys, r, c.share, f(shareOf(A(c.on, r), A(c.online, r), off), ratio(onl, on + onl, off)), { fill: band, fmt: PCT });
    }
    // 주별 합계 — 현장 · 온라인 · 결석 · 출석률 둘
    const labels: [number, string][] = [[T.on, "현장"], [T.online, "온라인"], [T.here, "출석(현장 + 온라인)"], [T.absent, "결석"], [T.rateOn, "출석률(현장)"], [T.rateBoth, "출석률(현장 + 온라인)"]];
    for (const [r, label] of labels) {
      put(ys, r, 1, "주별 합계", { fill: GRAY, color: "FF7F7F7F" });
      put(ys, r, 2, label, { bold: true, fill: GRAY });
    }
    idx.forEach((wi, j) => {
      const cc = c.w0 + j;
      const down = `${col(cc)}${FIRST}:${col(cc)}${LAST}`;
      const on = count("onsite", wi);
      const onl = count("online", wi);
      const ab = count("absent", wi);
      put(ys, T.on, cc, f(`COUNTIF(${down},"${O}")`, on), { fill: GRAY, fmt: COUNT_FMT });
      put(ys, T.online, cc, f(`COUNTIF(${down},"${ON}")`, onl), { fill: GRAY, fmt: COUNT_FMT });
      put(ys, T.here, cc, f(`${A(cc, T.on)}+${A(cc, T.online)}`, on + onl), { fill: GRAY, fmt: COUNT_FMT, bold: true });
      put(ys, T.absent, cc, f(`COUNTIF(${down},"${X}")`, ab), { fill: GRAY, fmt: COUNT_FMT });
      put(ys, T.rateOn, cc, f(rateOn(A(cc, T.on), A(cc, T.online), A(cc, T.absent)), ratio(on, on + onl + ab)), { fill: GRAY, fmt: PCT, bold: true });
      put(ys, T.rateBoth, cc, f(rateBoth(A(cc, T.on), A(cc, T.online), A(cc, T.absent)), ratio(on + onl, on + onl + ab)), { fill: GRAY, fmt: PCT, bold: true });
    });
    // 합계 줄의 오른쪽 — 그 해의 주 평균 인원 · 합계 · 출석률(사용자 요청 2026-11-16)
    head(ys, TOTAL - 1, c.on, "주 평균");
    head(ys, TOTAL - 1, c.online, "합계");
    const yOn = idx.reduce((s, wi) => s + count("onsite", wi), 0);
    const yOnl = idx.reduce((s, wi) => s + count("online", wi), 0);
    const yAb = idx.reduce((s, wi) => s + count("absent", wi), 0);
    const avgRows: [number, number][] = [[T.on, yOn], [T.online, yOnl], [T.here, yOn + yOnl], [T.absent, yAb]];
    for (const [r, total] of avgRows) {
      const across = `${first}${r}:${last}${r}`;
      put(ys, r, c.on, f(`IFERROR(AVERAGE(${across}),"")`, c.k ? total / c.k : ""), { fill: GRAY, fmt: "0.0", bold: true });
      put(ys, r, c.online, f(`SUM(${across})`, total), { fill: GRAY, fmt: COUNT_FMT, bold: true });
    }
    const sOn = A(c.online, T.on);
    const sOnl = A(c.online, T.online);
    const sAb = A(c.online, T.absent);
    put(ys, T.rateOn, c.on, f(rateOn(sOn, sOnl, sAb), ratio(yOn, yOn + yOnl + yAb)), { fill: GRAY, fmt: PCT, bold: true });
    put(ys, T.rateBoth, c.on, f(rateBoth(sOn, sOnl, sAb), ratio(yOn + yOnl, yOn + yOnl + yAb)), { fill: GRAY, fmt: PCT, bold: true });
    if (placed.length) {
      const eq = (v: string, k: { bg: string; fg: string }, priority: number): ExcelJS.ConditionalFormattingRule => ({
        type: "cellIs",
        operator: "equal",
        priority,
        formulae: [`"${v}"`],
        style: { fill: cfFill(k.bg), font: { color: { argb: k.fg } } },
      });
      ys.addConditionalFormatting({ ref: `${first}${FIRST}:${last}${LAST}`, rules: [eq(O, C_ON, 2), eq(ON, C_ONLINE, 3), eq(X, C_ABSENT, 4)] });
      rateScale(ys, `${col(c.rateOn)}${FIRST}:${col(c.rateBoth)}${LAST}`);
      flagRule(ys, [col(c.share)], col(c.share), FIRST, LAST);
    }
    ys.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: LAST, column: c.share } };
  }

  // ── 회원 명단 — 명단 셋을 옆으로 나란히 ──────────────────────────────────────
  const ms = wb.addWorksheet("회원 명단", { views: [{ state: "frozen", ySplit: HEAD }], pageSetup: landscape });
  ms.getRow(HEAD).height = 24;
  const main = (c: number, r: number) => `'${MAIN_SHEET}'!${col(c)}${r}`;
  const WIDTHS = [11, 20, 8, 8, 13, 9, 16, 22];
  const HEADS = ["목장", "이름", "현장", "온라인", "출석률\n(현장 + 온라인)", "온라인\n비율", "자격", "비고"];
  const section = (c0: number, name: string, note: string, list: Placed[], extra: (p: Placed) => string): { next: number; last: number } => {
    WIDTHS.forEach((w, i) => (ms.getColumn(c0 + i).width = w));
    ms.getColumn(c0 + WIDTHS.length).width = 3;
    title(ms, c0, `${name} (${list.length}명)`, note);
    HEADS.forEach((t, i) => head(ms, HEAD, c0 + i, t));
    let r = FIRST;
    let prev = "";
    let band = false;
    for (const p of list) {
      const first = p.group !== prev;
      if (first) band = !band;
      const bg = band ? BAND : undefined;
      const here = p.row.onsite + p.row.online;
      put(ms, r, c0, p.group, { bold: first, fill: bg, color: first ? undefined : "FFB0B0B0" });
      put(ms, r, c0 + 1, p.row.name, { fill: p.row.flagged ? YELLOW : bg, bold: p.row.leader });
      put(ms, r, c0 + 2, f(main(M.on, p.r), p.row.onsite), { fill: bg, fmt: COUNT_FMT });
      put(ms, r, c0 + 3, f(main(M.online, p.r), p.row.online), { fill: bg, fmt: COUNT_FMT });
      put(ms, r, c0 + 4, f(main(M.rateBoth, p.r), ratio(here, here + p.row.absent, p.row.off !== null)), { fill: bg, fmt: PCT });
      put(ms, r, c0 + 5, f(main(M.share, p.r), ratio(p.row.online, here, p.row.off !== null)), { fill: p.row.flagged ? YELLOW : bg, fmt: PCT });
      put(ms, r, c0 + 6, MEMBER_LABEL[p.row.membership.state], { fill: bg });
      put(ms, r, c0 + 7, extra(p), { fill: bg });
      prev = p.group;
      r++;
    }
    if (list.length) {
      flagRule(ms, [col(c0 + 1), col(c0 + 5)], col(c0 + 5), FIRST, r - 1);
      rateScale(ms, `${col(c0 + 4)}${FIRST}:${col(c0 + 4)}${r - 1}`);
    } else {
      ms.getCell(FIRST, c0).value = "없음";
      ms.getCell(FIRST, c0).font = font(10, false, "FF7F7F7F");
    }
    return { next: c0 + WIDTHS.length + 1, last: Math.max(r - 1, FIRST) };
  };
  const runNote = (p: Placed) => (p.row.membership.excused ? "사유 있음(결석 세지 않음)" : p.row.membership.absentRun >= 4 ? `연속 결석 ${p.row.membership.absentRun}주` : "");
  const members = placed.filter((p) => isMember(p.row.membership.state));
  const stopped = placed.filter((p) => p.row.membership.state === "lost");
  const qualified = placed.filter((p) => p.row.membership.state === "qualified");
  const s1 = section(1, "회원 명단", `${period} · 현장 + 온라인 출석 기준 · 노란 칸은 온라인 비율 1/5 초과`, members, runNote);
  const s2 = section(s1.next, "회원 자격 중지", "회원이 8주 연속 결석 — 4주 연속 출석하면 회복", stopped, (p) => (p.row.membership.lostAt ? `${weekShort(p.row.membership.lostAt)} 중지` : ""));
  section(s2.next, "출석 요건 충족", "회원 아님 · 6개월 이상 기록에 3/4 이상 출석 — 나머지 요건 확인 뒤 명단에 표시", qualified, () => "");

  // ── 요약 — 앞 시트를 세는 함수 ───────────────────────────────────────────────
  const sm = wb.addWorksheet("요약", { views: [{ state: "frozen", ySplit: HEAD }], pageSetup: landscape });
  sm.getRow(HEAD).height = 24;
  const mainRange = (c: number) => `'${MAIN_SHEET}'!$${col(c)}$${FIRST}:$${col(c)}$${LAST}`;
  const groupCol = mainRange(M.group);

  // 전체 — A:B
  sm.getColumn(1).width = 26;
  sm.getColumn(2).width = 12;
  sm.getColumn(3).width = 3;
  title(sm, 1, "전체", period);
  head(sm, HEAD, 1, "항목");
  head(sm, HEAD, 2, "값");
  const lastYear = years[years.length - 1];
  const lw = n - 1;
  const lastCol = lastYear ? Y(lastYear).w0 + Y(lastYear).k - 1 : 0;
  const overall: [string, ExcelJS.CellValue, string][] = [
    ["전체 인원", f(`COUNTA(${mainRange(M.name)})`, placed.length), COUNT_FMT],
    ["회원", members.length ? f(`COUNTA('회원 명단'!$B$${FIRST}:$B$${s1.last})`, members.length) : 0, COUNT_FMT],
    ["회원 자격 중지", f(`COUNTIF(${mainRange(M.state)},"${MEMBER_LABEL.lost}")`, stopped.length), COUNT_FMT],
    ["출석 요건 충족(회원 아님)", f(`COUNTIF(${mainRange(M.state)},"${MEMBER_LABEL.qualified}")`, qualified.length), COUNT_FMT],
    ["온라인 비율 1/5 초과", f(`COUNTIF(${mainRange(M.share)},">${ONLINE_FLAG}")`, placed.filter((p) => p.row.flagged).length), COUNT_FMT],
    ["연속 결석 4주 이상", f(`COUNTIF(${mainRange(M.run)},">=4")`, placed.filter((p) => p.row.membership.absentRun >= 4).length), COUNT_FMT],
    ["최근 주 현장", lastYear ? f(yref(lastYear, lastCol, T.on), count("onsite", lw)) : 0, COUNT_FMT],
    ["최근 주 온라인", lastYear ? f(yref(lastYear, lastCol, T.online), count("online", lw)) : 0, COUNT_FMT],
    ["최근 주 결석", lastYear ? f(yref(lastYear, lastCol, T.absent), count("absent", lw)) : 0, COUNT_FMT],
    ["기간 출석률(현장)", f(main(M.rateOn, TOTAL), ratio(tOn, tOn + tOnl + tAb)), PCT],
    ["기간 출석률(현장 + 온라인)", f(main(M.rateBoth, TOTAL), ratio(tOn + tOnl, tOn + tOnl + tAb)), PCT],
  ];
  overall.forEach(([label, value, fmt], i) => {
    put(sm, FIRST + i, 1, label, { left: true });
    put(sm, FIRST + i, 2, value, { fmt, bold: true });
  });

  // 주별 추이 — D:I. 최근 주가 위
  const w0 = 4;
  [12, 8, 8, 8, 11, 13].forEach((w, i) => (sm.getColumn(w0 + i).width = w));
  sm.getColumn(w0 + 6).width = 3;
  title(sm, w0, "주별 추이", "최근 주가 위 · 출석률은 기록 있는 사람 가운데");
  ["주", "현장", "온라인", "결석", "출석률\n(현장)", "출석률\n(현장 + 온라인)"].forEach((t, i) => head(sm, HEAD, w0 + i, t));
  [...book.weeks.keys()].reverse().forEach((wi, k) => {
    const w = book.weeks[wi];
    const y = w.slice(0, 4);
    const cc = Y(y).w0 + weeksOf(y).indexOf(wi);
    const r = FIRST + k;
    const on = count("onsite", wi);
    const onl = count("online", wi);
    const ab = count("absent", wi);
    put(sm, r, w0, `${y.slice(2)}. ${weekShort(w)}`);
    put(sm, r, w0 + 1, f(yref(y, cc, T.on), on), { fmt: COUNT_FMT });
    put(sm, r, w0 + 2, f(yref(y, cc, T.online), onl), { fmt: COUNT_FMT });
    put(sm, r, w0 + 3, f(yref(y, cc, T.absent), ab), { fmt: COUNT_FMT });
    put(sm, r, w0 + 4, f(yref(y, cc, T.rateOn), ratio(on, on + onl + ab)), { fmt: PCT });
    put(sm, r, w0 + 5, f(yref(y, cc, T.rateBoth), ratio(on + onl, on + onl + ab)), { fmt: PCT });
  });
  if (n) rateScale(sm, `${col(w0 + 4)}${FIRST}:${col(w0 + 5)}${FIRST + n - 1}`);

  // 목장별 — K:R
  const g0 = w0 + 7;
  [11, 8, 8, 8, 8, 13, 9, 9].forEach((w, i) => (sm.getColumn(g0 + i).width = w));
  title(sm, g0, "목장별", "기간 전체");
  ["목장", "인원", "현장", "온라인", "결석", "출석률\n(현장 + 온라인)", "온라인\n비율", "회원"].forEach((t, i) => head(sm, HEAD, g0 + i, t));
  const memberGroups = members.length ? `'회원 명단'!$A$${FIRST}:$A$${s1.last}` : null;
  const gc = (k: number, r: number) => `${col(g0 + k)}${r}`;
  book.groups.forEach((g, i) => {
    const r = FIRST + i;
    const key = `$${col(g0)}${r}`;
    const on = g.rows.reduce((s, x) => s + x.onsite, 0);
    const onl = g.rows.reduce((s, x) => s + x.online, 0);
    const ab = g.rows.reduce((s, x) => s + x.absent, 0);
    put(sm, r, g0, g.name, { bold: true });
    put(sm, r, g0 + 1, f(`COUNTIF(${groupCol},${key})`, g.rows.length), { fmt: COUNT_FMT });
    put(sm, r, g0 + 2, f(`SUMIF(${groupCol},${key},${mainRange(M.on)})`, on), { fmt: COUNT_FMT });
    put(sm, r, g0 + 3, f(`SUMIF(${groupCol},${key},${mainRange(M.online)})`, onl), { fmt: COUNT_FMT });
    put(sm, r, g0 + 4, f(`SUMIF(${groupCol},${key},${mainRange(M.absent)})`, ab), { fmt: COUNT_FMT });
    put(sm, r, g0 + 5, f(rateBoth(gc(2, r), gc(3, r), gc(4, r)), ratio(on + onl, on + onl + ab)), { fmt: PCT });
    put(sm, r, g0 + 6, f(shareOf(gc(2, r), gc(3, r)), ratio(onl, on + onl)), { fmt: PCT });
    const mine = members.filter((p) => p.group === g.name).length;
    put(sm, r, g0 + 7, memberGroups ? f(`COUNTIF(${memberGroups},${key})`, mine) : 0, { fmt: COUNT_FMT });
  });
  if (book.groups.length) {
    const gl = FIRST + book.groups.length - 1;
    const r = gl + 1;
    const totals: Record<number, number> = { 1: placed.length, 2: tOn, 3: tOnl, 4: tAb, 7: members.length };
    put(sm, r, g0, "합계", { bold: true, fill: GRAY });
    for (const k of [1, 2, 3, 4, 7]) put(sm, r, g0 + k, f(`SUM(${gc(k, FIRST)}:${gc(k, gl)})`, totals[k]), { bold: true, fill: GRAY, fmt: COUNT_FMT });
    put(sm, r, g0 + 5, f(rateBoth(gc(2, r), gc(3, r), gc(4, r)), ratio(tOn + tOnl, tOn + tOnl + tAb)), { bold: true, fill: GRAY, fmt: PCT });
    put(sm, r, g0 + 6, f(shareOf(gc(2, r), gc(3, r)), ratio(tOnl, tOn + tOnl)), { bold: true, fill: GRAY, fmt: PCT });
    rateScale(sm, `${gc(5, FIRST)}:${gc(5, gl)}`);
    flagRule(sm, [col(g0 + 6)], col(g0 + 6), FIRST, gl);
  }
  return wb;
}

/**
 * 파일로 — 엑셀이 '수식이 옆 칸과 다르다 · 옆 칸을 빼고 센다' 며 붙이는 초록 세모를 끈다(시트마다 ignoredErrors).
 * exceljs 는 이 표시를 쓰지 못해 만든 파일을 다시 열어 시트 XML 에 넣는다. 자리는 정해져 있다 — 그림 · 표 · 확장 앞, 없으면 맨 끝.
 */
export async function attendanceXlsxBuffer(book: Book): Promise<ArrayBuffer> {
  const raw = await buildAttendanceWorkbook(book).xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(raw);
  const IGNORE = '<ignoredErrors><ignoredError sqref="A1:XFD5000" formula="1" formulaRange="1" numberStoredAsText="1"/></ignoredErrors>';
  const names = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  for (const name of names) {
    const xml = await zip.file(name)!.async("string");
    if (xml.includes("<ignoredErrors")) continue;
    const at = ["<smartTags", "<drawing", "<legacyDrawing", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"]
      .map((t) => xml.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (at === undefined) continue;
    zip.file(name, xml.slice(0, at) + IGNORE + xml.slice(at));
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
