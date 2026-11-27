import { lastSeenLine, summarizeBlindSpots, type BlindSpotRow } from "@/lib/blind-spots";
import { CARE_STATUS_LABELS } from "@/lib/labels";
import { addDays, formatWeekLabel } from "@/lib/week";

/**
 * 구구 챗봇의 답 — 앱이 기록에서 직접 쓴다(2026-11-17, AI 동의 없이 쓰게). AI 는 질문을 알아듣고 도구만 고른다 —
 * 도구가 읽은 기록(이름 · 출석 · 기도제목)은 AI 로 가지 않고, 여기서 만든 글이 바로 화면에 나간다.
 * 해석 · 요약 문장은 만들지 않는다 — 기록에 있는 것을 모아 늘어놓는다. 순수 함수라 서버 없이 시험한다(tests/ui/chat-answer.test.tsx).
 * 꼴(2026-11-17 사용자) — '-' 로 늘어놓지 않는다. 사람마다 한 덩어리(첫 줄 이름 · 출석, 다음 줄 기도제목), 덩어리 사이는 빈 줄.
 * 꼴(2026-11-18 저녁, 사용자 — 아래 2026-11-17 · 11-18 의 '목록 기호 · 콜론 금지' 를 바꿨다) — 답에 가운뎃점(·)을 쓰지 않는다.
 *   묶음은 '가온 목장:' 처럼 콜론으로 끝나는 제목 줄, 빈 줄, 그 아래 '* ' 로 시작하는 줄. 한 줄 안의 여럿은 ' / ' 나 쉼표로 잇는다.
 *   사람마다 한 줄('* 이름: 내용'), 기도제목은 그 아래 줄에 두 칸 들여서.
 * 꼴(2026-11-18 사용자, 지금도 그대로인 것) — 비율은 퍼센트 대신 횟수 · 사람 순서는 보고서 화면처럼 목자 · 목동 · 양(같은 역할 안은 이름순) ·
 *   보이는 목장이 하나뿐이면(리더) 사람마다 목장 이름을 붙이지 않고 여럿이면(목사님) 붙인다 · '휴주' 대신 '쉬는 주'.
 *   묶음은 제목 줄(몇 명 · 몇 곳) + 이름 줄. 해석 · 평가 문장은 넣지 않는다 — 세기 · 묶기 · 순서 바꾸기만.
 * 기도제목 · 특이사항은 부르는 쪽이 미리 다듬어 넘긴다(ㅎㅎ 지우기 · 맞춤법 · 띄어쓰기 · '~도록' · ' / ' — lib/spell).
 */

export type AnswerPerson = { id: string; name: string; group_id: string | null; group_role: string; is_group_head?: boolean | null; care_status: string; status: string };
export type AnswerGroup = { id: string; name: string };
export type AnswerRecord = {
  person_id: string | null;
  week_key: string | null;
  worship_attended: boolean | null;
  worship_online: boolean | null;
  group_meeting_attended: boolean | null;
  one_on_one_contacted: boolean | null;
  prayer_request: string | null;
  group_id_at_write?: string | null;
};

const careText = (c: string) => CARE_STATUS_LABELS[c as keyof typeof CARE_STATUS_LABELS] ?? c;
const worshipText = (r: AnswerRecord) => (r.worship_attended ? (r.worship_online ? "온라인 예배" : "현장 예배") : "예배 결석");
/** 보고서 화면과 같은 순서 — 목자 · 목동 · 양, 같은 역할 안은 이름순 */
const rank = (p: Pick<AnswerPerson, "group_role" | "is_group_head">) => (p.group_role === "leader" ? (p.is_group_head ? 0 : 1) : 2);
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const inOrder = (a: AnswerPerson, b: AnswerPerson) => rank(a) - rank(b) || byName(a.name, b.name);
/** 이름 뒤 판정 태그 — 재적이 아닐 때만 */
const tagged = (p: AnswerPerson) => (p.care_status !== "active" ? `${p.name}(${careText(p.care_status)})` : p.name);

