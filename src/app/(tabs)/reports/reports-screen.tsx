import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { GuguSays } from "@/components/ui";
import { guguAiEnabled } from "@/lib/ai/gugu-ai";
import { requireReportAccess } from "@/lib/auth/session";
import { PREVIEW_READONLY_CODE } from "@/lib/preview-guard";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PresenceRow = Database["public"]["Functions"]["touch_report_presence"]["Returns"][number];
import { listedBlindSpotIds, type BlindSpotRow } from "@/lib/blind-spots";
import { orderReportPersons } from "@/lib/report-order";
import { addDays, currentWeekKey, formatWeekLabel, weeksBetween } from "@/lib/week";

import { saveReportRoster, splitMemoAction } from "./actions";
import { ReportForm, type PersonRow, type PrevPrayer } from "./report-form";


/**
 * L-2 주간 보고서 작성.
 *
 * 권한이 없으면 404 다(requireReportAccess). 다른 목장의 보고서는 여기서
 * 막지 않는다 — open_report 와 submit_report 가 함수 안에서 is_leader_of 와 '이번 주까지' 를 직접 보고
 * (2026-11-04 SECURITY DEFINER 로 — 표에 직접 쓰는 권한은 거뒀다), 그것을 테스트가 확인한다(tests/rls/report-guard.test.mjs).
 */
/**
 * 주간 보고서 작성 화면 본체 — `/reports/[week]`. 2단계(2026-09-30)부터 홈은 따로 있고,
 * 이 화면은 "이번 주 한 건" 을 쓰는 자리다. 주차 이동 링크는 `/reports/<주차>`.
 */
