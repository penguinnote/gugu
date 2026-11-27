import Link from "next/link";
import { redirect } from "next/navigation";

import { AiDigestSection } from "@/components/ai-digest";
import { AnchorEmpty } from "@/components/anchor-empty";
import { AppHeader } from "@/components/app-header";
import { AbsenceStreakSection } from "@/components/absence-streaks";
import { BlindSpotSection } from "@/components/blind-spots";
import { GroupNotesSection, PrayerFlowSection } from "@/components/pastor-digest";
import { CARD_LIST, CARD_ROW, IconCard } from "@/components/toss";
import { BTN, CARD, Chevron, GuguSays, ICON, Icon } from "@/components/ui";
import { sortGroups } from "@/lib/group-order";
import { readDigest, showDigest, type ShownDigest } from "@/lib/ai/digest";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { requirePastor } from "@/lib/auth/session";
import { loadAbsenceStreaks } from "@/lib/absence-streaks-data";
import { loadBlindSpots } from "@/lib/blind-spots-data";
import { loadBlindSpotChange, loadGroupNotes, loadPrayerFlow } from "@/lib/pastor-digest-data";
import { REPORT_STAMP_LABELS, groupLabel, streakShort, type StreakInfo } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { benchHref } from "@/lib/pastor-review";
import { shortWeek } from "@/lib/blind-spots";
import { FEEDBACK_PAGE, FeedbackSection, type FeedbackRow } from "./feedback";
import { loadReportBody } from "./report-data";
import { WideFold } from "./wide-fold";
import { Workbench, type BenchRow, type BenchSelected } from "./workbench";
import { WeekPicker } from "./week-picker";
import { addDays, currentWeekKey, formatRemaining, formatWeekLabel, isWeekKey, formatKstWhen } from "@/lib/week";


/**
 * P-1 목사님 홈 — 이번 주 제출 현황, 그 아래 돌봄 사각지대(지난주보다 달라진 수) · 기도제목 · 특이사항 · 관계 밀도.
 * 기도제목 · 특이사항 · 사각지대 변화는 주간 정리 v1(2026-11-05) — 수요일 아침 알림이 이 화면을 연다.
 * AI 정리(v2, 2026-11-07)는 켜져 있을 때만(DIGEST_AI_ENABLED · Production) 제출 현황 아래에. 'AI 정리 만들기' 단추로만 만든다
 * (2026-11-08 — 마감 전에도, 제출된 보고서가 있으면). 위에 아직 안 연 보고서 수,
 * 만든 뒤 새로 내거나 고친 보고서가 있으면 다시 만들기(2026-11-08).
 *
 * 첫 화면은 제출 현황이다. 미제출 목장에 연락하는 것이 첫 행동이므로 미제출이 위에,
 * 제출한 목장보다 눈에 띄게 — 단 붉은 경고가 아니라 사실 진술이면 충분하다("미제출").
 * 제출한 목장은 카드로, 아직 안 연 것과 연 것이 구분되는 정도만. "안 읽은 것" 을 압박으로
 * 강조하지 않는다.
 *
 * 카드는 prefetch={false} 다 — 목록에서 카드를 스쳐 지나간 것은 읽음이 아니다. 읽음은 상세의
 * 서버 렌더에서만 기록된다.
 *
 * 구구 테마(2026-10-12): 숫자 카드에 제출 막대, 미제출 · 제출됨이 카드 하나씩. 미제출은 해빛 알약(경고색 아님),
 * 안 본 목장은 굵은 글씨 + 하늘 알약, 본 목장은 옅게. 휴주 · 전원 제출이면 구구가 한마디.
 */