/** 사람 명단 — 목장마다 '가온 목장 5명:' 아래 목자 · 목동 · 양 한 줄씩. 재적이 아니면 이름 뒤 괄호에 판정 태그 */
export function answerPeople(people: AnswerPerson[], groups: AnswerGroup[]): string {
  if (people.length === 0) return "볼 수 있는 사람이 없어요.";
  const out: string[] = [];
  for (const g of groups) {
    const list = people.filter((p) => p.group_id === g.id).sort(inOrder);
    if (list.length === 0) continue;
    if (out.length) out.push("");
    out.push(`${g.name} 목장 ${list.length}명:`, "");
    const heads = list.filter((p) => rank(p) === 0);
    const subs = list.filter((p) => rank(p) === 1);
    const sheep = list.filter((p) => rank(p) === 2);
    if (heads.length) out.push(`* 목자: ${heads.map(tagged).join(" / ")}`);
    if (subs.length) out.push(`* 목동: ${subs.map(tagged).join(" / ")}`);
    if (sheep.length) out.push(`* 양 ${sheep.length}명: ${sheep.map(tagged).join(" / ")}`);
  }
  return out.join("\n");
}

/** 한 사람의 최근 기록 — 횟수 한 줄 + 주마다 한 줄(최근 주부터, 기도제목은 그 아래 줄). 그 주에 개별 연락이 있었으면 줄 끝에 */
export function answerPerson(person: AnswerPerson, records: AnswerRecord[], weeks: string[], skipped: Set<string>): string {
  const byWeek = new Map(records.flatMap((r) => (r.week_key ? [[r.week_key, r] as const] : [])));
  const known = weeks.filter((w) => !skipped.has(w) && byWeek.has(w)).map((w) => byWeek.get(w)!);
  const here = known.filter((r) => r.worship_attended).length;
  const online = known.filter((r) => r.worship_attended && r.worship_online).length;
  const meeting = known.filter((r) => r.group_meeting_attended).length;
  const contact = known.filter((r) => r.one_on_one_contacted).length;
  // 기록이 한 주도 없으면 여기서 끝낸다 — 주마다 '기록 없음' 을 늘어놓지 않는다(2026-11-18)
  if (known.length === 0) return `${person.name} 최근 ${weeks.length}주 기록이 없어요.`;
  const lines = [
    `${person.name} 최근 ${weeks.length}주:`,
    "",
    `* 기록 ${known.length}주 중 예배 ${here}번${online ? `(온라인 ${online}번)` : ""}, 목장 모임 ${meeting}번, 개별 연락 ${contact}번`,
    "",
    "주마다:",
    "",
  ];
  for (const w of weeks) {
    const label = formatWeekLabel(w);
    if (skipped.has(w)) lines.push(`* ${label}: 쉬는 주`);
    else {
      const r = byWeek.get(w);
      if (!r) lines.push(`* ${label}: 기록 없음`);
      else {
        lines.push(`* ${label}: ${worshipText(r)}, ${r.group_meeting_attended ? "목장 참석" : "목장 불참"}${r.one_on_one_contacted ? ", 개별 연락" : ""}`);
        if (r.prayer_request?.trim()) lines.push(`  ${r.prayer_request.trim()}`);
      }
    }
  }
  return lines.join("\n");
}

