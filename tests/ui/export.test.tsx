import ExcelJS from "exceljs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildExportModel, watermarkText, type ExportModel } from "@/lib/export/model";
import { exportQuery, parseExportParams, rangeLabel, weeksIn } from "@/lib/export/range";
import { buildWorkbook, colName, exportFileName } from "@/lib/export/xlsx";

/**
 * Step 10 내보내기 — 범위 규칙 · 내용 모양 · Excel 파일 · PDF 파일 · 고르는 화면 · 받기 단추.
 *
 *   · 범위는 매번 고른다 — 기간·목장 둘 다 고르기 전엔 거부. '전체 목장' 은 명시적으로 고를 때만. 최대 52주
 *   · 상태 다섯(정시·지각·작성 중·미제출·휴주), 제출률은 휴주를 뺀 주 중 정시+지각
 *   · Excel(2026-10-29 다시 그림): 시트 5장, 1행 제목 · 2행 대외비 표기 · 3행 파란 머리글까지 고정, 상태 칸 색, 숫자는 함수 + 계산값
 *   · PDF 는 export-pdf.test.tsx(노드 환경 — jsdom 에서는 압축 스트림이 깨진다)
 *   · 받기 단추: 휴대폰은 받자마자 공유 시트, 손길이 식었으면 '파일 저장 · 보내기' 를 한 번 더
 */

const { ExportForm } = await import("@/app/(tabs)/export/export-form");
const { RosterExport } = await import("@/components/roster-export");
const { DownloadLink, PDF_TYPE } = await import("@/components/download-link");

const THIS = "2026-10-04";
const G1 = "11111111-1111-1111-1111-111111111111";
const G2 = "22222222-2222-2222-2222-222222222222";

describe("범위 규칙", () => {
  const parse = (p: Record<string, string | undefined>) => parseExportParams(p, THIS, [G1, G2]);

  it("기간·목장을 둘 다 골라야 한다 ★", () => {
    expect(parse({})).toMatchObject({ ok: false, message: expect.stringContaining("기간") });
    expect(parse({ from: THIS, to: THIS })).toMatchObject({ ok: false, message: expect.stringContaining("목장") });
    expect(parse({ from: THIS, to: THIS, groups: "" })).toMatchObject({ ok: false });
  });

  it("'전체 목장' 은 all 로 명시할 때만 null", () => {
    const r = parse({ from: "2026-09-13", to: THIS, groups: "all" });
    expect(r).toMatchObject({ ok: true, range: { groupIds: null, weeks: ["2026-09-13", "2026-09-20", "2026-09-27", THIS] } });
    const s = parse({ from: THIS, to: THIS, groups: `${G2},${G2}` });
    expect(s).toMatchObject({ ok: true, range: { groupIds: [G2] } });
  });

  it("거부 — 일요일 아님 · 역순 · 이번 주 뒤 · 53주 · 모르는 목장", () => {
    expect(parse({ from: "2026-10-05", to: THIS, groups: "all" }).ok).toBe(false);
    expect(parse({ from: THIS, to: "2026-09-27", groups: "all" }).ok).toBe(false);
    expect(parse({ from: THIS, to: "2026-10-11", groups: "all" }).ok).toBe(false);
    expect(parse({ from: "2025-10-05", to: THIS, groups: "all" })).toMatchObject({ ok: false, message: expect.stringContaining("52주") });
    expect(parse({ from: "2025-10-12", to: THIS, groups: "all" }).ok).toBe(true); // 정확히 52주
    expect(parse({ from: THIS, to: THIS, groups: "nope" }).ok).toBe(false);
  });

  it("쿼리·라벨·파일 이름", () => {
    expect(exportQuery({ from: "2026-09-13", to: THIS, groupIds: null })).toBe("from=2026-09-13&to=2026-10-04&groups=all");
    expect(rangeLabel("2026-09-13", THIS)).toBe("2026년 9월 13일 ~ 10월 4일 (4주)");
    expect(rangeLabel("2025-12-28", "2026-01-04")).toBe("2025년 12월 28일 ~ 2026년 1월 4일 (2주)");
    expect(exportFileName("2026-09-13", THIS)).toBe("ninetynine-2026-09-13_2026-10-04.xlsx");
    expect(exportFileName("2026-09-13", THIS, "pdf")).toBe("ninetynine-2026-09-13_2026-10-04.pdf");
    expect([colName(1), colName(26), colName(27), colName(55)]).toEqual(["A", "Z", "AA", "BC"]);
    expect(weeksIn(THIS, THIS)).toEqual([THIS]);
  });
});

