"use server";

import { after } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { gainFromLedger, type BerryGain } from "@/lib/berries";
import type { StreakInfo } from "@/lib/labels";
import { notifyPastorSubmitted, notifySubmitted } from "@/lib/push/notify";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey } from "@/lib/week";

/**
 * 보고서 화면의 서버 액션. 검증·권한·충돌 처리는 전부 DB 함수(submit_report,
 * SECURITY INVOKER)가 한다. 여기서는 값을 넘기고 결과를 화면이 쓰기 좋은
 * 모양으로 바꿀 뿐이다.
 */

export type VisibleRow = Database["public"]["Views"]["weekly_records_visible"]["Row"];
type PresenceRow = Database["public"]["Functions"]["touch_report_presence"]["Returns"][number];

export type SubmitRow = {
  person_id: string;
  /** 불러올 때의 updated_at. 새 행이면 null. 문자열 그대로 — Date 로 바꾸면 마이크로초가 사라진다 */
  expected_updated_at: string | null;
  fields: Partial<{
    worship_attended: boolean;
    group_meeting_attended: boolean;
    one_on_one_contacted: boolean;
    prayer_request: string | null;
    worship_online: boolean;
    online_reason: string | null;
    meeting_absent_reason: string | null;
    absent_reason: string | null;
  }>;
};

export type SubmitResult =
  | {
      ok: true;
      submitted: boolean;
      conflicts: string[];
      isLate: boolean | null;
      lateNow: boolean;
      rows: VisibleRow[];
      /** 제출 직후의 연속 제출. 상단 숫자가 그 자리에서 오르게 하려고 같이 돌려준다 (Step 6) */
      streak: StreakInfo | null;
      /** 처음 제출한 순간 원장에 적힌 그 주 열매(World 5). 고쳐 낸 것·적립이 없으면 null */
      berries: BerryGain | null;
      /** 연 뒤에 다른 리더가 특이사항을 바꿨다 — 그때의 특이사항(2026-11-06). 없으면 undefined */
      noteConflict?: string | null;
    }
  | {
      ok: false;
      message: string;
      missingAttendance: string[];
      missingPrayer: string[];
    };

export async function submitReport(input: {
  reportId: string;
  rows: SubmitRow[];
  note: string | null;
  noteDirty: boolean;
  /** 연 때의 특이사항 — 그 사이 다른 리더가 바꿨으면 덮어쓰지 않는다(2026-11-06) */
  noteBase?: string | null;
  /** false 면 임시 저장 — 쓴 만큼만 남기고 제출하지 않는다(2026-11-06) */
  submit?: boolean;
  /** 이번 주 목장 모임 없음 — 바뀌었을 때만 보낸다(2026-11-06) */
  noMeeting?: boolean;
  /** 제출 중인 주차. streak 재계산 기준. 없으면 이번 주 */
  weekKey?: string;
}): Promise<SubmitResult> {
  const supabase = await createClient();
  // 첫 제출인지 — 알림은 처음 제출될 때만 간다. 이미 낸 보고서를 고치는 건 "제출했습니다" 가 아니다.
  const { data: before } = await supabase.from("reports").select("submitted_at, group_id, week_key").eq("id", input.reportId).maybeSingle();
  const { data, error } = await supabase.rpc("submit_report", {
    p_report_id: input.reportId,
    p_rows: input.rows as unknown as Json,
    p_note: input.note ?? undefined,
    p_note_dirty: input.noteDirty,
    p_note_base: input.noteBase ?? undefined,
    p_note_check: input.noteBase !== undefined,
    p_submit: input.submit ?? true,
    p_no_meeting: input.noMeeting,
  });

  if (error) {
    // 완결성 실패는 detail 에 JSON 으로 온다. 그 외는 메시지만.
    let missingAttendance: string[] = [];
    let missingPrayer: string[] = [];
    if (error.code === "23514" && error.details) {
      try {
        const d = JSON.parse(error.details) as {
          missing_attendance?: string[];
          missing_prayer?: string[];
        };
        missingAttendance = d.missing_attendance ?? [];
        missingPrayer = d.missing_prayer ?? [];
      } catch {
        // detail 이 JSON 이 아니면 메시지만 쓴다
      }
    }
    return { ok: false, message: error.message, missingAttendance, missingPrayer };
  }

  const r = data as {
    submitted: boolean;
    conflicts: string[];
    is_late?: boolean;
    late_now?: boolean;
    rows: VisibleRow[];
    note_conflict?: boolean;
    note?: string | null;
    saved?: boolean;
  };

  // 같은 목장의 다른 리더에게 "OO 리더가 제출했습니다"(PRD §6.4). 응답 뒤에 — 알림 때문에 제출이 늦지 않게.
  // 첫 제출일 때만, 그리고 동시에 두 리더가 처음 내도 한 번만 간다(submitted:<report>). 충돌로 저장이 안 됐으면 보내지 않는다.
  if (r.submitted && before && !before.submitted_at) {
    after(async () => {
      const me = await getUserContext();
      if (!me) return;
      const res = await notifySubmitted(input.reportId, me.userId, me.displayName);
      if (res?.skipped) console.log(`[push] submitted ${input.reportId} skipped=${res.skipped}`);
      // 목사님에게도 "OO 목장이 목장보고서를 제출하였습니다."(2026-11-26) — 같은 첫 제출 한 번 규칙, 늦게 낸 것도
      await notifyPastorSubmitted(input.reportId).catch(() => null);
    });
  }

  // 제출하는 순간 상단 숫자가 올라야 한다 — 그 전환이 streak 의 유일한 보상이다.
  // 실패해도 제출은 성공이므로 null 로 두고 화면은 이전 값을 유지한다.
  const streak = await fetchStreak(supabase, input.weekKey ?? currentWeekKey());

  // 처음 낸 순간에만 — 원장에 트리거가 방금 적은 그 주 적립을 읽는다(목장 리더는 자기 목장 원장을 본다)
  let berries: BerryGain | null = null;
  if (r.submitted && before && !before.submitted_at) {
    const { data: ledger } = await supabase
      .from("world_ledger")
      .select("reason, delta")
      .eq("group_id", before.group_id)
      .eq("week_key", before.week_key)
      .in("reason", ["report_on_time", "report_late", "streak_bonus"]);
    berries = gainFromLedger(ledger ?? []);
  }

  return {
    ok: true,
    submitted: r.submitted,
    conflicts: r.conflicts ?? [],
    ...(r.note_conflict ? { noteConflict: r.note ?? null } : {}),
    isLate: r.is_late ?? null,
    lateNow: r.late_now ?? false,
    rows: r.rows ?? [],
    streak,
    berries,
  };
}

