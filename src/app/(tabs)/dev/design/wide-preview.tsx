import { AppHeader } from "@/components/app-header";
import type { BlindSpotPerson } from "@/lib/blind-spots";
import { benchHref } from "@/lib/pastor-review";
import type { Database } from "@/lib/supabase/database.types";
import { addDays } from "@/lib/week";

import { PersonAdminBody, type PersonAdminData } from "../../admin/people/[id]/person-body";
import { PeopleWide, type WidePerson } from "../../admin/people/people-wide";
import { FeedbackSection } from "../../pastor/feedback";
import type { ReportPerson, ReportRecord } from "../../pastor/report-data";
import { Workbench, type BenchRow, type BenchSelected } from "../../pastor/workbench";

type Stamp = Database["public"]["Enums"]["report_stamp"];

/**
 * 디자인 확인(개발 서버만) — 넓은 화면 배치(2026-11-27). 이름 · 목장은 모두 지어낸 것이다. 저장 단추는 아무것도 쓰지 않는다.
 *   /dev/design?screen=pastor-wide(&g=나래|초록|none) | people-wide(&p=w3 — 오른쪽 편집 칸)
 */
async function fakeStamp(_id: string, stamp: Stamp) {
  "use server";
  return { ok: true as const, stamp };
}
async function fakeNote(_id: string, note: string) {
  "use server";
  return { ok: true as const, note: note.trim() || null };
}

const GROUPS = ["가온", "나래", "다솜", "라온", "마루", "바다", "새봄", "초록", "하람"];

export function PastorWidePreview({ week, g }: { week: string; g: string | null }) {
  const at = (h: number) => `${week}T${String(h).padStart(2, "0")}:12:00.000Z`;
  const rows: BenchRow[] = GROUPS.map((name, i): BenchRow => {
    if (i >= 7) return { name, state: "missing", submittedAt: null, isLate: false, submitter: null, streak: i === 7 ? "3주 연속" : null };
    return { name, state: i % 3 === 2 ? "checked" : "unchecked", submittedAt: at(9 + i), isLate: i === 4, submitter: ["한가람", "윤슬", "이나리", "박다온", "최라희", "정한별", "강새봄"][i], streak: null };
  });
  const persons: ReportPerson[] = [
    { id: "p1", name: "윤슬", group_role: "leader" },
    { id: "p2", name: "이나리", group_role: "leader" },
    { id: "p3", name: "김다온", group_role: "member" },
    { id: "p4", name: "박라희", group_role: "member" },
    { id: "p5", name: "정한별", group_role: "member" },
    { id: "p6", name: "최가람", group_role: "member" },
  ];
  const rec = (id: string, w: boolean, m: boolean, online = false, extra: Partial<ReportRecord> = {}) =>
    ({ person_id: id, worship_attended: w, group_meeting_attended: m, worship_online: online, one_on_one_contacted: false, prayer_request: null, online_reason: null, meeting_absent_reason: null, absent_reason: null, ...extra }) as ReportRecord;
  const rowByPerson = new Map<string, ReportRecord>([
    ["p1", rec("p1", true, true, false, { prayer_request: "새 학기 준비로 바쁜데 마음의 여유를 잃지 않도록" })],
    ["p2", rec("p2", true, true, false, { prayer_request: "가족 모두 건강하게, 이직 준비가 잘 되도록", one_on_one_contacted: true })],
    ["p3", rec("p3", true, false, true, { online_reason: "지방 출장", prayer_request: "출장 중에도 말씀 가까이" })],
    ["p4", rec("p4", false, false, false, { absent_reason: "몸살", one_on_one_contacted: true })],
    ["p5", rec("p5", true, true, false, { prayer_request: "졸업 논문 마무리" })],
    ["p6", rec("p6", true, false, false, { meeting_absent_reason: "아르바이트" })],
  ]);
  const prev = new Map([
    ["p1", { text: "시험 기간 체력 지키기", weeksAgo: 1 }],
    ["p3", { text: "취업 준비 방향 잡기", weeksAgo: 1 }],
    ["p5", { text: "논문 주제 정하기", weeksAgo: 2 }],
  ]);
  const pick = g === "none" ? null : (g ?? "나래");
  const row = rows.find((r) => r.name === pick);
  const selected: BenchSelected = !row
    ? { kind: "none" }
    : row.state === "missing"
      ? { kind: "missing", name: row.name }
      : {
          kind: "report",
          name: row.name,
          reportId: `r-${row.name}`,
          submittedAt: row.submittedAt!,
          isLate: row.isLate,
          submitter: row.submitter,
          note: "이번 주는 새 친구가 처음 와서 분위기가 밝았어요.",
          markFailed: false,
          persons,
          rowByPerson,
          prev,
          review: row.state === "checked" ? { stamp: "pray", note: "다들 수고 많았어요!" } : { stamp: null, note: null },
        };
  const care = [
    { person_id: "p4", name: "박라희", groupName: pick, absent_streak: true, meeting_gap: true, last_worship_week: addDays(week, -21), last_meeting_week: addDays(week, -35) },
  ] as unknown as BlindSpotPerson[];
  const fb = (i: number, name: string, w: number, note?: string) => ({ report_id: `f${i}`, week_key: addDays(week, -7 * w), group_name: name, note });
  return (
    <>
      <AppHeader back="/" wide />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:grid lg:max-w-[1200px] lg:grid-cols-2 lg:content-start lg:items-start lg:px-8">
        <Workbench
          basePath="/dev/design?screen=pastor-wide"
          weekKey={week}
          thisWeek={week}
          now={new Date(`${week}T15:00:00.000Z`)}
          weekNav={<span className="gg-pill bg-[var(--gg-stone-soft)] text-[var(--gg-stone-ink)]">이번 주</span>}
          gugu
          skipped={null}
          rows={rows}
          tiles={{ submitted: 7, total: 9, remaining: "마감까지 3시간", late: 1, checked: 2, unchecked: 5, care: 4, careRange: "11월 1일 ~ 11월 22일" }}
          selected={selected}
          care={pick ? care : null}
          reviewActions={{ stamp: fakeStamp, note: fakeNote }}
        />
        <FeedbackSection
          className="hidden lg:order-4 lg:col-span-2 lg:block"
          hrefFor={(r) => benchHref("/dev/design?screen=pastor-wide", r.week_key, week, r.group_name)}
          pending={{ rows: [fb(1, "가온", 0), fb(2, "나래", 0), fb(3, "초록", 1)], total: 3, moreHref: null }}
          done={{ rows: [fb(4, "다솜", 0, "기도하겠습니다")], total: 1, moreHref: null }}
        />
      </main>
    </>
  );
}