function fixture(): ExportModel {
  return buildExportModel({
    weeks: ["2026-09-13", "2026-09-20", "2026-09-27", THIS],
    groups: [
      { id: G2, name: "나래", number: 2 },
      { id: G1, name: "가온", number: 1 },
    ],
    reports: [
      { id: "r1", group_id: G1, week_key: "2026-09-13", submitted_at: "2026-09-14T11:13:00Z", is_late: false, note: "MT 다녀옴" },
      { id: "r2", group_id: G1, week_key: "2026-09-27", submitted_at: "2026-09-30T12:00:00Z", is_late: true, note: null },
      { id: "r3", group_id: G1, week_key: THIS, submitted_at: null, is_late: false, note: null },
      { id: "r4", group_id: G2, week_key: "2026-09-13", submitted_at: "2026-09-14T09:00:00Z", is_late: false, note: null },
    ],
    records: [
      { report_id: "r1", person_id: "p2", week_key: "2026-09-13", worship_attended: true, group_meeting_attended: true, one_on_one_contacted: false, prayer_request: "가족의 건강" },
      { report_id: "r1", person_id: "p1", week_key: "2026-09-13", worship_attended: true, group_meeting_attended: false, one_on_one_contacted: false, prayer_request: "  " },
      { report_id: "r4", person_id: "p3", week_key: "2026-09-13", worship_attended: false, group_meeting_attended: true, one_on_one_contacted: true, prayer_request: null },
    ],
    persons: [
      { id: "p1", name: "다리더", group_role: "leader" },
      { id: "p2", name: "가청년", group_role: "member" },
      { id: "p3", name: "나청년", group_role: "member" },
    ],
    skippedWeeks: ["2026-09-20"],
  });
}

describe("내용 모양", () => {
  it("목장은 명단 순, 상태 다섯, 제출률은 휴주를 뺀 주 중 정시+지각 ★", () => {
    const m = fixture();
    expect(m.groups.map((g) => g.group.name)).toEqual(["가온", "나래"]);
    expect(m.groups[0].cells.map((c) => c.status)).toEqual(["on_time", "skipped", "late", "draft"]);
    expect(m.groups[0]).toMatchObject({ submitted: 2, expected: 3 });
    expect(m.groups[1].cells.map((c) => c.status)).toEqual(["on_time", "skipped", "missing", "missing"]);
  });

  it("사람 줄은 리더 → 청년, 빈 기도제목은 null, 주차별 합계", () => {
    const m = fixture();
    expect(m.groups[0].cells[0].lines.map((l) => [l.name, l.prayer])).toEqual([
      ["다리더", null],
      ["가청년", "가족의 건강"],
    ]);
    expect(m.totals[0]).toMatchObject({ people: 3, worship: 2, meeting: 2, contact: 1 });
    expect(m.totals[1]).toMatchObject({ people: 0 });
  });
});