/** 한 목장의 한 주 목장보고서 — 사람은 목자 · 목동 · 양 순(personOf 가 역할을 준다), 사람마다 한 줄(기도제목은 그 아래 줄) */
export function answerGroupWeek(input: {
  group: AnswerGroup;
  week: string;
  report: { note: string | null; submitted_at: string | null; is_late: boolean | null; no_meeting: boolean | null } | null;
  records: AnswerRecord[];
  personOf: (id: string) => AnswerPerson | null;
}): string {
  const { group, week, report } = input;
  const head = `${formatWeekLabel(week)} ${group.name} 목장보고서`;
  if (!report) return `${head}가 아직 없어요.`;
  const state = report.submitted_at ? (report.is_late ? "늦게 냄" : "냄") : "작성 중";
  const noMeeting = Boolean(report.no_meeting);
  const rows = input.records
    .flatMap((r) => {
      const p = r.person_id ? input.personOf(r.person_id) : null;
      return p ? [{ p, r }] : [];
    })
    .sort((a, b) => inOrder(a.p, b.p));
  const here = rows.filter((x) => x.r.worship_attended).length;
  const online = rows.filter((x) => x.r.worship_attended && x.r.worship_online).length;
  const meeting = rows.filter((x) => x.r.group_meeting_attended).length;
  // 목장 모임이 없는 주면 목장 모임 수 · 참석 여부를 쓰지 않는다
  const lines = [
    `${head}(${state}${noMeeting ? ", 목장 모임 없음" : ""}):`,
    "",
    `* ${rows.length}명 중 예배 ${here}명${online ? `(온라인 ${online}명)` : ""}${noMeeting ? "" : `, 목장 모임 ${meeting}명`}`,
  ];
  if (rows.length) lines.push("", "사람마다:", "");
  for (const { p, r } of rows) {
    lines.push(`* ${p.name}: ${worshipText(r)}${noMeeting ? "" : `, ${r.group_meeting_attended ? "목장 참석" : "목장 불참"}`}`);
    if (r.prayer_request?.trim()) lines.push(`  ${r.prayer_request.trim()}`);
  }
  if (report.note?.trim()) lines.push("", "특이사항:", "", `* ${report.note.trim()}`);
  return lines.join("\n");
}

/** 한 주의 목장별 제출 현황 — 묶음마다 제목 줄 + 이름 줄, 안 낸 곳을 먼저 */
export function answerWeekStatus(input: {
  week: string;
  skipped: boolean;
  pastDeadline: boolean;
  groups: AnswerGroup[];
  reports: Map<string, { submitted_at: string | null; is_late: boolean | null; no_meeting: boolean | null }>;
}): string {
  const label = formatWeekLabel(input.week);
  if (input.skipped) return `${label}은 목장보고서를 쉬는 주예요.`;
  const missing = input.groups.filter((g) => !input.reports.get(g.id)?.submitted_at);
  const done = input.groups.filter((g) => input.reports.get(g.id)?.submitted_at);
  const late = done.filter((g) => input.reports.get(g.id)?.is_late);
  const names = (gs: AnswerGroup[]) => gs.map((g) => g.name).join(" / ");
  const lines = [`${label} 목장보고서(${input.pastDeadline ? "마감 지남" : "마감 전"}):`, "", `* ${input.groups.length}곳 중 ${done.length}곳 냄`];
  if (!missing.length) lines.push("* 모든 목장이 냈어요.");
  else lines.push("", `아직 안 낸 목장 ${missing.length}곳:`, "", `* ${names(missing)}`);
  if (late.length) lines.push("", `늦게 낸 목장 ${late.length}곳:`, "", `* ${names(late)}`);
  return lines.join("\n");
}

/** 챙김이 필요한 양 — care_blind_spots 의 한 행에 이름 · 목장 이름을 붙인 것. 판정에 들지 않은 사람의 행도 그대로 넘긴다 */
export type AnswerSpot = { name: string; group: string; row: BlindSpotRow };

/**
 * 챙김이 필요한 양 — 사람마다 한 줄: '* 이름: 태그 (마지막 기록)'. 여러 목장이 보이면 목장마다 '가온 목장:' 아래로 묶는다. 끝에 기준 한 줄.
 * 누가 · 어떤 순서로 뜨는지는 화면과 같다(summarizeBlindSpots, 2026-11-18) — 두 기준이 겹친 사람 · 연속 결석 · 목장 불참 순,
 *   기록을 모으는 중이면 확인이 필요하다고 표시된 사람(needsCheck)을 그 순서로. 목장은 먼저 나온 순서.
 * 두 기준이 겹치면 풀어 쓴다('2주 연속 결석, 4주 목장 불참' — 화면의 blindSpotTag 는 '결석 · 목장 불참'). 기록을 모으는 중이면 마지막 기록이 없다
 */