/** 운영자 명단 넓은 표 — 지어낸 사람. 오른쪽 편집 칸의 저장은 로그인이 없으면 서버에서 막힌다(운영자만) */
export function PeopleWidePreview({ p }: { p: string | null }) {
  const groups = GROUPS.slice(0, 4).map((name, i) => ({ id: `g${i}`, name, number: i + 1 }));
  const names = ["한가람", "윤슬", "이나리", "박다온", "최라희", "정한별", "강새봄", "조하람", "임채원", "서은호", "문가은", "배도윤"];
  const people: WidePerson[] = names.map((name, i) => ({
    id: `w${i}`,
    name,
    group_id: `g${i % 4}`,
    group_role: i < 8 && i % 2 === 0 ? "leader" : "member",
    is_group_head: i < 4,
    status: i === 11 ? "left" : i === 10 ? "dormant" : "active",
    care_status: i === 7 ? "military" : "active",
    needs_check: false,
    user_id: i % 3 === 0 ? `u${i}` : null,
    birth_year: 1996 + (i % 8),
    is_officer: i === 3,
    training_stage: ["목자", "제자반", "새가족반", null][i % 4],
    gender: i % 2 === 0 ? "male" : "female",
    campus: i % 3 === 1 ? "한빛대" : null,
  }));
  const pick = people.find((x) => x.id === p) ?? null;
  const data: PersonAdminData | null = pick
    ? {
        person: { ...pick, updated_at: "2026-11-20T00:00:00.000Z", ai_consented_at: null },
        groups,
        groupName: groups.find((g) => g.id === pick.group_id)?.name,
        linked: pick.user_id ? { name: pick.name, providerLabel: "카카오", roleLabel: "리더" } : null,
        officer: !!pick.is_officer,
      }
    : null;
  return (
    <>
      <AppHeader back="/" wide />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:max-w-[1200px] lg:px-8">
        <PeopleWide people={people} groups={groups} selectedId={pick ? pick.id : null} panel={data ? <PersonAdminBody data={data} wide /> : null} basePath="/dev/design?screen=people-wide" />
      </main>
    </>
  );
}