describe("Excel 파일", () => {
  async function roundTrip() {
    const mark = watermarkText("2026-10-06", "임찬양");
    const wb = buildWorkbook(fixture(), { watermark: mark, rangeLabel: rangeLabel("2026-09-13", THIS) });
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    return { back, mark };
  }

  it("시트 5장 — 1행 제목, 2행 대외비 표기, 3행 파란 머리글까지 고정 ★", async () => {
    const { back, mark } = await roundTrip();
    expect(back.worksheets.map((w) => w.name)).toEqual(["요약", "출석", "개인별", "기도제목", "특이사항"]);
    expect(back.getWorksheet("요약")!.getCell("A1").value).toBe("로뎀나무교회 청년대학부 목장보고서");
    for (const ws of back.worksheets) {
      expect(String(ws.getCell("A2").value)).toBe(`${mark} · 2026년 9월 13일 ~ 10월 4일 (4주)`);
      expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
      expect((ws.getCell("A3").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF4F81BD");
      expect(ws.getCell("A3").font.color?.argb).toBe("FFFFFFFF");
    }
  });

  it("요약 — 상태 칸 색, 제출 · 대상 · 제출률은 함수(계산값 함께) ★", async () => {
    const { back } = await roundTrip();
    const ws = back.getWorksheet("요약")!;
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((c) => ws.getCell(3, c).value)).toEqual(["목장", "9/13", "9/20", "9/27", "10/4", "제출", "대상 주", "제출률"]);
    expect([1, 2, 3, 4, 5].map((c) => ws.getCell(4, c).value)).toEqual(["가온 목장", "정시", "휴주", "지각", "작성 중"]);
    expect((ws.getCell("B4").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFD8EBC4");
    expect((ws.getCell("C5").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFEDEDED");
    const f = (a: string) => ws.getCell(a).value as ExcelJS.CellFormulaValue;
    expect(f("F4")).toMatchObject({ formula: 'COUNTIF(B4:E4, "정시")+COUNTIF(B4:E4, "지각")', result: 2 });
    expect(f("G4")).toMatchObject({ formula: 'COUNTA(B4:E4)-COUNTIF(B4:E4, "휴주")', result: 3 });
    expect(f("H4").formula).toBe('IF(G4=0, "", F4/G4)');
    expect(f("H4").result).toBeCloseTo(2 / 3);
    expect(ws.getCell("H4").numFmt).toBe("0%");
    // 제출 목장 줄 — 주차마다
    expect(ws.getCell("A6").value).toBe("제출 목장");
    expect(f("B6")).toMatchObject({ formula: 'COUNTIF(B4:B5, "정시")+COUNTIF(B4:B5, "지각")', result: 2 });
    expect(f("F6")).toMatchObject({ formula: "SUM(F4:F5)", result: 3 });
  });

  it("요약 아래 주차별 출석 — 출석 시트를 COUNTIFS 로 센다", async () => {
    const { back } = await roundTrip();
    const ws = back.getWorksheet("요약")!;
    const row = [...Array(40).keys()].map((i) => i + 1).find((r) => ws.getCell(r, 1).value === "2026-09-13" && r > 6)!;
    const f = (c: number) => ws.getCell(row, c).value as ExcelJS.CellFormulaValue;
    expect(f(2)).toMatchObject({ formula: `COUNTIF('출석'!$B$4:$B$6, A${row})`, result: 3 });
    expect(f(3)).toMatchObject({ formula: `COUNTIFS('출석'!$B$4:$B$6, A${row}, '출석'!$E$4:$E$6, "O")`, result: 2 });
    expect(f(5).result).toBe(1);
  });

  it("출석 · 개인별 · 기도제목 · 특이사항", async () => {
    const { back } = await roundTrip();
    const row = (name: string, r: number, n: number) => [...Array(n).keys()].map((c) => back.getWorksheet(name)!.getCell(r, c + 1).value);

    expect(row("출석", 3, 7)).toEqual(["목장", "주차", "이름", "구분", "예배", "목장 모임", "개별 연락으로 교제"]);
    expect(row("출석", 4, 7)).toEqual(["가온 목장", "2026-09-13", "다리더", "리더", "O", null, null]);
    expect(back.getWorksheet("출석")!.getCell("A4").font.bold).toBe(true);
    expect(back.getWorksheet("출석")!.autoFilter).toBeTruthy();

    const per = back.getWorksheet("개인별")!;
    expect(per.getCell("B4").value).toBe("다리더");
    expect(per.getCell("D4").value).toMatchObject({ formula: "COUNTIFS('출석'!$A$4:$A$6, A4, '출석'!$C$4:$C$6, B4)", result: 1 });
    expect((per.getCell("H4").value as ExcelJS.CellFormulaValue).result).toBe(1);

    expect(row("기도제목", 4, 4)).toEqual(["가온 목장", "2026-09-13", "가청년", "가족의 건강"]);
    expect(back.getWorksheet("기도제목")!.getCell("A5").value).toBeNull();
    expect(row("특이사항", 4, 5)).toEqual(["가온 목장", "2026-09-13", "정시", "2026-09-14 20:13", "MT 다녀옴"]);
    expect((back.getWorksheet("특이사항")!.getCell("C4").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFD8EBC4");
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

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

describe("고르는 화면", () => {
  const groups = [
    { id: G1, name: "가온" },
    { id: G2, name: "나래" },
  ];
  const link = (id: string) => container.querySelector<HTMLAnchorElement>(`[data-testid="${id}"]`)!;

  it("아무것도 미리 골라 두지 않는다 — 두 버튼이 잠겨 있다 ★", async () => {
    await render(<ExportForm groups={groups} thisWeek={THIS} weekOptions={[THIS, "2026-09-27"]} />);
    for (const id of ["xlsx", "pdf"]) {
      expect(link(id).getAttribute("aria-disabled")).toBe("true");
      expect(link(id).getAttribute("href")).toBeNull();
    }
    expect(container.querySelector('[data-testid="why"]')?.textContent).toContain("기간");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].some((c) => c.checked)).toBe(false);
  });

  it("최근 4주 + 전체 목장 → groups=all, 개별 목장 → id 목록", async () => {
    await render(<ExportForm groups={groups} thisWeek={THIS} weekOptions={[THIS]} />);
    const radio = [...container.querySelectorAll("button")].find((b) => b.textContent === "최근 4주")!;
    await act(async () => radio.click());
    expect(container.querySelector('[data-testid="why"]')?.textContent).toContain("목장");

    const nare = container.querySelector<HTMLInputElement>('input[aria-label="나래 목장"]')!;
    await act(async () => nare.click());
    expect(link("xlsx").getAttribute("href")).toBe(`/export/xlsx?from=2026-09-13&to=2026-10-04&groups=${G2}`);

    const all = [...container.querySelectorAll("label")].find((l) => l.textContent?.trim() === "전체 목장")!.querySelector("input")!;
    await act(async () => all.click());
    expect(link("pdf").getAttribute("href")).toBe("/export/pdf?from=2026-09-13&to=2026-10-04&groups=all");
    expect(link("pdf").textContent).toBe("PDF 받기");
    expect(nare.disabled).toBe(true);
  });
});

describe("명단 엑셀 받기 (2026-10-28)", () => {
  const groups = [
    { id: G1, name: "가온" },
    { id: G2, name: "나래" },
  ];
  const link = (id: string) => container.querySelector<HTMLAnchorElement>(`[data-testid="${id}"]`);

  it("리더 — 우리 목장 명단만, 전체 명단은 없다 ★", async () => {
    await render(<RosterExport canAll={false} ownGroup={G1} groups={[groups[0]]} />);
    expect(link("roster-all")).toBeNull();
    expect(link("roster-group")!.getAttribute("href")).toBe(`/export/roster?group=${G1}`);
    expect(link("roster-group")!.textContent).toContain("가온 목장 명단");
  });

  it("운영자 겸 리더 — 전체 명단 + 우리 목장 명단", async () => {
    await render(<RosterExport canAll ownGroup={G1} groups={[groups[0]]} />);
    expect(link("roster-all")!.getAttribute("href")).toBe("/export/roster");
    expect(link("roster-group")!.getAttribute("href")).toBe(`/export/roster?group=${G1}`);
  });

  it("목사님 — 전체 명단, 목장 명단은 목장을 골라야 열린다", async () => {
    await render(<RosterExport canAll ownGroup={null} groups={groups} />);
    expect(link("roster-all")!.getAttribute("href")).toBe("/export/roster");
    expect(link("roster-group")!.getAttribute("aria-disabled")).toBe("true");
    expect(link("roster-group")!.getAttribute("href")).toBeNull();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="목장"]')!;
    await act(async () => {
      select.value = G2;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(link("roster-group")!.getAttribute("href")).toBe(`/export/roster?group=${G2}`);
  });
});

describe("받기 단추 — 휴대폰은 곧바로 공유 시트 (2026-10-29)", () => {
  const nav = navigator as Navigator & { canShare?: unknown; share?: unknown };
  let shared: File[][];
  let shareImpl: () => Promise<void>;

  beforeEach(() => {
    shared = [];
    shareImpl = async () => {};
    Object.defineProperty(nav, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(nav, "share", {
      configurable: true,
      value: (data: { files: File[] }) => {
        shared.push(data.files);
        return shareImpl();
      },
    });
    globalThis.fetch = (async () =>
      new Response(new Blob(["%PDF-1.3"]), {
        headers: { "content-disposition": `attachment; filename="a.pdf"; filename*=UTF-8''${encodeURIComponent("목장보고서.pdf")}` },
      })) as typeof fetch;
  });
  afterEach(() => {
    Reflect.deleteProperty(nav, "canShare");
    Reflect.deleteProperty(nav, "share");
  });

  const tap = async () => {
    await act(async () => container.querySelector<HTMLAnchorElement>('[data-testid="pdf"]')!.click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  };

  it("한 번 누르면 받아서 바로 공유 시트를 연다 — 두 번째 단추가 없다 ★", async () => {
    await render(
      <DownloadLink href="/export/pdf?x=1" type={PDF_TYPE} className="b" testId="pdf">
        PDF 받기
      </DownloadLink>,
    );
    await tap();
    expect(shared).toHaveLength(1);
    expect(shared[0][0].name).toBe("목장보고서.pdf");
    expect(shared[0][0].type).toBe(PDF_TYPE);
    expect(container.querySelector('[data-testid="pdf-share"]')).toBeNull();
    expect(container.textContent).toBe("PDF 받기");
  });

  it("손길이 식어 공유가 막히면 '파일 저장 · 보내기' 를 한 번 더 보인다", async () => {
    shareImpl = async () => {
      throw new DOMException("no gesture", "NotAllowedError");
    };
    await render(
      <DownloadLink href="/export/pdf?x=1" type={PDF_TYPE} className="b" testId="pdf">
        PDF 받기
      </DownloadLink>,
    );
    await tap();
    const again = container.querySelector<HTMLButtonElement>('[data-testid="pdf-share"]')!;
    expect(again.textContent).toBe("파일 저장 · 보내기");
    shareImpl = async () => {};
    await act(async () => again.click());
    expect(shared).toHaveLength(2);
    expect(container.querySelector('[data-testid="pdf-share"]')).toBeNull();
  });

  it("공유 시트를 닫아도(취소) 단추가 남지 않는다", async () => {
    shareImpl = async () => {
      throw new DOMException("cancel", "AbortError");
    };
    await render(
      <DownloadLink href="/export/pdf?x=1" type={PDF_TYPE} className="b" testId="pdf">
        PDF 받기
      </DownloadLink>,
    );
    await tap();
    expect(shared).toHaveLength(1);
    expect(container.querySelector('[data-testid="pdf-share"]')).toBeNull();
  });
});