export function answerBlindSpots(rows: AnswerSpot[], multi: boolean): string {
  const summary = summarizeBlindSpots(rows.map((r) => ({ ...r.row, name: r.name, groupName: r.group || null })));
  const collecting = summary.state === "collecting";
  const listed = collecting ? summary.needsCheck : summary.spots;
  if (listed.length === 0) return "지금 챙김이 필요한 양은 없어요.";
  const line = (p: (typeof listed)[number]) => {
    if (collecting) return `* ${p.name}: 확인 필요(기록 모으는 중)`;
    const last = lastSeenLine(p).replaceAll(" · ", ", ");
    return `* ${p.name}: ${[p.absent_streak ? "2주 연속 결석" : null, p.meeting_gap ? "4주 목장 불참" : null].filter(Boolean).join(", ")}${last ? ` (${last})` : ""}`;
  };
  const lines: string[] = [];
  if (multi) {
    lines.push(`챙김이 필요한 양 ${listed.length}명`);
    for (const g of [...new Set(listed.map((p) => p.groupName ?? ""))]) {
      lines.push("", g ? `${g} 목장:` : "목장 없음:", "", ...listed.filter((p) => (p.groupName ?? "") === g).map(line));
    }
  } else lines.push(`챙김이 필요한 양 ${listed.length}명:`, "", ...listed.map(line));
  lines.push("", "예배를 2주 연속 빠졌거나 4주 동안 목장 모임에 한 번도 오지 않은 분이에요.");
  return lines.join("\n");
}

/** 한 주의 기도제목 모음(목사님이 한 목장을 골랐으면 첫 줄에 그 목장) — 사람마다 '* 이름: 기도제목'. 목장이 여럿이면 목장마다 제목(사람 수) */
export function answerPrayers(
  week: string,
  groups: AnswerGroup[],
  records: AnswerRecord[],
  personOf: (id: string) => AnswerPerson | null,
  groupOf: (r: AnswerRecord) => string | null,
  /** 여러 목장이 보이는 사람이 한 목장을 골라 물었을 때 그 목장 이름(2026-11-18) — 첫 줄에 넣는다 */
  picked?: string | null,
): string {
  const label = formatWeekLabel(week);
  const many = groups.length > 1;
  const lines: string[] = [];
  let total = 0;
  for (const g of groups) {
    const list = records
      .flatMap((r) => {
        const p = r.person_id ? personOf(r.person_id) : null;
        return p && groupOf(r) === g.id && r.prayer_request?.trim() ? [{ p, text: r.prayer_request.trim() }] : [];
      })
      .sort((a, b) => inOrder(a.p, b.p));
    if (list.length === 0) continue;
    total += list.length;
    lines.push("");
    if (many) lines.push(`${g.name} 목장 ${list.length}명:`, "");
    for (const { p, text } of list) lines.push(`* ${p.name}: ${text}`);
  }
  if (!total) return `${label}에 적힌 기도제목이 없어요.`;
  return [`${label}${picked ? ` ${picked} 목장` : ""} 기도제목 ${total}명${many ? "" : ":"}`, ...lines].join("\n");
}