/** 목사님 제출 현황 본체. `/`(홈)와 `/pastor` 두 자리에서 같은 것을 그린다. */
export async function PastorHomeScreen({
  searchParams,
  basePath,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  basePath: "/" | "/pastor";
}) {
  await requirePastor();

  const params = await searchParams;
  const thisWeek = currentWeekKey();
  const requested = typeof params.week === "string" ? params.week : undefined;
  const weekKey = requested && isWeekKey(requested) && requested <= thisWeek ? requested : thisWeek;
  if (requested && requested !== weekKey) redirect(basePath);

  // 한마디 안 남긴 보고서(2026-11-26) — ?more= 로 더 불러온다
  // 목장 보고서 피드백 현황(2026-11-26) — 미확인 ?more= · 확인됨 ?done= 으로 더 불러온다
  const pageN = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Math.min(Number(v), 200) : FEEDBACK_PAGE);
  const moreN = pageN(params.more);
  const doneN = pageN(params.done);
  const supabase = await createClient();
  const [groupsRes, reportsRes, skippedRes, streaksRes, blindSpots, absences, unstampedRes, stampedRes] = await Promise.all([
    supabase.from("groups").select("id, number, name").eq("status", "active"),
    supabase.from("reports").select("id, group_id, submitted_at, is_late, updated_at, submitted_by").eq("week_key", weekKey),
    supabase.from("skipped_weeks").select("week_key, reason").eq("week_key", weekKey).maybeSingle(),
    // 목장별 연속 제출 — 순위가 아니라 카드 안의 한 조각. "3주 연속 · 미제출" 이면 누구에게 먼저 연락할지가 그 줄에 있다.
    supabase.rpc("group_streaks", { p_week_key: weekKey }),
    // 돌봄 사각지대(03 §3.1) — 제출 현황 아래. 이 주의 마감이 지났으면 이 주까지, 아니면 지난주까지 4주.
    loadBlindSpots(weekKey),
    // 연속 결석(2026-11-17) — 컨택과 상관없이 2주 이상 연속 결석. 사각지대 아래
    loadAbsenceStreaks(weekKey).catch(() => null),
    supabase.rpc("unstamped_reports", { p_limit: moreN, p_offset: 0 }),
    // 확인됨 — 한마디(도장)를 남긴 보고서, 최근에 남긴 것부터
    supabase
      .from("report_reviews")
      .select("report_id, stamp, stamped_at, reports!inner(week_key, submitted_at, groups(name))", { count: "exact" })
      .not("stamp", "is", null)
      .order("stamped_at", { ascending: false })
      .range(0, doneN - 1),
    // 관계 밀도(03 §3.3)는 2026-11-11 화면에서 뺐다(사용자 요청) — DB 함수 care_density 는 남아 있다.
    // 성별 통계(03 §3.4)는 2026-10-23 화면에서 뺐다(사용자 요청) — DB 함수 care_gender_balance 는 남아 있다.
  ]);
  // 주간 정리 v1(2026-11-05) — 사각지대 변화(지난주 판정과 견줌) · 기도제목 · 특이사항. 휴주면 기도제목 · 특이사항은 없다
  const [blindSpotChange, prayerFlow, notes] = await Promise.all([
    loadBlindSpotChange(blindSpots),
    skippedRes.data ? null : loadPrayerFlow(weekKey),
    skippedRes.data ? [] : loadGroupNotes(weekKey, groupsRes.data ?? []),
  ]);
  // AI 정리(2026-11-07) — 저장된 것이 있으면 그리고, 없으면 만들기 단추. 꺼져 있거나 제출된 보고서가 없으면 칸이 없다
  const ai = skippedRes.data ? ({ state: "off" } as const) : await readDigest(supabase, weekKey);
  const aiShown: ShownDigest | null = ai.state === "ready" ? await showDigest(supabase, weekKey, ai.digest, ai.meta) : null;
  const aiCanMake = ai.state === "available" || ai.state === "failed" || ai.state === "pending";
  type StreakRow = Database["public"]["Functions"]["group_streaks"]["Returns"][number];
  const streakByGroup = new Map<string, StreakInfo>(
    ((streaksRes.data ?? []) as StreakRow[]).map((r) => [
      r.group_id ?? "",
      { streak: r.streak ?? 0, currentIncluded: r.current_included ?? false, everOnTime: r.ever_on_time ?? false, broken: r.broken ?? false },
    ]),
  );
  const streakPrefix = (gid: string) => {
    const t = streakShort(streakByGroup.get(gid));
    return t ? `${t} · ` : "";
  };
  // 목장은 가나다 순(2026-11-17)
  const groups = sortGroups(groupsRes.data ?? []);
  const reports = reportsRes.data ?? [];
  const reportIds = reports.map((r) => r.id);
  // 넓은 화면 작업대(2026-11-27) — 고른 목장(?g=)이 있으면 그 보고서를 연다(읽음 · 그 주 명단 · 지난 기도제목, 휴대폰 상세와 같은 코드).
  // 휴대폰 목록은 ?g= 를 만들지 않는다 — 목록을 그리는 것만으로 읽음이 남지 않게
  const picked = typeof params.g === "string" ? (groups.find((g) => g.name === params.g) ?? null) : null;
  const pickedReport = picked ? reports.find((r) => r.group_id === picked.id && r.submitted_at) : undefined;
  const submitterIds = [...new Set(reports.map((r) => r.submitted_by).filter((id): id is string => !!id))];
  const [reviewsRes, body, submittersRes] = await Promise.all([
    supabase.from("report_reviews").select("report_id, first_read_at, last_read_at, stamp").in("report_id", reportIds),
    picked && pickedReport ? loadReportBody(supabase, pickedReport.id, picked.id, weekKey) : Promise.resolve(null),
    // 낸 사람(넓은 화면 목록) — 계정과 연결된 명단 이름
    submitterIds.length ? supabase.from("persons").select("user_id, name").in("user_id", submitterIds) : Promise.resolve({ data: [] as { user_id: string | null; name: string }[] }),
  ]);
  type Review = { report_id: string; first_read_at: string; last_read_at: string; stamp: Database["public"]["Enums"]["report_stamp"] | null };
  const reviewByReport = new Map<string, Review>((reviewsRes.data ?? []).map((r) => [r.report_id, r as Review]));
  const reportByGroup = new Map(reports.map((r) => [r.group_id, r]));

  const now = new Date();
  const submitted = groups.filter((g) => reportByGroup.get(g.id)?.submitted_at);
  const missing = groups.filter((g) => !reportByGroup.get(g.id)?.submitted_at);
  const lateCount = submitted.filter((g) => reportByGroup.get(g.id)?.is_late).length;
  const readCount = submitted.filter((g) => {
    const r = reportByGroup.get(g.id)!;
    const v = reviewByReport.get(r.id);
    return !!v && r.updated_at <= v.last_read_at;
  }).length;
  // AI 정리 위 '아직 열지 않은 보고서' · 만든 뒤 새로 내거나 고친 보고서(다시 만들기, 2026-11-08)
  const unread = submitted.length - readCount;
  const generatedAt = ai.state === "ready" ? ai.meta.generatedAt : null;
  const fresh = generatedAt ? submitted.filter((g) => reportByGroup.get(g.id)!.updated_at > generatedAt).length : 0;
  const remaining = formatRemaining(weekKey, now);
  // 빈 칸으로 바로 왔을 때 지난주 같은 칸으로(2026-11-13)
  const weekWord = weekKey === thisWeek ? "이번 주는" : "이 주는";
  const prevAnchor = (anchor: string) => `${basePath}?week=${addDays(weekKey, -7)}#${anchor}`;
  type UnstampedRow = { report_id: string; week_key: string; group_name: string; is_late: boolean; total: number };
  type StampedRow = { report_id: string; stamp: Database["public"]["Enums"]["report_stamp"]; reports: { week_key: string; groups: { name: string } | null } | null };
  const unstamped = (unstampedRes.data ?? []) as UnstampedRow[];
  const stamped = ((stampedRes.data ?? []) as unknown as StampedRow[]).filter((r) => r.reports?.groups);
  const pendingTotal = unstamped[0]?.total ?? 0;
  const doneTotal = stampedRes.count ?? stamped.length;
  const feedbackHref = (more: number, done: number) => {
    const q = [weekKey === thisWeek ? null : `week=${weekKey}`, more !== FEEDBACK_PAGE ? `more=${more}` : null, done !== FEEDBACK_PAGE ? `done=${done}` : null].filter(Boolean);
    return q.length ? `${basePath}?${q.join("&")}` : basePath;
  };
  const pendingRows: FeedbackRow[] = unstamped.map((r) => ({ report_id: r.report_id, week_key: r.week_key, group_name: r.group_name, is_late: r.is_late }));
  const doneRows: FeedbackRow[] = stamped.map((r) => ({ report_id: r.report_id, week_key: r.reports!.week_key, group_name: r.reports!.groups!.name, note: REPORT_STAMP_LABELS[r.stamp] }));
  const pct = groups.length > 0 ? Math.round((submitted.length / groups.length) * 100) : 0;

  // 넓은 화면 작업대 — 목장마다 미확인(도장 없음) · 확인됨 · 미제출
  const submitterName = new Map(((submittersRes.data ?? []) as { user_id: string | null; name: string }[]).map((p) => [p.user_id ?? "", p.name]));
  const benchRows: BenchRow[] = groups.map((g) => {
    const r = reportByGroup.get(g.id);
    if (!r?.submitted_at) return { name: g.name, state: "missing", submittedAt: null, isLate: false, submitter: null, streak: streakShort(streakByGroup.get(g.id)) };
    return {
      name: g.name,
      state: reviewByReport.get(r.id)?.stamp ? "checked" : "unchecked",
      submittedAt: r.submitted_at,
      isLate: r.is_late,
      submitter: r.submitted_by ? (submitterName.get(r.submitted_by) ?? null) : null,
      streak: null,
    };
  });
  const benchSelected: BenchSelected =
    picked && pickedReport?.submitted_at && body
      ? {
          kind: "report",
          name: picked.name,
          reportId: pickedReport.id,
          submittedAt: pickedReport.submitted_at,
          isLate: pickedReport.is_late,
          submitter: pickedReport.submitted_by ? (submitterName.get(pickedReport.submitted_by) ?? null) : null,
          note: notes.find((n) => n.groupName === picked.name)?.note ?? null,
          ...body,
        }
      : picked
        ? { kind: "missing", name: picked.name }
        : { kind: "none" };
  const checkedCount = benchRows.filter((r) => r.state === "checked").length;
  const judged = blindSpots?.state === "judged" && blindSpots.judged > 0 ? blindSpots : null;
  const careRange = judged?.windowStart && judged.windowEnd ? `${shortWeek(judged.windowStart)} ~ ${shortWeek(judged.windowEnd)}` : "최근 4주";
  const benchCare = judged && picked ? judged.spots.filter((p) => p.groupName === picked.name) : null;
  const toBench = (r: FeedbackRow) => benchHref(basePath, r.week_key, thisWeek, r.group_name);

  return (
    <>
      <AppHeader back="/" wide />
      {/* 1024px 이상은 넓은 배치(작업대, ./workbench) — 같은 데이터, CSS 로만 바꿔 보인다. 휴대폰 배치만 있는 칸은 lg:hidden */}
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:grid lg:max-w-[1200px] lg:grid-cols-2 lg:content-start lg:items-start lg:px-8">
        <FeedbackSection
          className="lg:hidden"
          pending={{ rows: pendingRows, total: pendingTotal, moreHref: pendingTotal > unstamped.length ? feedbackHref(moreN + FEEDBACK_PAGE, doneN) : null }}
          done={{ rows: doneRows, total: doneTotal, moreHref: doneTotal > stamped.length ? feedbackHref(moreN, doneN + FEEDBACK_PAGE) : null }}
        />
        <WeekNav weekKey={weekKey} thisWeek={thisWeek} basePath={basePath} className="lg:hidden" />

        <header className="space-y-3 lg:hidden">
          <h1 className="gg-display text-[26px] leading-tight">{formatWeekLabel(weekKey)} 목장보고서</h1>
          {skippedRes.data ? (
            <GuguSays mood="sleepy" size={72} lines={["이번 주는 휴주예요.", ...(skippedRes.data.reason ? [skippedRes.data.reason] : [])]} />
          ) : (
            <div className={`${CARD} space-y-2.5 p-4`}>
              <p className="gg-display text-[19px] leading-snug tabular-nums">
                {groups.length}목장 중 <span className="text-[var(--gg-leaf-ink)]">{submitted.length}개 제출</span> · {missing.length}곳 미제출
              </p>
              <div className="gg-progress" aria-hidden>
                <span style={{ width: `${Math.max(pct, submitted.length > 0 ? 8 : 0)}%` }} />
              </div>
              <p className="text-[13px] text-muted">
                {remaining}
                {remaining === "마감 지남" && lateCount > 0 ? ` · 지각 ${lateCount}` : ""}
                {submitted.length > 0 ? ` · 확인함 ${readCount} / ${submitted.length}` : ""}
              </p>
            </div>
          )}
        </header>

        {skippedRes.data ? null : (
          <div className="contents lg:hidden">
            {missing.length > 0 ? (
              <IconCard icon="/icons/tossface/u23F3.svg" title="미제출" aside={`${missing.length}곳`}>
                <ul className={CARD_LIST}>
                  {missing.map((g) => (
                    <li key={g.id} className={CARD_ROW}>
                      <span className="text-[15px] font-bold">{groupLabel(g.name)}</span>
                      <span className="text-[12.5px] font-semibold text-[var(--gg-sun-ink)]">{streakPrefix(g.id)}미제출</span>
                    </li>
                  ))}
                </ul>
              </IconCard>
            ) : (
              <GuguSays mood="sparkle" size={72} lines={["전 목장이 제출했어요!"]} />
            )}

            <IconCard icon="/icons/tossface/u2705.svg" title="제출됨" aside={submitted.length > 0 ? `${submitted.length}곳` : undefined}>
              {submitted.length === 0 ? (
                <p className="text-[14px] text-[var(--gg-hint)]">아직 제출한 목장이 없습니다.</p>
              ) : (
                <ul className={CARD_LIST}>
                  {submitted.map((g) => {
                    const report = reportByGroup.get(g.id)!;
                    const seen = reviewByReport.get(report.id);
                    // 마지막으로 읽은 뒤 리더가 고쳤으면 '고침' — 안 본 것처럼 다시 표시한다(2026-11-06)
                    const edited = !!seen && report.updated_at > seen.last_read_at;
                    const review = edited ? undefined : seen;
                    return (
                      <li key={g.id}>
                        <Link
                          href={`/pastor/reports/${encodeURIComponent(g.name)}?week=${weekKey}`}
                          prefetch={false}
                          className={CARD_ROW}
                        >
                          <span className="flex shrink-0 items-center gap-2">
                            {review ? (
                              <Icon d={ICON.check} className="h-4 w-4 shrink-0 text-[var(--gg-leaf-ink)]" strokeWidth={2.8} />
                            ) : (
                              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[var(--gg-sky)]" />
                            )}
                            <span className={review ? "text-[15px] text-muted" : "text-[15px] font-bold"}>
                              {groupLabel(g.name)}
                              {report.is_late ? <span className="ml-1.5 text-xs font-normal text-muted">지각</span> : null}
                            </span>
                          </span>
                          <span className="flex min-w-0 items-center justify-end gap-1">
                            {review ? (
                              <span className="text-right text-xs text-muted">
                                {streakPrefix(g.id)}
                                {`확인함 · ${formatKstWhen(review.first_read_at, now)}${review.stamp ? ` · ${REPORT_STAMP_LABELS[review.stamp]}` : ""}`}
                              </span>
                            ) : (
                              <span className="text-right text-xs font-semibold text-[var(--gg-sky-ink)]" data-testid={edited ? "report-edited" : undefined}>
                                {streakPrefix(g.id)}
                                {edited ? "확인 뒤 고침" : "아직 안 봄"}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </IconCard>
          </div>
        )}

        <Workbench
          basePath={basePath}
          weekKey={weekKey}
          thisWeek={thisWeek}
          now={now}
          weekNav={<WeekNav weekKey={weekKey} thisWeek={thisWeek} basePath={basePath} />}
          gugu={guguAiEnabled()}
          skipped={skippedRes.data ? { reason: skippedRes.data.reason } : null}
          rows={benchRows}
          tiles={{ submitted: submitted.length, total: groups.length, remaining, late: lateCount, checked: checkedCount, unchecked: submitted.length - checkedCount, care: judged ? judged.spots.length : null, careRange }}
          selected={benchSelected}
          care={benchCare}
        />
        <FeedbackSection
          className="hidden lg:order-4 lg:col-span-2 lg:block"
          hrefFor={toBench}
          pending={{ rows: pendingRows, total: pendingTotal, moreHref: pendingTotal > unstamped.length ? feedbackHref(moreN + FEEDBACK_PAGE, doneN) : null }}
          done={{ rows: doneRows, total: doneTotal, moreHref: doneTotal > stamped.length ? feedbackHref(moreN, doneN + FEEDBACK_PAGE) : null }}
        />

        {/* 전체 메뉴에서 바로 오는 자리(2026-11-12) — /pastor#ai · #care · #prayers · #notes (휴면 신청은 2026-11-17 없앴다) */}
        <WideFold id="ai" className="scroll-mt-20 empty:hidden lg:order-2 lg:col-span-2">
          {aiShown || aiCanMake ? (
            <AiDigestSection key={weekKey} weekKey={weekKey} initial={aiShown} canMake={aiCanMake} unread={unread} fresh={fresh} />
          ) : (
            <AnchorEmpty anchor="ai" icon="/icons/tossface/u2728.svg" title="AI 정리" line={`${weekWord} 아직 정리할 목장보고서가 없어요.`} prevHref={prevAnchor("ai")} />
          )}
        </WideFold>

        <div id="care" className="scroll-mt-20 empty:hidden lg:order-5">
          {blindSpots ? <BlindSpotSection summary={blindSpots} showGroup change={blindSpotChange} /> : null}
        </div>
        <div id="absences" className="scroll-mt-20 empty:hidden lg:order-5">
          {absences ? <AbsenceStreakSection people={absences} /> : null}
        </div>
        <div id="prayers" className="scroll-mt-20 empty:hidden lg:order-6">
          {prayerFlow && prayerFlow.total > 0 ? (
            <PrayerFlowSection flow={prayerFlow} />
          ) : (
            <AnchorEmpty anchor="prayers" icon="/icons/tossface/u1F64F.svg" title="기도제목" line={`${weekWord} 아직 모인 기도제목이 없어요.`} prevHref={prevAnchor("prayers")} />
          )}
        </div>
        <div id="notes" className="scroll-mt-20 empty:hidden lg:order-6">
          <GroupNotesSection notes={notes} weekKey={weekKey} />
        </div>
      </main>
    </>
  );
}

function WeekNav({ weekKey, thisWeek, basePath, className = "" }: { weekKey: string; thisWeek: string; basePath: string; className?: string }) {
  const prevWeek = addDays(weekKey, -7);
  const nextWeek = addDays(weekKey, 7);
  const step = `${BTN("white", "sm")} !h-9 !px-3 !text-[14px]`;
  return (
    <nav className={`flex items-center justify-between gap-2 ${className}`}>
      <Link href={`${basePath}?week=${prevWeek}`} replace className={step}>
        <Icon d={ICON.back} className="h-4 w-4" strokeWidth={2.4} />
        지난주
      </Link>
      {/* 주 고르기(2026-11-26) — 지난 주를 골라 바로 간다 */}
      <WeekPicker weekKey={weekKey} thisWeek={thisWeek} basePath={basePath} />
      {nextWeek <= thisWeek ? (
        <Link href={`${basePath}?week=${nextWeek}`} replace className={step}>
          다음주
          <Chevron className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${step} invisible`}>
          다음주
          <Chevron className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
