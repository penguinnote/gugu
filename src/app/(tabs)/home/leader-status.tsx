import Image from "next/image";
import Link from "next/link";

import { BTN, ICON, Icon } from "@/components/ui";
import type { UserContext } from "@/lib/auth/session";
import type { WorldSummary } from "@/lib/berries";
import { listedBlindSpotIds, type BlindSpotRow } from "@/lib/blind-spots";
import { careCount, loadWeekContacts } from "@/lib/care-contacts";
import { REPORT_STAMP_LABELS, type StreakInfo } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { formatKstWhen, isPastDeadline } from "@/lib/week";

import { Countdown } from "./countdown";
import { FreezeOffer } from "./freeze-offer";
import { HOME_CARD } from "./home-card";
import { ATTENDANCE_ROW, InfoRows, type InfoRow } from "./info-rows";
import { PushPrompt } from "./push-prompt";
import { SkipGiftPopup } from "./skip-gift";
import { Speak } from "./speak";

type StreakRow = Database["public"]["Functions"]["group_streaks"]["Returns"][number];
export type Review = { report_id: string; first_read_at: string; stamp: Database["public"]["Enums"]["report_stamp"] | null; note?: string | null };

/** 리더 홈에 필요한 이번 주 값 — 가져오기(loadLeaderWeek)와 그리기(LeaderHero)를 나눠, 디자인 확인 화면이 지어낸 값으로 그린다 */
export type LeaderWeek = {
  skipped: boolean;
  report: { id: string; submitted_at: string | null; is_late: boolean | null } | null;
  review: Review | null;
  streak: StreakInfo | null;
  /**
   * 돌봄 수(2026-11-15) — 주중에 연락할 사람: 돌봄 사각지대 ∪ 지난 예배에 결석했거나 온라인으로 드린 사람(lib/care-contacts).
   * 돌봄 화면(/groups/care)에 이름이 뜨는 사람 수와 같다. 못 읽으면 null(줄을 그리지 않는다)
   */
  care?: number | null;
  /** 내가 수락 · 거절할 목장 이동 신청 수(2026-11-26) — 있을 때만 줄 */
  moves?: number | null;
  /** 아직 못 본 휴주 선물(2026-11-26) — 주들과 합친 열매. 없으면 null */
  gift?: { weeks: string[]; total: number } | null;
};

export async function loadLeaderWeek(me: UserContext, weekKey: string): Promise<LeaderWeek> {
  const supabase = await createClient();
  const giftFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [thisRes, streakRes, skippedRes, careRes, contacts, movesRes, giftRes, seenRes] = await Promise.all([
    supabase.from("reports").select("id, submitted_at, is_late").eq("group_id", me.groupId!).eq("week_key", weekKey).maybeSingle(),
    supabase.rpc("group_streaks", { p_week_key: weekKey }),
    supabase.from("skipped_weeks").select("week_key").eq("week_key", weekKey).maybeSingle(),
    // 홈 카드의 두 줄 — 돌봄 · 출석부(2026-11-16, 예전 디데이). 이번 주 것과 함께 받아 홈이 늦어지지 않게
    supabase.rpc("care_blind_spots", { p_week_key: weekKey }),
    loadWeekContacts(supabase, me.groupId!, weekKey).catch(() => null),
    supabase.rpc("list_group_moves"),
    // 휴주 선물(2026-11-26) — 최근 30일에 들어온 것 중 이 계정이 아직 못 본 것
    supabase.from("world_ledger").select("week_key, delta").eq("group_id", me.groupId!).eq("reason", "skip_gift").gte("created_at", giftFrom),
    supabase.from("skip_gift_seen").select("week_key"),
  ]);
  const seen = new Set(((seenRes.data ?? []) as { week_key: string }[]).map((r) => r.week_key));
  const unseen = ((giftRes.data ?? []) as { week_key: string | null; delta: number }[]).filter((r) => r.week_key && !seen.has(r.week_key));
  const report = thisRes.data;
  const { data: review } = report
    ? await supabase.from("report_reviews").select("report_id, first_read_at, stamp, note").eq("report_id", report.id).maybeSingle()
    : { data: null };
  const rows = streakRes.data as StreakRow[] | null;
  const s = rows?.find((r) => r.group_id === me.groupId) ?? rows?.[0];
  return {
    skipped: Boolean(skippedRes.data),
    report: report ?? null,
    review: (review as Review | null) ?? null,
    streak: s ? { streak: s.streak ?? 0, currentIncluded: s.current_included ?? false, everOnTime: s.ever_on_time ?? false, broken: s.broken ?? false } : null,
    gift: unseen.length > 0 ? { weeks: unseen.map((r) => r.week_key!), total: unseen.reduce((s, r) => s + r.delta, 0) } : null,
    moves: movesRes.error ? null : ((movesRes.data ?? []) as { can_decide: boolean }[]).filter((m) => m.can_decide).length,
    care: careRes.error ? null : careCount(listedBlindSpotIds((careRes.data ?? []) as BlindSpotRow[]), contacts),
  };
}

