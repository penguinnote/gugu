import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import { CARD, Chevron, GuguSays, ICON, Icon, Pill, type Tint } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { attendanceLabel, fromFlags, type Attendance } from "@/lib/attendance";
import { requirePastor } from "@/lib/auth/session";
import { GROUP_ROLE_LABELS, groupLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey, formatWeekLabel, isWeekKey } from "@/lib/week";

import { attendanceTotals, loadReportBody } from "../../report-data";

import { NoteBox } from "./note-box";
import { StampBar } from "./stamp-bar";

export const metadata: Metadata = {
  title: "목장보고서 · 구구",
};

// 출석 알약 빛 — 리더 작성 화면(report-form)의 출석 단추와 같은 색
function attTint(a: Attendance): Tint {
  if (a.worship === "absent") return "stone";
  return a.worship === "in_person" && !a.meetingOff ? "sky" : "sun";
}
const MAIN = "mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8"; // 머리(‹) 바로 아래 큰 제목(2026-11-11 B안)

/**
 * P-3 목장 보고서 상세 — 읽기 전용 + 하단 스탬프(하나, 누르면 다음 목장으로) + 이전/다음 목장.
 * '← 이전' 은 남긴다 — 잘못 눌렀을 때 돌아갈 길.
 *
 * **이 화면의 서버 렌더 1회가 곧 읽음이다** (mark_report_read). 목록 렌더·프리페치는 아니다 —
 * 홈의 카드가 prefetch={false} 인 이유. 첫 열람 시각은 DB 가 고정한다.
 *
 * 목사님은 모든 목장의 모든 내용을 본다 — 제한 없음(RLS 가 그렇게 돼 있고 테스트가 확인한다).
 * 편집 컨트롤은 없다. 이전/다음은 그 주에 제출된 목장만 순회한다 — 12개를 목록에 돌아가지
 * 않고 훑기 위해서다.
 *
 * 구구 테마: 사람 하나가 카드 하나 — 이름 · 출석 알약(작성 화면과 같은 색) · 기도제목, 지난 기도제목은 라일락 알약.
 */