/** 최근 몇 주 결석 — 지금 이어지는 결석(2주 이상, 긴 사람부터)과 그 밖(빠진 횟수)을 나눈다. 첫 줄에 기간 */
export function answerAbsences(input: { weeks: string[]; people: AnswerPerson[]; records: AnswerRecord[]; groupName: (id: string | null) => string; multi: boolean; picked?: string | null }): string {
  const byPerson = new Map<string, Map<string, AnswerRecord>>();
  for (const r of input.records) {
    if (!r.person_id || !r.week_key) continue;
    const m = byPerson.get(r.person_id) ?? new Map();
    m.set(r.week_key, r);
    byPerson.set(r.person_id, m);
  }
  const newest = [...input.weeks].sort().reverse();
  const rows = input.people.flatMap((p) => {
    const m = byPerson.get(p.id);
    if (!m) return [];
    let run = 0;
    for (const w of newest) {
      const r = m.get(w);
      if (!r) continue;
      if (r.worship_attended) break;
      run++;
    }
    const absent = newest.filter((w) => m.get(w) && !m.get(w)!.worship_attended).length;
    return absent > 0 ? [{ p, run, absent }] : [];
  });
  if (rows.length === 0) return `최근 ${input.weeks.length}주 동안 예배에 빠진 사람이 없어요.`;
  rows.sort((a, b) => b.run - a.run || b.absent - a.absent || byName(a.p.name, b.p.name));
  const who = (p: AnswerPerson) => (input.multi && input.groupName(p.group_id) ? `${p.name}(${input.groupName(p.group_id)} 목장)` : p.name);
  const running = rows.filter((x) => x.run >= 2);
  const rest = rows.filter((x) => x.run < 2).sort((a, b) => b.absent - a.absent || byName(a.p.name, b.p.name));
  const lines = [`최근 ${input.weeks.length}주${input.picked ? ` ${input.picked} 목장` : ""} 예배 결석 ${rows.length}명(${formatWeekLabel(newest[newest.length - 1])}~${formatWeekLabel(newest[0])})`];
  if (running.length) lines.push("", `지금 이어지는 결석 ${running.length}명:`, "", ...running.map((x) => `* ${who(x.p)}: ${x.run}주 연속`));
  if (rest.length) lines.push("", `그 밖에 빠진 주가 있는 분 ${rest.length}명:`, "", ...rest.map((x) => `* ${who(x.p)}: ${x.absent}번`));
  return lines.join("\n");
}

/** 한 주의 출석 인원 — 출석 · 결석 한 줄, 현장 · 온라인 한 줄. 여러 목장이 보이는데 기록이 없는 목장이 있으면 한 줄 더 */
export function answerAttendanceCount(week: string, records: AnswerRecord[], scope: string, noRecordGroups: string[] = []): string {
  const on = records.filter((r) => r.worship_attended && !r.worship_online).length;
  const online = records.filter((r) => r.worship_attended && r.worship_online).length;
  const absent = records.filter((r) => !r.worship_attended).length;
  const label = formatWeekLabel(week);
  if (records.length === 0) return `${label} ${scope} 출석 기록이 아직 없어요.`;
  const lines = [`${label} ${scope} 예배:`, "", `* 출석 ${on + online}명, 결석 ${absent}명`, `* 출석 중 현장 ${on}명, 온라인 ${online}명`];
  if (noRecordGroups.length) lines.push(`* 아직 기록이 없는 목장 ${noRecordGroups.length}곳: ${noRecordGroups.join(" / ")}`);
  return lines.join("\n");
}

/** this · last · YYYY-MM-DD → 그 주 주일 */
export function weekFrom(v: unknown, thisWeek: string, isWeekKey: (s: string) => boolean): string {
  if (v === "last") return addDays(thisWeek, -7);
  if (typeof v === "string" && isWeekKey(v)) return v;
  return thisWeek;
}

/** 앱 규칙 질문의 답(2026-11-17) — AI 가 자기 말로 옮기다 틀린 적이 있어('주일 다음 날인 화요일') 정해진 문장으로 */
export const APP_TOPICS = ["deadline", "berries", "streak", "contact", "blind_spot", "attendance", "memo_fill"] as const;
export type AppTopic = (typeof APP_TOPICS)[number];
/** gift — 휴주 선물(2026-11-26, world_rules.skip_gift). 없으면 200 */
export type AppRules = { start: number; onTime: number; late: number; step: number; max: number; coupon: number; perTerm: number; gift?: number };

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

