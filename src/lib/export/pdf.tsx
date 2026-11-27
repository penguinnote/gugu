import path from "node:path";

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { groupLabel } from "@/lib/labels";
import { formatWeekLabel } from "@/lib/week";

import { EXPORT_STATUS_LABELS, formatRate, kstDateTime, shortWeek, type ExportModel, type ExportStatus, type WeekCell } from "./model";

/**
 * PDF 내보내기(2026-10-29) — 인쇄용 화면 대신 서버에서 PDF 파일을 바로 만든다(휴대폰은 받자마자 공유 시트).
 * 내용은 인쇄용 화면과 같다: 첫 장에 목장 × 주차 요약, 그다음 목장마다 새 페이지에서 주차 → 사람(예배 · 목장 · 컨택 · 기도제목) → 특이사항.
 * **모든 페이지 아래**에 대외비 표기와 쪽 번호(02 §3.3). 글꼴은 Pretendard(OFL, fonts/ 에 라이선스) — 쓰는 글자만 파일에 들어간다.
 * 글꼴 파일은 next.config 의 outputFileTracingIncludes 로 이 경로의 함수에 같이 실린다.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/export/fonts");
Font.register({
  family: "Pretendard",
  fonts: [
    { src: path.join(FONT_DIR, "Pretendard-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Pretendard-Bold.ttf"), fontWeight: 700 },
  ],
});
// 한글은 띄어쓰기에서만 줄을 바꾼다 — 기본 하이픈 규칙은 영어용이라 글자 사이에 '-' 를 넣는다
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1f2a37";
const MUTED = "#6b7280";
const LINE = "#d9dee5";
const BLUE = "#4f81bd";
const GREEN = "#ebf1de";
const RED = "#b42318";

const STATUS_COLOR: Record<ExportStatus, [string, string]> = {
  on_time: ["#d8ebc4", "#3b5e14"],
  late: ["#fff2cc", "#7f6000"],
  draft: ["#fde9d9", "#974706"],
  missing: ["#f2dcdb", "#953734"],
  skipped: ["#ededed", "#7f7f7f"],
};

const s = StyleSheet.create({
  page: { fontFamily: "Pretendard", fontSize: 9.5, color: INK, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36 },
  title: { fontSize: 18, fontWeight: 700 },
  sub: { fontSize: 10, color: MUTED, marginTop: 8 },
  mark: { fontSize: 8.5, color: RED, fontWeight: 700, marginTop: 6 },
  section: { fontSize: 12, fontWeight: 700, color: "#1f497d", marginTop: 18, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1.2, borderBottomColor: "#1f497d" },
  table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: LINE },
  tr: { flexDirection: "row" },
  th: { backgroundColor: BLUE, color: "#ffffff", fontWeight: 700, paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE, textAlign: "center" },
  td: { paddingVertical: 3.5, paddingHorizontal: 4, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE },
  center: { textAlign: "center" },
  groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", backgroundColor: "#eef3fa", borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10 },
  groupName: { fontSize: 15, fontWeight: 700 },
  week: { marginTop: 10 },
  weekHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  weekTitle: { fontSize: 11, fontWeight: 700 },
  pill: { fontSize: 8.5, fontWeight: 700, paddingVertical: 1.5, paddingHorizontal: 6, borderRadius: 8 },
  note: { marginTop: 5, padding: 6, backgroundColor: "#f7f9fc", borderRadius: 3 },
  empty: { color: MUTED, fontSize: 9 },
  // 줄 간격은 페이지에 걸지 않고 칸마다 — 페이지에 lineHeight 가 있으면 고정 표기(아래 대외비)가 그려지지 않는다(react-pdf 4.9)
  footer: { position: "absolute", left: 36, right: 36, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5 },
});

function Pill({ status, extra }: { status: ExportStatus; extra?: string }) {
  const [bg, fg] = STATUS_COLOR[status];
  return (
    <Text style={[s.pill, { backgroundColor: bg, color: fg }]}>
      {EXPORT_STATUS_LABELS[status]}
      {extra ? ` · ${extra}` : ""}
    </Text>
  );
}

/** 첫 장 요약 — 목장 × 주차 상태와 제출률. 주가 많으면 줄을 나눈다(한 표에 최대 13주) */
function Summary({ model }: { model: ExportModel }) {
  const chunks: number[][] = [];
  for (let i = 0; i < model.weeks.length; i += 13) chunks.push(model.weeks.slice(i, i + 13).map((_, j) => i + j));
  return (
    <>
      {chunks.map((idx, k) => (
        <View key={k} style={[s.table, { marginBottom: 8 }]} wrap={false}>
          <View style={s.tr}>
            <Text style={[s.th, { width: 70 }]}>목장</Text>
            {idx.map((i) => (
              <Text key={i} style={[s.th, { flex: 1 }]}>
                {shortWeek(model.weeks[i])}
              </Text>
            ))}
            {k === chunks.length - 1 ? <Text style={[s.th, { width: 58 }]}>제출률</Text> : null}
          </View>
          {model.groups.map((b, gi) => (
            <View key={b.group.id} style={[s.tr, { backgroundColor: gi % 2 === 0 ? GREEN : "#ffffff" }]}>
              <Text style={[s.td, { width: 70, fontWeight: 700 }]}>{groupLabel(b.group.name)}</Text>
              {idx.map((i) => {
                const [bg, fg] = STATUS_COLOR[b.cells[i].status];
                return (
                  <Text key={i} style={[s.td, s.center, { flex: 1, backgroundColor: bg, color: fg, fontWeight: 700, fontSize: 8.5 }]}>
                    {EXPORT_STATUS_LABELS[b.cells[i].status]}
                  </Text>
                );
              })}
              {k === chunks.length - 1 ? (
                <Text style={[s.td, s.center, { width: 58, fontWeight: 700 }]}>
                  {b.submitted}/{b.expected} · {formatRate(b.rate)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function Totals({ model }: { model: ExportModel }) {
  const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>
        {["주차", "기록 인원", "예배", "목장 모임", "개별 연락으로 교제"].map((h, i) => (
          <Text key={h} style={[s.th, { flex: i === 0 ? 1.6 : i === 4 ? 1.4 : 1 }]}>
            {h}
          </Text>
        ))}
      </View>
      {model.totals.map((t, i) => (
        <View key={t.weekKey} style={[s.tr, { backgroundColor: i % 2 === 0 ? GREEN : "#ffffff" }]} wrap={false}>
          <Text style={[s.td, { flex: 1.6, fontWeight: 700 }]}>{formatWeekLabel(t.weekKey)}</Text>
          <Text style={[s.td, s.center, { flex: 1 }]}>{t.people}</Text>
          <Text style={[s.td, s.center, { flex: 1 }]}>
            {t.worship} ({pct(t.worship, t.people)})
          </Text>
          <Text style={[s.td, s.center, { flex: 1 }]}>
            {t.meeting} ({pct(t.meeting, t.people)})
          </Text>
          <Text style={[s.td, s.center, { flex: 1.4 }]}>
            {t.contact} ({pct(t.contact, t.people)})
          </Text>
        </View>
      ))}
    </View>
  );
}

const W = { name: 78, mark: 34, contact: 74 };

/**
 * 주차 한 블록이 한 장에 들어가나 — 대강 잰다(줄 13pt, 기도제목 한 줄에 60자쯤). 들어가면 블록을 자르지 않고 통째로 다음 장에 둔다
 * (제목만 장 끝에 남지 않게). 한 장보다 길면 잘리게 두고, 표 머리글이 다음 장에 다시 나온다.
 */
function fitsOnePage(c: WeekCell): boolean {
  const lines = c.lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.prayer?.length ?? 0) / 60)), 0);
  const note = c.note ? Math.ceil(c.note.length / 90) + 1 : 0;
  return 60 + (lines + note) * 13 + c.lines.length * 8 < 560;
}

export function ReportPdf({ model, watermark, rangeText }: { model: ExportModel; watermark: string; rangeText: string }) {
  const footer = (
    <View style={s.footer} fixed>
      <Text style={{ color: RED, fontWeight: 700 }}>
        {watermark} · {rangeText}
      </Text>
      <Text style={{ color: MUTED }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title="목장보고서" author="구구" creator="구구" producer="구구">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>로뎀나무교회 청년대학부 목장보고서</Text>
        <Text style={s.sub}>{rangeText}</Text>
        <Text style={s.mark}>{watermark}</Text>
        <Text style={s.section}>목장별 제출</Text>
        <Summary model={model} />
        <Text style={s.section} minPresenceAhead={60}>
          주차별 출석
        </Text>
        <Totals model={model} />
        {footer}
      </Page>

      {model.groups.map((b) => (
        <Page key={b.group.id} size="A4" style={s.page}>
          <View style={s.groupHead}>
            <Text style={s.groupName}>{groupLabel(b.group.name)}</Text>
            <Text style={{ color: MUTED, fontWeight: 700 }}>
              제출 {b.submitted}/{b.expected} · {formatRate(b.rate)}
            </Text>
          </View>
          {b.cells.map((c) => (
            <View key={c.weekKey} style={s.week} wrap={!fitsOnePage(c)}>
              <View style={s.weekHead}>
                <Text style={s.weekTitle}>{formatWeekLabel(c.weekKey)}</Text>
                <Pill status={c.status} extra={c.submittedAt ? kstDateTime(c.submittedAt) : undefined} />
              </View>
              {c.lines.length > 0 ? (
                <View style={s.table}>
                  {/* 표가 다음 장으로 넘어가면 머리글이 다시 나온다 */}
                  <View style={s.tr} fixed>
                    <Text style={[s.th, { width: W.name }]}>이름</Text>
                    <Text style={[s.th, { width: W.mark }]}>예배</Text>
                    <Text style={[s.th, { width: W.mark }]}>목장</Text>
                    <Text style={[s.th, { width: W.contact }]}>개별 연락으로 교제</Text>
                    <Text style={[s.th, { flex: 1, textAlign: "left" }]}>기도제목</Text>
                  </View>
                  {c.lines.map((l, i) => (
                    <View key={`${l.name}-${i}`} style={[s.tr, { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f7f9fc" }]} wrap={false}>
                      <Text style={[s.td, { width: W.name, fontWeight: 700 }]}>
                        {l.name}
                        {l.role === "leader" ? <Text style={{ color: MUTED, fontWeight: 400, fontSize: 8 }}> 리더</Text> : null}
                      </Text>
                      <Text style={[s.td, s.center, { width: W.mark }]}>{l.online ? "온라인" : l.worship ? "○" : ""}</Text>
                      <Text style={[s.td, s.center, { width: W.mark }]}>{l.meeting ? "○" : ""}</Text>
                      <Text style={[s.td, s.center, { width: W.contact }]}>{l.contact ? "○" : ""}</Text>
                      <Text style={[s.td, { flex: 1 }]}>
                        {l.prayer ?? ""}
                        {l.reason ? <Text style={{ color: MUTED }}>{`${l.prayer ? "\n" : ""}사유 · ${l.reason}`}</Text> : null}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={s.empty}>{c.status === "skipped" ? "휴주" : "기록 없음"}</Text>
              )}
              {c.note ? (
                <View style={s.note} wrap={false}>
                  <Text>
                    <Text style={{ fontWeight: 700 }}>특이사항 </Text>
                    {c.note}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
          {footer}
        </Page>
      ))}
    </Document>
  );
}

export async function buildReportPdf(model: ExportModel, opts: { watermark: string; rangeText: string }): Promise<Buffer> {
  return renderToBuffer(<ReportPdf model={model} watermark={opts.watermark} rangeText={opts.rangeText} />);
}
