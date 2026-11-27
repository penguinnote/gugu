// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildExportModel } from "@/lib/export/model";
import { buildReportPdf } from "@/lib/export/pdf";

/**
 * PDF 내보내기(2026-10-29, 인쇄용 화면 대신) — 노드 환경에서 만든다(jsdom 에서는 압축 스트림이 깨진 파일이 나온다).
 *   · 첫 장 요약 + 목장마다 새 페이지
 *   · 한글 글꼴(Pretendard)이 쓰는 글자만 들어간다 — 파일이 작다
 *   · 모든 페이지 아래 대외비 표기와 쪽 번호(내용 스트림이 압축돼 있어 페이지마다 그리는 객체 수로 본다)
 * 이름은 모두 지어낸 것이다.
 */

function model() {
  const weeks = ["2026-09-27", "2026-10-04"];
  return buildExportModel({
    weeks,
    groups: [
      { id: "g2", name: "나래", number: 2 },
      { id: "g1", name: "가온", number: 1 },
    ],
    reports: [
      { id: "r1", group_id: "g1", week_key: "2026-09-27", submitted_at: "2026-09-27T11:00:00Z", is_late: false, note: "MT 다녀옴" },
      { id: "r2", group_id: "g2", week_key: "2026-10-04", submitted_at: null, is_late: false, note: null },
    ],
    records: [
      { report_id: "r1", person_id: "p1", week_key: "2026-09-27", worship_attended: true, group_meeting_attended: true, one_on_one_contacted: false, prayer_request: "가족의 건강" },
    ],
    persons: [{ id: "p1", name: "가청년", group_role: "member" }],
    skippedWeeks: [],
  });
}

describe("PDF 파일", () => {
  it("요약 한 장 + 목장마다 새 페이지, 한글 글꼴은 쓰는 글자만 ★", async () => {
    const buf = await buildReportPdf(model(), { watermark: "대외비 · 2026-10-06 다운로드 · 임찬양", rangeText: "2주" });
    const text = buf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
    expect(text).toMatch(/\+Pretendard-Regular/);
    expect(text).toMatch(/\+Pretendard-Bold/);
    expect(buf.length).toBeLessThan(200_000);
  }, 30_000);
});