export default async function PastorReportPage({ params, searchParams }: PageProps<"/pastor/reports/[group]">) {
  await requirePastor();

  const { group: rawGroup } = await params;
  const groupName = decodeURIComponent(rawGroup);
  const sp = await searchParams;
  const thisWeek = currentWeekKey();
  const requested = typeof sp.week === "string" ? sp.week : undefined;
  const weekKey = requested && isWeekKey(requested) && requested <= thisWeek ? requested : thisWeek;
  if (requested && requested !== weekKey) redirect(`/pastor?week=${weekKey}`);

  const supabase = await createClient();
  const { data: group } = await supabase.from("groups").select("id, number, name").eq("name", groupName).neq("status", "special").maybeSingle();
  if (!group) notFound();

  const { data: report } = await supabase
    .from("reports")
    .select("id, note, submitted_at, is_late")
    .eq("group_id", group.id)
    .eq("week_key", weekKey)
    .maybeSingle();

  // 미제출이면 상세가 없다 — 읽음도 생기지 않는다.
  if (!report || !report.submitted_at) {
    return (
      <>
        <AppHeader back={`/pastor?week=${weekKey}`} />
        <main className={MAIN}>
          <h1 className="gg-display text-[26px] leading-tight">{groupLabel(group.name)}</h1>
          <GuguSays mood="sleepy" size={72} lines={[formatWeekLabel(weekKey), "아직 제출 전이에요."]} />
        </main>
      </>
    );
  }

  // 읽음 · 그 주 명단 · 지난 기도제목 — 넓은 화면 제출 현황(?g=)과 같은 코드(../../report-data)
  const [{ markFailed, persons, rowByPerson, prev, review }, submittedRes, groupsRes] = await Promise.all([
    loadReportBody(supabase, report.id, group.id, weekKey),
    // 이전/다음 — 그 주에 제출된 목장만, 번호 순
    supabase.from("reports").select("group_id").eq("week_key", weekKey).not("submitted_at", "is", null),
    supabase.from("groups").select("id, number, name").eq("status", "active"),
  ]);

  const submittedGroupIds = new Set((submittedRes.data ?? []).map((r) => r.group_id));
  const siblings = sortGroups(groupsRes.data ?? []).filter((g) => submittedGroupIds.has(g.id));
  const idx = siblings.findIndex((s) => s.name === group.name);
  const prevGroup = idx > 0 ? siblings[idx - 1] : null;
  const nextGroup = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const href = (name: string) => `/pastor/reports/${encodeURIComponent(name)}?week=${weekKey}`;

  const { present, contacted } = attendanceTotals(persons, rowByPerson);

  return (
    <>
      <AppHeader back={`/pastor?week=${weekKey}`} />
      <main className={MAIN}>
        <nav className="flex items-center justify-between">
          <span className="gg-pill bg-[var(--gg-stone-soft)] text-[var(--gg-stone-ink)] tabular-nums">
            {idx + 1} / {siblings.length}
          </span>
        </nav>

        <header className="space-y-2">
          <h1 className="gg-display text-[26px] leading-tight">{groupLabel(group.name)}보고서</h1>
          <p className="text-sm text-muted">
            {formatWeekLabel(weekKey)}
            {report.is_late ? " · 지각 제출" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Pill tint="leaf" className="tabular-nums">{`출석 ${present} / ${persons.length}`}</Pill>
            <Pill tint="lilac" className="tabular-nums">{`개별 연락으로 교제 ${contacted}`}</Pill>
          </div>
          {markFailed ? <p className="text-xs text-muted">읽음을 남기지 못했습니다.</p> : null}
        </header>

        <ol className="flex flex-col gap-3.5">
          {persons.map((p) => {
            const r = rowByPerson.get(p.id);
            const att = r ? fromFlags(r.worship_attended ?? false, r.group_meeting_attended ?? false, r.worship_online ?? false) : null;
            const reason = r ? (r.online_reason ?? r.meeting_absent_reason ?? r.absent_reason) : null;
            const pv = prev.get(p.id);
            return (
              <li key={p.id} className={`${CARD} space-y-2.5 p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[17px] font-bold">{p.name}</span>
                    {p.group_role === "leader" ? (
                      <Pill tint="stone" className="!h-6 shrink-0 !px-2 !text-[11px]">
                        {GROUP_ROLE_LABELS.leader}
                      </Pill>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Pill tint={att ? attTint(att) : "stone"} className="!h-6 !px-2 !text-[11.5px]">
                      {att ? attendanceLabel(att) : "미입력"}
                    </Pill>
                    {r?.one_on_one_contacted ? (
                      <Pill tint="lilac" className="!h-6 !px-2 !text-[11.5px]">
                        개별 연락으로 교제
                      </Pill>
                    ) : null}
                  </span>
                </div>
                {reason ? (
                  <p className="text-[13.5px] leading-relaxed text-muted" data-testid="attendance-reason">
                    사유 · {reason}
                  </p>
                ) : null}
                {r?.prayer_request ? <p className="gg-text text-[15px] leading-relaxed">{r.prayer_request}</p> : null}
                {pv ? (
                  <p className="text-xs leading-relaxed text-muted">
                    <span className="gg-pill mr-1.5 !h-5 bg-[var(--gg-lilac-soft)] !px-1.5 !text-[10.5px] text-[var(--gg-lilac-ink)]">
                      {pv.weeksAgo === 1 ? "지난주" : `${pv.weeksAgo}주 전`}
                    </span>
                    <span className="gg-text break-keep">{pv.text}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>

        {report.note ? (
          <section className={`${CARD} space-y-1.5 p-4`}>
            <h2 className="gg-display text-[17px]">특이사항</h2>
            <p className="gg-text text-[15px] leading-relaxed">{report.note}</p>
          </section>
        ) : null}

        <nav className="flex items-center justify-between gap-2">
          {prevGroup ? (
            <Link href={href(prevGroup.name)} replace prefetch={false} className="gg-btn gg-btn-white gg-btn-sm !text-[14px]">
              <Icon d={ICON.back} className="h-4 w-4" strokeWidth={2.4} />
              {groupLabel(prevGroup.name)}
            </Link>
          ) : (
            <span />
          )}
          {nextGroup ? (
            <Link href={href(nextGroup.name)} replace prefetch={false} className="gg-btn gg-btn-white gg-btn-sm !text-[14px]">
              {groupLabel(nextGroup.name)}
              <Chevron className="h-4 w-4" />
            </Link>
          ) : (
            <BackLink href={`/pastor?week=${weekKey}`} className="gg-btn gg-btn-white gg-btn-sm !text-[14px]">
              마지막 · 현황으로
            </BackLink>
          )}
        </nav>

        <NoteBox reportId={report.id} initial={review?.note ?? null} />
        <StampBar
          reportId={report.id}
          initial={review?.stamp ?? null}
          nextHref={nextGroup ? href(nextGroup.name) : `/pastor?week=${weekKey}`}
        />
      </main>
    </>
  );
}
