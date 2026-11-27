import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PersonFlowCard } from "@/components/ai/person-flow-card";
import { PersonSummaryCard } from "@/components/person-summary";
import { PersonTimeline, type TimelineGap } from "@/components/person-timeline";
import { CARD, ICON, Icon, Pill, SectionHead } from "@/components/ui";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { requireReportAccess } from "@/lib/auth/session";
import { isBlindSpot, lastSeenLine, type BlindSpotRow } from "@/lib/blind-spots";
import { groupLabel } from "@/lib/labels";
import { buildPersonSummary } from "@/lib/person-summary";
import { judgmentText, type TimelineRecord } from "@/lib/person-timeline";
import { canEditGroup } from "@/lib/roster-edit";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekKey, formatWeekDate, isPastDeadline, kstToday, weekdayOf } from "@/lib/week";

import { summarizeFlowAction } from "./flow-action";

export const metadata: Metadata = {
  title: "출석/기도제목 기록 · 구구",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMELINE_WEEKS = 26; // 6개월 (02 L-4a)

/**
 * L-4a / P-4a 사람 상세 — 사각지대 목록에서 들어온다.
 *
 * 같은 화면이지만 보이는 범위가 다르다(02 §4). 리더는 지금 자기 목장 사람만 열 수 있고(아니면 404),
 * 그 목장에서 쓰인 기록만 보인다. 목사님은 전체 — 다른 목장에서 쓰인 기록에는 목장 이름이 붙는다.
 * 기록 범위는 RLS 가 정한다(weekly_records_visible, tests/rls/person-detail.test.mjs). 사람 행은 화면이 한 번 더
 * 거른다 — 운영자 겸 리더는 persons 를 전부 읽기 때문이다.
 * 운영자(명단 밖)는 404 — 본문을 못 보는 원칙.
 *
 * 맨 위는 판정 요약(care_blind_spots 의 그 사람 행 — 전체 기록으로 센 사실만), 그 아래 한눈에 보기(AI 없이 모은 정리, 2026-11-16),
 * AI 흐름 요약(동의한 사람만), 6개월 타임라인.
 * 구구 테마 — 판정은 옅은 하늘빛 칸(붉은색 · 경고 없이 사실만), 타임라인은 카드 한 장.
 */
export default async function PersonPage({ params }: PageProps<"/groups/people/[id]">) {
  const me = await requireReportAccess();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("persons")
    .select("id, name, group_id, group_role, is_group_head, care_status, needs_check, status, joined_at, ai_excluded")
    .eq("id", id)
    .maybeSingle();
  if (!person || !person.group_id) notFound();
  // 리더는 지금 자기 목장 사람만. RLS 만으로는 부족하다 — 운영자 겸 리더는 명단 관리 때문에 persons 를
  // 전부 읽는다(2026-10-03 프리뷰에서 다른 목장 사람이 열렸다). 기록은 RLS 가 막지만 이름·목장도 내지 않는다.
  if (me.role !== "pastor" && person.group_id !== me.groupId) notFound();

  const thisWeek = currentWeekKey();
  const fromWeek = addDays(thisWeek, -7 * (TIMELINE_WEEKS - 1));
  const [recordsRes, spotsRes, skippedRes, moveRes] = await Promise.all([
    supabase
      .from("weekly_records_visible")
      .select("id, week_key, worship_attended, group_meeting_attended, one_on_one_contacted, prayer_request, author_id, group_id_at_write, worship_online, online_reason, meeting_absent_reason, absent_reason")
      .eq("person_id", id)
      .gte("week_key", addDays(thisWeek, -7 * (TIMELINE_WEEKS - 1)))
      .order("week_key", { ascending: false }),
    supabase.rpc("care_blind_spots", { p_week_key: thisWeek }),
    supabase.from("skipped_weeks").select("week_key").gte("week_key", fromWeek).lte("week_key", thisWeek),
    // 이동 이력(2026-11-26) — 가장 최근에 옮겨 온 것 한 줄(지금 목장 리더 · 목사님이 읽는다)
    supabase
      .from("group_moves")
      .select("from_group_id, decided_at")
      .eq("person_id", id)
      .eq("to_group_id", person.group_id)
      .eq("status", "accepted")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const moved = moveRes.data as { from_group_id: string; decided_at: string | null } | null;
  const raw = recordsRes.data ?? [];

  // 작성 리더 이름 · 기록이 쓰인 목장 이름. 둘 다 RLS 범위 안에서만 나온다.
  const authorIds = [...new Set(raw.map((r) => r.author_id).filter((v): v is string => !!v))];
  const groupIds = [...new Set([person.group_id, ...(moved ? [moved.from_group_id] : []), ...raw.map((r) => r.group_id_at_write).filter((v): v is string => !!v)])];
  const [authorsRes, groupsRes] = await Promise.all([
    authorIds.length > 0
      ? supabase.from("persons").select("user_id, name").in("user_id", authorIds)
      : Promise.resolve({ data: [] as { user_id: string | null; name: string }[] }),
    supabase.from("groups").select("id, name").in("id", groupIds),
  ]);
  const authorName = new Map((authorsRes.data ?? []).map((a) => [a.user_id, a.name]));
  const groupName = new Map((groupsRes.data ?? []).map((g) => [g.id, g.name]));

  const records: TimelineRecord[] = raw.map((r) => ({
    id: r.id ?? `${r.week_key}`,
    week_key: r.week_key ?? "",
    worship_attended: r.worship_attended ?? false,
    group_meeting_attended: r.group_meeting_attended ?? false,
    one_on_one_contacted: r.one_on_one_contacted ?? false,
    prayer_request: r.prayer_request ?? null,
    worship_online: r.worship_online ?? false,
    reason: r.online_reason ?? r.meeting_absent_reason ?? r.absent_reason ?? null,
    authorName: (r.author_id && authorName.get(r.author_id)) || null,
    otherGroupName: r.group_id_at_write && r.group_id_at_write !== person.group_id ? groupName.get(r.group_id_at_write) ?? null : null,
  }));

  const spot = ((spotsRes.data ?? []) as BlindSpotRow[]).find((s) => s.person_id === id) ?? null;
  const judgment = person.status === "active" ? judgmentText(spot, person.care_status) : null;
  const isPastor = me.role === "pastor";
  const back = isPastor ? "/" : "/groups";

  // 기록이 없는 주도 보인다(2026-11-06) — 빠지면 6개월에 세 줄이어도 쭉 이어진 것처럼 보였다. 들어온 주부터, 마감이 지난 주까지
  const recorded = new Set(records.map((r) => r.week_key));
  const skippedSet = new Set((skippedRes.data ?? []).map((s) => s.week_key));
  const joinedWeek = person.joined_at ? addDays(person.joined_at, -weekdayOf(person.joined_at)) : fromWeek;
  const gaps: TimelineGap[] = [];
  // 떠났거나 활동 중이 아니면 마지막 기록까지만 — 그 뒤 '기록 없음' 이 줄줄이 쌓이지 않게(2026-11-06)
  const lastRecord = records.map((r) => r.week_key).sort().at(-1) ?? fromWeek;
  const upTo = person.status === "active" ? (isPastDeadline(thisWeek) ? thisWeek : addDays(thisWeek, -7)) : lastRecord;
  for (let w = upTo; w >= fromWeek && w >= joinedWeek; w = addDays(w, -7)) {
    if (!recorded.has(w)) gaps.push({ week_key: w, skipped: skippedSet.has(w) });
  }

  // 한눈에 보기(2026-11-16) — AI 없이 모은 정리. 띠는 기록 없는 주까지 그린 그 범위(upTo)로
  const summary = buildPersonSummary({
    upTo,
    joinedWeek: person.joined_at ? joinedWeek : null,
    skipped: skippedSet,
    records: raw.map((r) => ({
      week_key: r.week_key ?? "",
      worship_attended: r.worship_attended ?? false,
      worship_online: r.worship_online ?? false,
      group_meeting_attended: r.group_meeting_attended ?? false,
      one_on_one_contacted: r.one_on_one_contacted ?? false,
      prayer_request: r.prayer_request ?? null,
      online_reason: r.online_reason ?? null,
      meeting_absent_reason: r.meeting_absent_reason ?? null,
      absent_reason: r.absent_reason ?? null,
    })),
  });

  return (
    <>
      <AppHeader back={back} />
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8">

        <header className="space-y-2.5">
          <div className="space-y-0.5">
            <h1 className="gg-display flex flex-wrap items-center gap-x-2 text-[26px] leading-tight">
              {person.name}
              {person.group_role === "leader" ? (
                <Pill tint="sky" className="font-[family-name:var(--font-sans)]">
                  {person.is_group_head ? "목자" : "목동"}
                </Pill>
              ) : null}
            </h1>
            <p className="text-sm text-muted">{groupLabel(groupName.get(person.group_id))}</p>
            {moved?.decided_at ? (
              <p className="text-[13px] text-muted" data-testid="move-history">
                {formatWeekDate(kstToday(new Date(moved.decided_at)))} {groupLabel(groupName.get(moved.from_group_id))}에서 옮겨 옴
              </p>
            ) : null}
          </div>
          {judgment ? (
            <p className="rounded-2xl bg-[var(--gg-sky-soft)] px-3.5 py-3 text-[14.5px] leading-relaxed font-semibold text-[var(--gg-sky-ink)]" data-testid="judgment">
              {judgment}
            </p>
          ) : null}
          {spot && isBlindSpot(spot) ? <p className="px-1 text-xs text-muted">{lastSeenLine(spot)}</p> : null}
          {person.status !== "left" && canEditGroup(me, person.group_id) ? (
            <Link href={`/groups/members/${person.id}`} className="inline-flex w-fit items-center gap-1 px-1 text-[13px] font-bold text-[var(--gg-sky-ink)]" data-testid="edit-roster">
              <Icon d={ICON.write} className="h-4 w-4" strokeWidth={2.2} />
              명단 정보 고치기
            </Link>
          ) : null}
        </header>

        {records.length > 0 ? <PersonSummaryCard summary={summary} /> : null}

        {/* 사람별 흐름 요약(2026-11-12) — 구구 AI 가 켜져 있고 AI 에서 뺀 사람이 아닐 때만 */}
        {guguAiEnabled() && !person.ai_excluded && person.status !== "opted_out" && records.length > 0 ? (
          <PersonFlowCard personId={person.id} action={summarizeFlowAction} />
        ) : null}

        <section className={`${CARD} space-y-3 p-4`} aria-labelledby="timeline-title">
          <SectionHead
            id="timeline-title"
            icon={ICON.history}
            tint="sky"
            title="최근 6개월 기록"
          />
          <PersonTimeline records={records} gaps={gaps} />
        </section>
      </main>
    </>
  );
}