async function fetchStreak(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weekKey: string,
): Promise<StreakInfo | null> {
  const { data } = await supabase.rpc("group_streaks", { p_week_key: weekKey });
  const row = data?.[0];
  if (!row) return null;
  return {
    streak: row.streak ?? 0,
    currentIncluded: row.current_included ?? false,
    everOnTime: row.ever_on_time ?? false,
    broken: row.broken ?? false,
  };
}

/** 접속 신호를 보내고, 지금 같이 보고 있는 다른 리더의 이름을 받는다. */
export async function touchPresence(reportId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("touch_report_presence", { p_report_id: reportId });
  const rows: PresenceRow[] = data ?? [];
  return rows.map((r) => r.name);
}

/**
 * 보고서 받아쓰기(2026-11-12) — 모임 메모를 사람별 기도제목 · 특이사항으로 나눈다. 권한(그 목장 리더) · 켜짐은 splitMemo 가 본다.
 * 저장하지 않는다 — 화면이 고른 것만 칸에 넣고, 리더가 평소처럼 제출한다.
 */
export async function splitMemoAction(reportId: string, personIds: string[], memo: string) {
  const { splitMemo } = await import("@/lib/ai/dictation");
  return splitMemo(reportId, personIds, memo);
}

/**
 * 보고서 명단 편집 저장(2026-11-14) — 자기 목장 사람의 숨김 · 순서. 다른 목장 사람은 RLS 가 0행으로 막는다(그래서 바뀐 수를 센다).
 * 순서는 1부터 화면 순서 그대로.
 */
export async function saveReportRoster(items: { id: string; hidden: boolean; order: number }[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await getUserContext();
  if (!me?.leadsGroup || !me.groupId) return { ok: false, message: "목장 리더만 명단을 편집할 수 있습니다." };
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) return { ok: false, message: "명단이 올바르지 않습니다." };
  const ok = items.every((it) => typeof it.id === "string" && /^[0-9a-f-]{36}$/i.test(it.id) && typeof it.hidden === "boolean" && Number.isInteger(it.order) && it.order > 0 && it.order <= 1000);
  if (!ok) return { ok: false, message: "명단이 올바르지 않습니다." };
  const supabase = await createClient();
  const results = await Promise.all(
    items.map((it) =>
      supabase.from("persons").update({ report_hidden: it.hidden, report_order: it.order }).eq("id", it.id).eq("group_id", me.groupId!).select("id"),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, message: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  if (results.some((r) => (r.data ?? []).length !== 1)) return { ok: false, message: "다른 목장 사람은 편집할 수 없습니다." };
  return { ok: true };
}
