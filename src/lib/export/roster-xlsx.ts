import ExcelJS from "exceljs";

import { rosterTitle, type RosterModel } from "./roster-model";

/**
 * 명단 엑셀(2026-10-28) — 교회가 쓰던 '260503_로뎀나무교회 청년대학부 명단.xlsx' 의 '명단_및_현황' 시트와
 * 같은 구조 · 색 · 함수로 그린다. 조직도 시트는 만들지 않는다(사용자 결정).
 *
 *   A~N  명단 — 3행 머리글(파란 칸 · 흰 굵은 글씨), 4행부터 한 사람 한 줄. 목장이 바뀔 때마다 연두 · 흰 줄,
 *        목장 첫 줄의 목장 · 이름 · 구분 · 훈련단계는 굵게. 섬김(M) · 부서(N)는 늘 연두이고 함수다
 *          M  =COUNTIF($V$5:$Z$끝, 이름)                       — 오른쪽 부서 표에 이름이 나오는 수
 *          N  =TEXTJOIN(", ", TRUE, IF(표=이름, 부서 머리글, "")…) — 배열 수식, 표마다 IF 하나
 *   P~Q  통계 — 총 재적 · 리더 그룹 · 섬김 참여 · 형제 · 자매, 마을별 현황(COUNTIF)
 *   S~T  목장별 현황 — 목장마다 COUNTIF(B:B, 목장)
 *   V·X·Z 섬김 부서별 명단 — 부서 셋씩 한 표, 머리글 아래 노란 칸에 이름. 표 높이는 원본(18·16·14·14·14줄)보다
 *        사람이 많으면 늘어난다
 * 원본의 어긋남은 바로잡았다(사용자 결정): 모든 줄에 M · N 함수, M 과 N 이 같은 범위(부서 표 전체)를 본다,
 * 머리글 테두리 통일. 함수의 계산값도 함께 넣어 두어 계산하지 않는 미리보기에서도 숫자가 보이고, 엑셀은 열 때 다시 계산한다.
 */

const FONT = "맑은 고딕";
const BLUE = "FF4F81BD";
const GREEN = "FFEBF1DE";
const WHITE = "FFFFFFFF";
const YELLOW = "FFFFF2CC";
const NAVY = "FF1F497D";

