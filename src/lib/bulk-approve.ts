/**
 * 승인 화면 '모두 승인'(2026-11-26 사용자 결정) — 어떤 신청을 한꺼번에 승인할지 정한다.
 *   · 리더 신청만. 목사님 · 임원진 신청은 권한이 커서 지금처럼 하나씩 승인한다
 *   · 한꺼번에 승인할 수 없는 리더 신청은 건너뛰어 남기고 까닭을 보인다
 *       고른 이름이 없음 · 고른 이름이 이미 다른 계정에 연결됨 · 같은 이름을 두 사람이 고름 · 잠긴 계정
 *   · 구구 챗봇 추가 신청은 여기에 들지 않는다(따로 하나씩)
 */

export type BulkApp = {
  id: string;
  requested_role: string | null;
  person_id: string | null;
  person_linked: boolean | null;
  applicant_active: boolean | null;
};

export type BulkPlan = {
  /** 한꺼번에 승인할 신청 */
  approve: string[];
  /** 건너뛸 리더 신청 → 까닭 */
  skip: Map<string, string>;
};

export function bulkApprovePlan(apps: BulkApp[]): BulkPlan {
  const leaders = apps.filter((a) => (a.requested_role ?? "leader") === "leader");
  const picks = new Map<string, number>();
  for (const a of leaders) if (a.person_id) picks.set(a.person_id, (picks.get(a.person_id) ?? 0) + 1);
  const approve: string[] = [];
  const skip = new Map<string, string>();
  for (const a of leaders) {
    if (!a.person_id) skip.set(a.id, "고른 이름이 없어요");
    else if (a.person_linked) skip.set(a.id, "고른 이름이 이미 다른 계정에 연결됐어요");
    else if ((picks.get(a.person_id) ?? 0) > 1) skip.set(a.id, "같은 이름을 두 사람이 골랐어요");
    else if (a.applicant_active === false) skip.set(a.id, "잠긴 계정이에요");
    else approve.push(a.id);
  }
  return { approve, skip };
}