/**
 * 홈 맨 위 — 리더의 이번 주 한 건(구구 테마, 2026-10-12). "지금 뭘 해야 하나" 만 답한다(02 §2 홈 원칙).
 * 카드 하나: 위에 구구가 말풍선으로 상태를 말하고(speak.tsx — 목사님 카드와 같은 모양, 2026-10-29), 아래에 할 일.
 *   미제출    "아직 작성하지 않았어요" + 마감까지 남은 시간 · 라임 '보고서 쓰기'      (손 흔들기)
 *   마감 지남 "마감 기한이 지났지만 / 지금이라도 제출해주세요!" · '보고서 쓰기'   (졸림)
 *   제출 완료 "제출 완료!" + 제출 시각 · 목사님 확인 · '목장보고서 고치기'                  (웃음)
 *   휴주      "이번 주는 휴주예요"                                          (졸림)
 * 주차 · 목장 줄은 뺐다(2026-10-29). 연속 제출은 맨 위 불꽃 알약만(2026-11-10), 놓친 주가 있으면 아랫단에 '쿠폰으로 지키기'(World 5).
 */
export function LeaderHero({
  weekKey,
  week,
  offer,
  serverNow,
  chat = false,
}: {
  weekKey: string;
  week: LeaderWeek;
  offer: WorldSummary | null;
  serverNow: Date;
  /** 구구를 누르면 챗봇 */
  chat?: boolean;
}) {
  const { skipped, report, review } = week;
  const submitted = Boolean(report?.submitted_at);
  const late = !submitted && !skipped && isPastDeadline(weekKey, serverNow);
  // 연속 제출은 맨 위 불꽃 알약 하나로 충분하다(2026-11-10 사용자 — 카드 아래 'n주 연속 제출 중' 줄을 뺐다). 놓친 주를 지키는 쿠폰 자리만 남는다
  const hasStreakRow = Boolean(offer);

  // 구구가 말풍선으로 상태를 말한다(2026-10-29 — 목사님 카드와 같은 모양). 주차 · 목장 줄은 뺐다
  // 마감 지남 문구는 2026-10-29 사용자 지정 — 한 줄에 다 들어가지 않아 두 줄
  const lines = skipped ? ["이번 주는 휴주예요"] : late ? ["마감 기한이 지났지만", "지금이라도 제출해주세요!"] : submitted ? ["제출 완료!"] : ["아직 작성하지 않았어요"];
  const mood = submitted ? "smile" : skipped || late ? "sleepy" : "wave";

  const info: InfoRow[] = [
    ...(typeof week.care === "number"
      ? [{ testId: "home-care", href: "/groups/care", icon: "/icons/tossface/u1F440.svg", label: "챙김이 필요한 양", value: `${week.care}명`, strong: week.care > 0 }]
      : []),
    // 목장 이동 신청(2026-11-26) — 내가 처리할 것이 있을 때만
    ...(week.moves ? [{ testId: "home-moves", href: "/groups/members", icon: "/icons/tossface/u1F3E1.svg", label: "목장 이동 신청", value: `${week.moves}건`, strong: true }] : []),
    // 디데이 줄을 빼고 출석부(2026-11-16 사용자) — 숫자 없이 가는 줄만(2026-11-18 사용자)
    ATTENDANCE_ROW,
  ];

  // 2026-11-14 운영자 B안과 같은 결 — 구구 한마디 아래로 목사님 확인 · 쿠폰을 옅은 선으로 나뉜 줄(카드 폭 그대로), 맨 아래 단추.
  // 예전 쿠폰 칸은 노란 바탕 상자라 다른 카드와 결이 달랐다
  return (
    <section className={`${HOME_CARD} overflow-hidden`} data-testid="week-status">
      <Speak mood={mood} lines={lines} chat={chat}>
        {submitted ? (
          <span className="mt-0.5 block text-[13px] text-muted">
            {formatKstWhen(report!.submitted_at!, serverNow)} 제출{report!.is_late ? " · 마감 후" : ""}
          </span>
        ) : !skipped && !late ? (
          <Countdown weekKey={weekKey} serverNow={serverNow.toISOString()} className="mt-0.5 text-[13px] font-semibold text-[var(--gg-sky-ink)] tabular-nums" />
        ) : null}
      </Speak>
      {submitted && review ? <PastorReview review={review} /> : null}
      {hasStreakRow && offer ? <FreezeOffer summary={offer} thisWeek={weekKey} /> : null}
      {/* 돌봄 · 출석부(2026-11-16, 예전 디데이) — 운영자 카드의 할 일 줄과 같은 모양, 누르면 그 화면 */}
      {info.length > 0 ? <InfoRows rows={info} className={(submitted && review) || hasStreakRow ? "" : "mt-4"} /> : null}
      {skipped ? (
        <div className={info.length > 0 ? "pb-2" : "pb-5"} />
      ) : (
        <div className={`px-5 pb-5 ${info.length > 0 ? "pt-2" : (submitted && review) || hasStreakRow ? "pt-1" : "pt-4"}`}>
          {submitted ? (
            <Link href={`/reports/${weekKey}`} className={`${BTN("white")} w-full`}>
              목장보고서 고치기
            </Link>
          ) : (
            <Link href={`/reports/${weekKey}`} className={`${BTN("sky")} w-full`}>
              <Icon d={ICON.write} className="h-5 w-5" strokeWidth={2.4} />
              목장보고서 쓰기
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

export function LeaderStatus({ weekKey, summary, week, chat = false }: { weekKey: string; summary: WorldSummary | null; week: LeaderWeek; chat?: boolean }) {
  const offer = summary?.freeze_week ? summary : null;
  return (
    <div className="flex flex-col gap-3">
      <LeaderHero weekKey={weekKey} week={week} offer={offer} serverNow={new Date()} chat={chat} />
      {/* 알림을 켠 기기가 하나도 없으면 홈을 열 때 아래에서 묻는다(2026-10-29) */}
      {/* 알림 켜기 팝업 — 이 기기에 알림이 없으면(지우고 다시 깔았을 때도) 기기가 스스로 살펴 묻는다(2026-11-11) */}
      <PushPrompt />
      {/* 휴주 선물(2026-11-26) — 못 본 것이 있으면 한 번 */}
      {week.gift ? <SkipGiftPopup weeks={week.gift.weeks} total={week.gift.total} /> : null}
    </div>
  );
}

/**
 * 목사님 확인(2026-11-10 사용자 요청 — 작은 초록 줄을 크게). 리더에게 가장 큰 보상인 순간이라 카드 안 맨 위에 말풍선처럼.
 *   도장이 있으면 '“기도하겠습니다”' 를 둥근 글씨로 크게(🙏), 없으면 '보고서를 확인하셨어요'(📖). 위 작은 줄은 '목사님 · 요일'.
 *   한마디(2026-11-10)가 있으면 그 글이 주인공 — 말풍선처럼 크게, 도장은 위 작은 줄 끝에 '· 기도하겠습니다' 로 붙는다(💬 그림)
 *   그림은 토스페이스 원본(public/icons/tossface)
 */
function PastorReview({ review }: { review: Review }) {
  const stamp = review.stamp ? REPORT_STAMP_LABELS[review.stamp] : null;
  // 홈 A안(2026-11-11) — 연두 칸 대신 옅은 선 아래 한 줄: 토스페이스 그림(💬 한마디 · 🙏 도장 · 📖 확인) · 작은 회색 머리 · 큰 글
  const icon = review.note ? "/icons/tossface/u1F4AC.svg" : stamp ? "/icons/tossface/u1F64F.svg" : "/icons/tossface/u1F4D6.svg";
  // 회색 머리 줄(목사님 · 요일)은 뺐다(2026-11-15 사용자 요청) — 그림 옆 한 줄만
  return (
    <div className="mt-4 mb-3 flex items-start gap-3 border-t border-[var(--gg-line)] px-5 pt-4" data-testid="pastor-review">
      <Image src={icon} alt="" width={22} height={22} unoptimized className="mt-0.5 size-[22px] shrink-0" />
      <div className="min-w-0">
        {review.note ? (
          <p className="gg-text text-[16px] leading-relaxed font-semibold break-words whitespace-pre-line" data-testid="pastor-note">
            {review.note}
          </p>
        ) : (
          <p className="text-[17px] leading-snug font-bold">{stamp ? `“${stamp}”` : "목장보고서를 확인하셨어요"}</p>
        )}
      </div>
    </div>
  );
}