const thin: Partial<ExcelJS.Border> = { style: "thin" };
const BOX: Partial<ExcelJS.Borders> = { left: thin, right: thin, top: thin, bottom: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const font = (size: number, bold = false, argb?: string): Partial<ExcelJS.Font> => ({
  name: FONT,
  size,
  bold,
  family: 2,
  color: argb ? { argb } : { theme: 1 },
});
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
/** 함수 안 글자 — 큰따옴표는 두 번 */
const q = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** 열 너비 — 원본 그대로 */
const WIDTHS: Record<string, number> = {
  A: 9.5, B: 9.16, C: 12.83, D: 10.83, E: 11.66, F: 9.83, G: 5.16, H: 11.66, I: 22.66, J: 14.66, K: 13,
  L: 36.83, M: 5, N: 32.66, O: 2.66, P: 15.16, Q: 13.16, R: 2.33, S: 14.16, T: 13.16, U: 2.66,
  V: 15.66, W: 1.66, X: 15.66, Y: 1.66, Z: 15.66, AA: 1.66,
};
const HEADERS = ["마을", "목장", "이름", "구분", "훈련단계\n(교육과정)", "출생년도", "성별", "직업", "소속", "청년대학부 회원", "공동의회 회원", "비고", "섬김", "부서"];
/** 부서 표 — 셋씩 V · X · Z 에, 표마다 최소 줄 수(원본) */
const MIN_ROWS = [18, 16, 14, 14, 14];
const DEPT_COLS = ["V", "X", "Z"];
const FIRST_DATA = 4;

type Box = { header: number; first: number; last: number; names: string[]; cols: { col: string; people: string[] }[] };

/** 부서 표 자리 — 1번 표 머리글은 4행, 다음 표 머리글은 앞 표 바로 아래 */
export function layoutMinistries(ministries: RosterModel["ministries"]): Box[] {
  const boxes: Box[] = [];
  let header = 4;
  for (let i = 0; i < ministries.length; i += 3) {
    const three = ministries.slice(i, i + 3);
    const k = boxes.length;
    const rows = Math.max(MIN_ROWS[k] ?? 14, ...three.map((m) => m.people.length));
    boxes.push({
      header,
      first: header + 1,
      last: header + rows,
      names: three.map((m) => m.name),
      cols: three.map((m, j) => ({ col: DEPT_COLS[j], people: m.people })),
    });
    header += rows + 1;
  }
  return boxes;
}

/** 섬김 수(M) · 부서(N)의 계산값 — 엑셀의 함수와 같은 순서(표마다 위에서 아래로, 한 줄은 왼쪽에서 오른쪽으로) */
function ministriesOf(name: string, boxes: Box[]): string[] {
  const out: string[] = [];
  for (const b of boxes) {
    for (let r = 0; r <= b.last - b.first; r++) {
      for (const c of b.cols) if (c.people[r] === name) out.push(b.names[DEPT_COLS.indexOf(c.col)]);
    }
  }
  return out;
}

export function buildRosterWorkbook(model: RosterModel): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "구구";
  wb.created = new Date(0); // 파일 안에 생성 시각을 남기지 않는다 — 기준일은 시트에, 누가 받았는지는 로그에
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet("명단_및_현황", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4", zoomScale: 84 }],
    properties: { defaultRowHeight: 17, defaultColWidth: 8.83 },
  });
  for (const [col, width] of Object.entries(WIDTHS)) ws.getColumn(col).width = width;
  ws.getRow(1).height = 27;
  ws.getRow(3).height = 36;

  const put = (addr: string, value: ExcelJS.CellValue, style: Partial<ExcelJS.Style>) => {
    const c = ws.getCell(addr);
    c.value = value;
    Object.assign(c, style);
    return c;
  };
  const head = (addr: string, value: string, border: Partial<ExcelJS.Borders> = BOX, wrap = false) =>
    put(addr, value, { font: font(11, true, WHITE), fill: fill(BLUE), border, alignment: { ...CENTER, wrapText: wrap || undefined } });
  const plainCell = (addr: string, value: ExcelJS.CellValue) => put(addr, value, { font: font(11), fill: fill(WHITE), border: BOX, alignment: CENTER });

  // 제목 · 기준일
  put("A1", rosterTitle(model.scope), { font: font(18, true), alignment: { horizontal: "left" } });
  const sectionTitle: Partial<ExcelJS.Style> = { font: font(14, true, NAVY), alignment: { horizontal: "left" }, border: { bottom: { style: "medium" } } };
  put("P1", "통계", sectionTitle);
  put("V1", "섬김 부서별 명단", sectionTitle);
  put("W1", null, sectionTitle); // 원본도 밑줄이 한 칸 더 간다
  put("P2", `기준: ${model.asOf}`, { font: font(11) });
  put("V2", `기준: ${model.asOf}`, { font: font(11) });

  // 명단 머리글
  HEADERS.forEach((h, i) => head(`${String.fromCharCode(65 + i)}3`, h, BOX, i === 4));

  // 섬김 부서 표 — 명단의 M · N 함수가 이 자리를 본다
  const boxes = layoutMinistries(model.ministries);
  const deptLast = boxes.length ? boxes[boxes.length - 1].last : 4;
  for (const b of boxes) {
    b.cols.forEach((c, j) => {
      head(`${c.col}${b.header}`, b.names[j], { left: thin });
      for (let r = b.first; r <= b.last; r++) {
        put(`${c.col}${r}`, c.people[r - b.first] ?? null, { font: font(11), fill: fill(YELLOW), border: BOX, alignment: { horizontal: "center" } });
      }
    });
  }

  // 명단
  model.lines.forEach((p, i) => {
    const r = FIRST_DATA + i;
    const band = fill(p.groupIndex % 2 === 0 ? GREEN : WHITE);
    const values: ExcelJS.CellValue[] = [
      p.village, p.group, p.name, p.kind, p.stage, p.birthYear, p.gender, p.occupation, p.affiliation,
      p.youth ? "O" : null, p.assembly ? "O" : null, p.note,
    ];
    values.forEach((v, j) => {
      const bold = p.first && j >= 1 && j <= 4; // 목장 첫 줄 — 목장 · 이름 · 구분 · 훈련단계
      put(`${String.fromCharCode(65 + j)}${r}`, v === "" ? null : v, { font: font(11, bold), fill: band, border: BOX, alignment: CENTER });
    });
    const mine = ministriesOf(p.name, boxes);
    const always: Partial<ExcelJS.Style> = { font: font(11), fill: fill(GREEN), border: BOX, alignment: CENTER };
    put(`M${r}`, { formula: `COUNTIF($V$5:$Z$${deptLast}, C${r})`, result: mine.length }, always);
    const ifs = boxes.map((b) => `IF($V$${b.first}:$Z$${b.last}=C${r}, $V$${b.header}:$Z$${b.header}, "")`).join(", ");
    put(`N${r}`, { formula: `_xlfn.TEXTJOIN(", ", TRUE, ${ifs})`, result: mine.join(", "), shareType: "array", ref: `N${r}` } as ExcelJS.CellFormulaValue, always);
  });

  // 통계
  head("P4", "구분");
  head("Q4", "인원(명)");
  const total = model.lines.length;
  const count = (pred: (l: RosterModel["lines"][number]) => boolean) => model.lines.filter(pred).length;
  const stats: [string, string, number][] = [
    ["총 재적", "COUNTA(C:C)-1", total],
    ["리더 그룹", 'COUNTIF(D:D, "리더")', count((l) => l.kind === "리더")],
    ["섬김 참여", 'COUNTIF(M:M, ">0")', count((l) => ministriesOf(l.name, boxes).length > 0)],
    ["형제(남)", 'COUNTIF(G:G, "남")', count((l) => l.gender === "남")],
    ["자매(여)", 'COUNTIF(G:G, "여")', count((l) => l.gender === "여")],
  ];
  stats.forEach(([label, formula, result], i) => {
    plainCell(`P${5 + i}`, label);
    plainCell(`Q${5 + i}`, { formula, result });
  });
  put("P11", "마을별 현황", { font: font(11, true) });
  model.villages.forEach((v, i) => {
    plainCell(`P${12 + i}`, v);
    plainCell(`Q${12 + i}`, { formula: `COUNTIF(A:A, ${q(v)})`, result: count((l) => l.village === v) });
  });

  // 목장별 현황 — 새 목장 자리로 빈 칸 셋을 더 둔다(원본처럼)
  put("S3", "목장별 현황", { font: font(11, true) });
  head("S4", "목장명");
  head("T4", "인원");
  model.groups.forEach((g, i) => {
    plainCell(`S${5 + i}`, g);
    plainCell(`T${5 + i}`, { formula: `COUNTIF(B:B, ${q(g)})`, result: count((l) => l.group === g) });
  });
  for (let i = model.groups.length; i < model.groups.length + 3; i++) {
    plainCell(`S${5 + i}`, null);
    plainCell(`T${5 + i}`, null);
  }

  return wb;
}
