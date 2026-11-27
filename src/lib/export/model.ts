import { sortGroups } from "../group-order";

/**
 * 내보내기 내용 (Step 10) — Excel 과 인쇄 화면이 같은 모양에서 그린다. 순수 계산이라 테스트가 고정 데이터로 본다.
 *
 * 주차 하나의 상태는 다섯 중 하나: 정시 · 지각 · 작성 중(행은 있는데 제출 전) · 미제출(행 없음) · 휴주.
 * 제출률 = (정시 + 지각) / 휴주를 뺀 주 수 — 03 §2 North Star 와 같은 정의(지각 포함).
 * 사람 줄은 기록이 있는 사람만 — 그 주 그 목장에서 쓰인 기록(group_id_at_write)이다. 리더 → 청년, 이름순.
 */

export type ExportStatus = "on_time" | "late" | "draft" | "missing" | "skipped";

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  on_time: "정시",
  late: "지각",
  draft: "작성 중",
  missing: "미제출",
  skipped: "휴주",
};

export type ExportGroup = { id: string; name: string; number: number };
export type ExportReport = { id: string; group_id: string; week_key: string; submitted_at: string | null; is_late: boolean; note: string | null };
export type ExportRecord = {
  report_id: string;
  person_id: string;
  week_key: string;
  worship_attended: boolean;
  group_meeting_attended: boolean;
  one_on_one_contacted: boolean;
  prayer_request: string | null;
  /** 2026-10-30 — 옛 기록 · 테스트 픽스처에는 없을 수 있다 */
  worship_online?: boolean | null;
  online_reason?: string | null;
  meeting_absent_reason?: string | null;
  absent_reason?: string | null;
};
export type ExportPerson = { id: string; name: string; group_role: "leader" | "member" };

export type PersonLine = {
  name: string;
  role: "leader" | "member";
  worship: boolean;
  /** 온라인 예배 — worship 도 참이다 */
  online: boolean;
  meeting: boolean;
  contact: boolean;
  prayer: string | null;
  /** 온라인 · 목장 불참 · 결석 사유 중 적힌 것 */
  reason: string | null;
};
export type WeekCell = { weekKey: string; status: ExportStatus; submittedAt: string | null; note: string | null; lines: PersonLine[] };
export type GroupBlock = { group: ExportGroup; cells: WeekCell[]; submitted: number; expected: number; rate: number | null };
export type WeekTotal = { weekKey: string; worship: number; meeting: number; contact: number; people: number };

export type ExportModel = { weeks: string[]; groups: GroupBlock[]; totals: WeekTotal[] };

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function buildExportModel(input: {
  weeks: string[];
  groups: ExportGroup[];
  reports: ExportReport[];
  records: ExportRecord[];
  persons: ExportPerson[];
  skippedWeeks: string[];
}): ExportModel {
  const skipped = new Set(input.skippedWeeks);
  const personById = new Map(input.persons.map((p) => [p.id, p]));
  const reportByKey = new Map(input.reports.map((r) => [`${r.group_id}|${r.week_key}`, r]));
  const recordsByReport = new Map<string, ExportRecord[]>();
  for (const rec of input.records) {
    const list = recordsByReport.get(rec.report_id) ?? [];
    list.push(rec);
    recordsByReport.set(rec.report_id, list);
  }

  // 목장은 가나다 순(2026-11-17, lib/group-order) — 파일이라 내 목장을 올리지 않는다
  const groups = sortGroups(input.groups);
  const blocks: GroupBlock[] = groups.map((group) => {
    const cells: WeekCell[] = input.weeks.map((weekKey) => {
      const report = reportByKey.get(`${group.id}|${weekKey}`);
      const status: ExportStatus = skipped.has(weekKey)
        ? "skipped"
        : !report
          ? "missing"
          : report.submitted_at
            ? report.is_late
              ? "late"
              : "on_time"
            : "draft";
      const lines: PersonLine[] = (report ? recordsByReport.get(report.id) ?? [] : [])
        .map((rec) => {
          const p = personById.get(rec.person_id);
          return {
            name: p?.name ?? "(명단에 없음)",
            role: p?.group_role ?? "member",
            worship: rec.worship_attended,
            online: !!rec.worship_online,
            meeting: rec.group_meeting_attended,
            contact: rec.one_on_one_contacted,
            prayer: rec.prayer_request?.trim() || null,
            reason: (rec.online_reason ?? rec.meeting_absent_reason ?? rec.absent_reason)?.trim() || null,
          };
        })
        .sort((a, b) => (a.role === b.role ? byName(a, b) : a.role === "leader" ? -1 : 1));
      return { weekKey, status, submittedAt: report?.submitted_at ?? null, note: report?.note?.trim() || null, lines };
    });
    const expected = cells.filter((c) => c.status !== "skipped").length;
    const submitted = cells.filter((c) => c.status === "on_time" || c.status === "late").length;
    return { group, cells, submitted, expected, rate: expected === 0 ? null : submitted / expected };
  });

  const totals: WeekTotal[] = input.weeks.map((weekKey, i) => {
    const lines = blocks.flatMap((b) => b.cells[i].lines);
    return {
      weekKey,
      worship: lines.filter((l) => l.worship).length,
      meeting: lines.filter((l) => l.meeting).length,
      contact: lines.filter((l) => l.contact).length,
      people: lines.length,
    };
  });

  return { weeks: input.weeks, groups: blocks, totals };
}

/** "대외비 · 2026-10-06 다운로드 · 이름" — Excel 1행과 인쇄 화면 모든 페이지 하단(02 §3.3). */
export function watermarkText(today: string, name: string): string {
  return `대외비 · ${today} 다운로드 · ${name}`;
}

/** "10/4" — 표 머리글용 짧은 주차. */
export function shortWeek(weekKey: string): string {
  const [, m, d] = weekKey.split("-").map(Number);
  return `${m}/${d}`;
}

/** ISO → "2026-10-05 20:13" (KST). Intl 을 쓰지 않는다(06 §4.5). */
export function kstDateTime(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
