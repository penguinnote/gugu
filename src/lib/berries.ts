import { groupLabel } from "@/lib/labels";

/**
 * 로뎀 월드 열매 — 앱 화면 쪽 말(World 5). 숫자 규칙은 DB(world_rules)가 정하고, 여기서는 받은 값을 말로 바꾼다.
 *   제출하면  보고서 화면 하단에 "○○ 목장 열매 +80 (연속 보너스 +4)" — 원장에 방금 적힌 그 주 적립을 그대로 읽는다
 *   홈에서    월드 입구 옆 열매 수가 한 번 통통 튄다 — 작성 화면이 sessionStorage 에 적어 두고 홈이 읽으면 지운다
 */
export type BerryGain = { base: number; bonus: number; late: boolean };

/** 이만큼 넘으면 '끝없음' 으로 본다 — 운영자 집(2026-11-15, 원장에 아주 큰 열매를 넣어 둔다) */
export const BERRY_ENDLESS = 1_000_000;

/** 열매 수를 화면 글자로 — 세 자리마다 쉼표, 끝없으면 ∞ */
export function berryText(n: number): string {
  return n >= BERRY_ENDLESS ? "∞" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const BERRY_GAIN_KEY = "nn:berry-gain";

export function berryGainText(groupName: string | null | undefined, g: BerryGain): string {
  const total = `${groupLabel(groupName)} 열매 +${g.base}`;
  if (g.bonus > 0) return `${total} (연속 보너스 +${g.bonus})`;
  if (g.late) return `${total} (마감 뒤 제출)`;
  return total;
}

/** 원장 행(그 주 제출 적립 · 연속 보너스) → 화면용. 적립이 없으면 null */
export function gainFromLedger(rows: { reason: string; delta: number }[]): BerryGain | null {
  const base = rows.find((r) => r.reason === "report_on_time" || r.reason === "report_late");
  if (!base) return null;
  const bonus = rows.filter((r) => r.reason === "streak_bonus").reduce((n, r) => n + r.delta, 0);
  return { base: base.delta, bonus, late: base.reason === "report_late" };
}

/** 홈 요약(world_summary) — 명단상 리더만 있다 */
export type WorldSummary = {
  berries: number;
  coupons: number;
  coupon_price: number;
  /** 한 목장이 가질 수 있는 쿠폰 수(World 6) */
  coupon_max?: number;
  /** 지금 쿠폰으로 지킬 수 있는 놓친 주(YYYY-MM-DD). 없으면 null */
  freeze_week: string | null;
  /** 그 주를 지키면 이어지는 연속 주 수 */
  freeze_keeps: number;
  freezes_used: number;
  freezes_per_term: number;
};