export function answerAppInfo(topic: string, ctx: { thisWeek: string; rules: AppRules }): string {
  const { thisWeek, rules: r } = ctx;
  const tue = addDays(thisWeek, 2);
  switch (topic as AppTopic) {
    case "deadline":
      return [
        `목장보고서는 주일마다 한 주에 하나씩 써요. 마감은 주일이 지나고 화요일 밤 11시 59분까지예요(수요일 0시가 되면 마감).`,
        `이번 주(${md(thisWeek)} 주일) 목장보고서 마감은 ${md(tue)} ${WEEKDAY[2]}요일 밤 11시 59분이에요.`,
        `마감 뒤에도 낼 수는 있지만 늦은 제출이 되어 연속 제출이 끊기고 열매가 ${r.late}개만 쌓여요.`,
      ].join("\n");
    case "berries":
      return [
        `목장 열매는 처음에 ${r.start}개로 시작해요.`,
        `목장보고서를 마감 안에 내면 한 주에 ${r.onTime}개, 마감 뒤에 내면 ${r.late}개가 쌓여요.`,
        `연속으로 내면 보너스가 붙어요 — 2주째 +${r.step}, 3주째 +${r.step * 2}, 그 뒤로는 최대 +${r.max}.`,
        `쉬는 주마다 선물로 ${r.gift ?? 200}개가 더 들어와요.`,
        `열매로 로뎀 월드 상점에서 집, 꾸밈을 사거나 연속 지키기 쿠폰(${r.coupon}개)을 살 수 있어요.`,
      ].join("\n");
    case "streak":
      return [
        `마감 안에 낸 주가 이어지면 연속 제출이 늘어나요. 쉬는 주는 건너뛰고 이어져요.`,
        `쉬는 주는 그 주가 지난 뒤에 늦게 정해져도 쉬는 주로 쳐요 — 끊겼던 연속이 다시 이어지고, 그 주에 쓴 쿠폰은 돌려받아요.`,
        `쉬는 주마다 모든 목장에 선물로 열매 ${r.gift ?? 200}개가 들어와요. 쉬는 주에 목장보고서를 내면 원래 열매도 따로 받아요.`,
        `한 주를 놓쳤으면 연속 지키기 쿠폰(${r.coupon}개)으로 그 주를 지킬 수 있어요 — 학기(3~8월, 9~2월)마다 ${r.perTerm}번까지.`,
      ].join("\n");
    case "contact":
      return [
        `목장보고서에서 사람 이름 옆 '개별 연락으로 교제' 는 그 주에 리더가 그 사람과 따로 연락하거나 만났는지예요(카톡, 전화, 따로 만남 등).`,
        `출석/기도제목 기록 보기에서 개별 연락 횟수로 보여요. 챙김이 필요한 양 판정에는 쓰지 않아요. 본인 칸은 세지 않아요.`,
      ].join("\n");
    case "blind_spot":
      // 기준 v2(2026-10-30) — 연락해도 목록에서 빠지지 않는다(예전 문장은 '켜면 빠진다' 고 잘못 안내했다, 2026-11-18)
      return [
        `챙김이 필요한 양은 이번 주에 한 번 연락해 보면 좋을 분이에요.`,
        `예배를 2주 연속 빠졌거나(쉬는 주는 건너뛰어요) 4주 동안 목장 모임에 한 번도 오지 않은 분이 떠요.`,
        `개별 연락으로 교제한 분도 이 기준에 들면 떠요. 예배를 드린 분도 목장 모임에 4주 동안 오지 않았으면 떠요.`,
        `군 복무, 교환 학생처럼 판정 태그가 붙은 분은 빠져요. 장기 미출석인 분은 남아요.`,
        `예배에 다시 나오면 연속 결석에서, 목장 모임에 나오면 목장 불참에서 빠져요.`,
      ].join("\n");
    case "attendance":
      return [
        `출석부는 전체 메뉴에 있어요. 목장보고서를 내면 그 주 예배 출석이 저절로 들어가요.`,
        `현장 예배, 현장 + 온라인 두 가지로 볼 수 있고, '출석부 엑셀' 로 해마다의 출석부, 회원 명단을 받을 수 있어요.`,
      ].join("\n");
    case "memo_fill":
      return [
        `목장보고서의 '기도제목 붙여넣기' 에 모임 메모를 붙여 넣으면 사람마다 기도제목으로 나눠 줘요.`,
        `줄마다 '• 이름: 기도제목' 으로 적어 주세요(예: '• 가온: 시험 잘 볼 수 있도록'). 카톡에서 복사한 [오후 3:12] 같은 시각은 저절로 지워요.`,
        `넣기 전에 결과를 보여 주니 고른 것만 채우면 돼요.`,
      ].join("\n");
    default:
      return "그 내용은 아직 안내할 수 없어요. 전체 메뉴에서 찾아봐 주세요.";
  }
}