export async function ReportsScreen({ weekKey, thisWeek }: { weekKey: string; thisWeek: string }) {
  const basePath = "/reports";
  const me = await requireReportAccess();

  if (!me.leadsGroup || !me.groupId) {
    return (
      <>
        <AppHeader back="/" />
        <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-6 px-5 py-10">
          <GuguSays mood="base" lines={["목장보고서는 여기 없어요.", "제출 현황에서 봐요."]} />
          <h1 className="gg-display text-[26px]">주간 목장보고서</h1>
        </main>
      </>
    );
  }

  const supabase = await createClient();

  // 보고서 행을 확보하고 열람을 기록한다. 휴주면 여기서 거부된다.
  const { data: reportId, error: openError } = await supabase.rpc("open_report", {
    p_group_id: me.groupId,
    p_week_key: weekKey,
  });

  if (openError || !reportId) {
    const skipped = openError?.message.includes("휴주") ?? false;
    // 이번 주 앞 3주보다 앞 주는 새로 쓰지 않는다(2026-11-04) — 이미 있는 보고서만 열린다
    const tooOld = openError?.message.includes("지난 주차") ?? false;
    // 프리뷰 읽기 전용(Step 9c) — 보고서 행을 새로 만들지 못한다. 이미 있는 주차도 열람 기록이 쓰기라 여기로 온다.
    const previewBlocked = openError?.code === PREVIEW_READONLY_CODE;
    return (
      <>
        <AppHeader back="/" />
        <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-6 px-5 py-6">
          <WeekNav weekKey={weekKey} thisWeek={thisWeek} basePath={basePath} />
          <h1 className="gg-display text-[26px]">{formatWeekLabel(weekKey)}</h1>
          <GuguSays
            mood={skipped ? "sleepy" : "base"}
            lines={
              skipped
                ? ["이 주는 휴주예요.", "목장보고서는 쉬어요."]
                : tooOld
                  ? ["이 주는 목장보고서가 없어요."]
                  : previewBlocked
                    ? ["프리뷰는 읽기 전용이에요."]
                    : ["목장보고서를 못 열었어요.", "잠시 뒤 다시 열어요."]
            }
          />
        </main>
      </>
    );
  }

  // 목사님 확인 줄은 보고서 화면에서 뺐다(2026-11-14 사용자 요청) — 홈 카드에 있다

  // 연속 제출 — 리더는 자기 목장 한 줄만 받는다(순위 없음). 저장 없이 계산.
  const streakRes = await supabase.rpc("group_streaks", { p_week_key: weekKey });
  const streakRow = streakRes.data?.[0];
  const initialStreak = streakRow
    ? {
        streak: streakRow.streak ?? 0,
        currentIncluded: streakRow.current_included ?? false,
        everOnTime: streakRow.ever_on_time ?? false,
        broken: streakRow.broken ?? false,
      }
    : null;

  const [reportRes, rowsRes, priorRes, viewersRes] = await Promise.all([
    supabase.from("reports").select("note, submitted_at, is_late, updated_at, no_meeting").eq("id", reportId).single(),
    supabase.from("weekly_records_visible").select("*").eq("report_id", reportId),
    supabase
      .from("weekly_records_visible")
      .select("person_id, week_key, prayer_request")
      .eq("group_id_at_write", me.groupId)
      .lt("week_key", weekKey)
      .not("prayer_request", "is", null)
      .order("week_key", { ascending: false })
      .limit(400),
    supabase.rpc("touch_report_presence", { p_report_id: reportId }),
  ]);

  // 그 주 명단(2026-11-05, submit_report 와 같은 규칙) — 이 보고서에 기록이 있는 사람 + 아직 안 냈으면
  // 지금 활동 중이고 그 주가 끝나기 전에 들어온 사람. 이미 낸 보고서는 그 뒤 들어온 사람을 더하지 않고,
  // 그 뒤 떠난 사람의 기록도 그대로 보인다.
  const recordedIds = (rowsRes.data ?? []).map((r) => r.person_id).filter((id): id is string => !!id);
  // 그 주가 끝난 뒤에 떠난 사람도 그 주 명단이다(2026-11-06, submit_report 와 같은 규칙)
  const weekEnd = new Date(`${addDays(weekKey, 7)}T00:00:00+09:00`).toISOString();
  const [currentRes, recordedRes] = await Promise.all([
    reportRes.data?.submitted_at
      ? Promise.resolve({ data: [] as { id: string; name: string; group_role: Database["public"]["Enums"]["group_role"] }[] })
      : supabase
          .from("persons")
          .select("id, name, group_role")
          .eq("group_id", me.groupId)
          .lte("joined_at", addDays(weekKey, 6))
          .or(`status.eq.active,and(status.eq.left,left_at.gte.${weekEnd})`)
          // 옮겨 온 사람은 옮긴 주부터(2026-11-26 목장 이동, submit_report 와 같은 규칙)
          .or(`group_since.is.null,group_since.lte.${weekKey}`),
    // 다른 목장으로 옮긴 사람도 이름이 붙게 — 명단 읽기 범위가 아니라 기록 읽기 범위로(2026-11-06)
    recordedIds.length
      ? supabase.rpc("recorded_person_names", { p_ids: recordedIds })
      : Promise.resolve({ data: [] as { id: string; name: string; group_role: Database["public"]["Enums"]["group_role"] }[] }),
  ]);
  // 기록 제외된 분은 리더 보고서 화면에 두지 않는다(2026-11-06) — 고치면 저장 전체가 막혔다. 지난 기록은 그대로 남는다
  const recordedVisible = ((recordedRes.data ?? []) as { id: string; name: string; group_role: Database["public"]["Enums"]["group_role"]; status?: string }[]).filter(
    (p) => p.status !== "opted_out",
  );
  const weekPeople = new Map([...(currentRes.data ?? []), ...recordedVisible].map((p) => [p.id, p]));

  // 이름 앞 프로필 동그라미(2026-11-11) — 사진 · 목장장. 못 읽으면 사진 없이(이름 글자) · 목장장 색 없이
  const weekIds = [...weekPeople.keys()];
  // 돌봄 사각지대(2026-11-11 사용자 요청 — 맨 뒤로, 그 안은 가나다) — '돌봄 사각지대' 화면과 같은 판정(이번 주 기준 창).
  // 화면에 이름이 뜨는 사람 그대로 — 집계 중이면 '확인 필요' 사람(#155 · #156 은 판정된 사람만 봐서 집계 중엔 아무도 안 움직였다). 못 읽으면 예전 순서
  const [photoRes, headRes, spotRes] = weekIds.length
    ? await Promise.all([
        supabase.rpc("person_photos", { p_person_ids: weekIds }),
        // 목장장 · 명단 편집(숨김 · 순서, 2026-11-14) — 자기 목장 사람만 읽힌다
        supabase.from("persons").select("id, is_group_head, report_hidden, report_order, joined_at").in("id", weekIds),
        supabase.rpc("care_blind_spots", { p_week_key: currentWeekKey() }),
      ])
    : [null, null, null];
  const photos = new Map(((photoRes?.data ?? []) as { person_id: string; updated_at: string }[]).map((r) => [r.person_id, Date.parse(r.updated_at)]));
  const meta = new Map((headRes?.data ?? []).map((r) => [r.id, r]));
  const heads = new Set([...meta.values()].filter((r) => r.is_group_head).map((r) => r.id));
  if (spotRes?.error) console.error("[reports] care_blind_spots", spotRes.error.code, spotRes.error.message);
  const spots = listedBlindSpotIds((spotRes?.data ?? []) as BlindSpotRow[]);

  const persons: PersonRow[] = orderReportPersons(
    [...weekPeople.values()].map((p) => ({
      id: p.id,
      name: p.name,
      groupRole: p.group_role,
      isSelf: p.id === me.personId,
      isHead: heads.has(p.id),
      photoAt: photos.get(p.id) ?? null,
      hidden: meta.get(p.id)?.report_hidden ?? false,
      // 이 주에 들어온 새가족(2026-11-26)
      isNew: (() => {
        const j = meta.get(p.id)?.joined_at;
        return !!j && j >= weekKey && j <= addDays(weekKey, 6);
      })(),
    })),
    spots,
    new Map([...meta.values()].filter((r) => r.report_order != null).map((r) => [r.id, r.report_order as number])),
  );

  // 가장 최근에 기록이 있는 주차 (C). 내림차순이므로 사람별 첫 행이 최신이다.
  const prev: Record<string, PrevPrayer | undefined> = {};
  for (const r of priorRes.data ?? []) {
    if (prev[r.person_id] || !r.prayer_request) continue;
    prev[r.person_id] = { text: r.prayer_request, weeksAgo: weeksBetween(r.week_key, weekKey) };
  }

  const rows = rowsRes.data ?? [];
  const report = reportRes.data;
  const serverStamp = [report?.updated_at ?? "", ...rows.map((r) => r.updated_at)]
    .filter(Boolean)
    .sort()
    .at(-1) ?? new Date(0).toISOString();

  return (
    <>
      <AppHeader back="/" wide />
      {/* 1024px 이상은 넓은 배치(report-form — 왼쪽 붙여넣기 · 오른쪽 명단 표) */}
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:max-w-[1200px] lg:px-8">
        {/* 주차 이동은 고정하지 않는다 — 드문 조작에 상시 자리를 주면 사람 카드가 하나 사라진다. */}
        <WeekNav weekKey={weekKey} thisWeek={thisWeek} basePath={basePath} />
        <ReportForm
          key={reportId}
        reportId={reportId}
        weekKey={weekKey}
        groupName={me.groupName}
        persons={persons}
        initialRows={rows}
        prev={prev}
        initialNote={report?.note ?? null}
        submittedAt={report?.submitted_at ?? null}
        isLate={report?.is_late ?? false}
        initialViewers={((viewersRes.data ?? []) as PresenceRow[]).map((v) => v.name)}
        serverStamp={serverStamp}
        serverNow={new Date().toISOString()}
        initialStreak={initialStreak}
        // 새가족 추가(2026-11-26) — 이 화면에서 이름만으로. 새로 쓸 수 있는 주(이번 주와 그 앞 3주)만 — 들어온 날이 그 주가 되어 그 주 명단에 나온다
        newFamilyGroupId={me.leadsGroup && weekKey >= addDays(thisWeek, -7 * WRITE_WEEKS_BACK) ? me.groupId : null}
        initialNoMeeting={report?.no_meeting ?? false}
        memoFill={guguAiEnabled() ? splitMemoAction : null}
        saveRoster={saveReportRoster}
      />
      </main>
    </>
  );
}

/** 새로 쓸 수 있는 가장 앞 주 — 이번 주와 그 앞 3주(open_report · submit_report 와 같은 규칙, 2026-11-04) */
const WRITE_WEEKS_BACK = 3;

function WeekNav({ weekKey, thisWeek, basePath }: { weekKey: string; thisWeek: string; basePath: string }) {
  const prevWeek = addDays(weekKey, -7);
  const nextWeek = addDays(weekKey, 7);
  // 그보다 앞 주는 '지난 보고서' 목록에서 연다 — 여기서 끝없이 거슬러 가지 않게
  const canPrev = prevWeek >= addDays(thisWeek, -7 * WRITE_WEEKS_BACK);
  return (
    <nav className="flex items-center justify-between gap-2 text-[13px]">
      {canPrev ? (
        <Link href={`${basePath}/${prevWeek}`} className="gg-btn gg-btn-white gg-btn-sm !h-9 !px-3 !text-[13px]">
          ← 지난주
        </Link>
      ) : (
        <span aria-hidden className="gg-btn gg-btn-sm invisible !h-9 !px-3 !text-[13px]">
          ← 지난주
        </span>
      )}
      <span className="gg-display text-[15px]">{weekKey === thisWeek ? "이번 주" : formatWeekLabel(weekKey)}</span>
      {nextWeek <= thisWeek ? (
        <Link href={`${basePath}/${nextWeek}`} className="gg-btn gg-btn-white gg-btn-sm !h-9 !px-3 !text-[13px]">
          다음주 →
        </Link>
      ) : (
        <span aria-hidden className="gg-btn gg-btn-sm invisible !h-9 !px-3 !text-[13px]">
          다음주 →
        </span>
      )}
    </nav>
  );
}
