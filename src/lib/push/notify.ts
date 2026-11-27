import { createAdminClient } from "@/lib/supabase/admin";

import { moveDecisionMessage, moveRequestMessage, newFamilyMessage, pastorSubmittedMessage, applicationMessage, chatQuotaDecisionMessage, chatQuotaRequestMessage, digestMessage, nameTakenMessage, notedMessage, reminderMessage, stampedMessage, submittedMessage } from "./messages";
import { sendPush, type SendResult } from "./send";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 알림 다섯 가지 — 누구에게(DB 함수) · 무엇을(messages) · 한 번만(dedupe key).
 * 서버 액션은 `after()` 안에서 부른다 — 제출·스탬프 응답을 알림 때문에 늦추지 않는다.
 */

/** 제출 완료 → 같은 목장의 다른 리더. 다시 제출해도 한 번(submitted:<report>) */
export async function notifySubmitted(reportId: string, submitterUserId: string, submitterName: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_group_targets", { p_report_id: reportId, p_exclude: submitterUserId });
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const { group_name, week_key } = rows[0];
  return sendPush(rows.map((r) => r.user_id), submittedMessage(submitterName, group_name, week_key), `submitted:${reportId}`);
}

/** 제출 → 목사님(2026-11-26). 처음 제출 때 한 번(pastor-submitted:<report>) — notifySubmitted 와 같은 자리에서 부른다 */
export async function notifyPastorSubmitted(reportId: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [targetsRes, reportRes] = await Promise.all([
    admin.rpc("push_digest_targets"),
    admin.from("reports").select("week_key, groups(name)").eq("id", reportId).maybeSingle(),
  ]);
  const users = (targetsRes.data ?? []).map((r) => r.user_id);
  const report = reportRes.data as { week_key: string; groups: { name: string } | null } | null;
  if (users.length === 0 || !report?.groups) return null;
  return sendPush(users, pastorSubmittedMessage(report.groups.name, report.week_key), `pastor-submitted:${reportId}`);
}

/** 목사님 스탬프 → 목장 리더 전원. 같은 스탬프를 껐다 켜도 한 번(stamped:<report>:<stamp>) */
export async function notifyStamped(
  reportId: string,
  stamp: Database["public"]["Enums"]["report_stamp"],
): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_group_targets", { p_report_id: reportId });
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const { group_name, week_key } = rows[0];
  return sendPush(rows.map((r) => r.user_id), stampedMessage(group_name, week_key, stamp), `stamped:${reportId}:${stamp}`);
}

/** 목사님 한마디 → 목장 리더 전원. 처음 남겼을 때 한 번만 — 고쳐 써도 다시 알리지 않는다(noted:<report>) */
export async function notifyNoted(reportId: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_group_targets", { p_report_id: reportId });
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const { group_name, week_key } = rows[0];
  return sendPush(rows.map((r) => r.user_id), notedMessage(group_name, week_key), `noted:${reportId}`);
}

/** 월요일 미제출 → 그 주를 아직 안 낸 목장의 리더 전원. 목장마다 문구가 다르니 목장별로 보낸다 */
export async function notifyReminder(weekKey: string): Promise<{ groups: number; results: SendResult[] } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_reminder_targets", { p_week_key: weekKey });
  const byGroup = new Map<string, { name: string; users: string[] }>();
  for (const r of data ?? []) {
    const g = byGroup.get(r.group_id) ?? { name: r.group_name, users: [] };
    g.users.push(r.user_id);
    byGroup.set(r.group_id, g);
  }
  const results: SendResult[] = [];
  for (const g of byGroup.values()) {
    results.push(await sendPush(g.users, reminderMessage(g.name, weekKey), `reminder:${weekKey}`));
  }
  return { groups: byGroup.size, results };
}

/** 수요일 아침 → 목사님. 지난주 제출 수만 싣는다(2026-11-05). 한 주에 한 번(digest:<week>) */
export async function notifyDigest(weekKey: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [targetsRes, groupsRes, reportsRes] = await Promise.all([
    admin.rpc("push_digest_targets"),
    admin.from("groups").select("id").eq("status", "active"),
    admin.from("reports").select("group_id").eq("week_key", weekKey).not("submitted_at", "is", null),
  ]);
  const users = (targetsRes.data ?? []).map((r) => r.user_id);
  if (users.length === 0) return null;
  const active = new Set((groupsRes.data ?? []).map((g) => g.id));
  const submitted = (reportsRes.data ?? []).filter((r) => active.has(r.group_id)).length;
  return sendPush(users, digestMessage(weekKey, submitted, active.size), `digest:${weekKey}`);
}

/** 새 신청 → 운영자 전원(2026-11-05). 같은 사람이 하루에 여러 번 내도 한 번(application:<user>:<날짜>) */
export async function notifyApplication(applicantUserId: string, day: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_admin_targets");
  const users = (data ?? []).map((r) => r.user_id);
  if (users.length === 0) return null;
  return sendPush(users, applicationMessage(), `application:${applicantUserId}:${day}`);
}

/** 이름 확인 요청 → 운영자 전원(2026-11-06). 같은 사람이 하루에 여러 번 눌러도 한 번 */
export async function notifyNameTaken(reporterUserId: string, day: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_admin_targets");
  const users = (data ?? []).map((r) => r.user_id);
  if (users.length === 0) return null;
  return sendPush(users, nameTakenMessage(), `name-taken:${reporterUserId}:${day}`);
}

/** 구구 챗봇 추가 신청(대기) → 운영자 전원, 신청자 본인 빼고(운영자 겸 리더). 신청마다 한 번(chat-quota-request:<신청>) */
export async function notifyChatQuotaRequest(requestId: string, requesterUserId: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.rpc("push_admin_targets");
  const users = (data ?? []).map((r) => r.user_id).filter((u) => u !== requesterUserId);
  if (users.length === 0) return null;
  return sendPush(users, chatQuotaRequestMessage(), `chat-quota-request:${requestId}`);
}

/** 구구 챗봇 추가 신청 결과 → 신청한 리더. 신청마다 한 번(chat-quota-decision:<신청>) */
export async function notifyChatQuotaDecision(requestId: string, userId: string, amount: number | null): Promise<SendResult | null> {
  if (!createAdminClient()) return null;
  return sendPush([userId], chatQuotaDecisionMessage(amount), `chat-quota-decision:${requestId}`);
}

type MoveRow = { person_id: string; direction: string; requested_by: string | null; from_group_id: string; to_group_id: string; status: string };

async function moveInfo(admin: NonNullable<ReturnType<typeof createAdminClient>>, moveId: string) {
  const { data } = await admin.from("group_moves").select("person_id, direction, requested_by, from_group_id, to_group_id, status").eq("id", moveId).maybeSingle();
  const m = data as MoveRow | null;
  if (!m) return null;
  const [p, g] = await Promise.all([
    admin.from("persons").select("name").eq("id", m.person_id).maybeSingle(),
    admin.from("groups").select("id, name").in("id", [m.from_group_id, m.to_group_id]),
  ]);
  const name = (id: string) => ((g.data ?? []) as { id: string; name: string }[]).find((x) => x.id === id)?.name ?? "";
  return { ...m, personName: (p.data as { name: string } | null)?.name ?? "", fromName: name(m.from_group_id), toName: name(m.to_group_id) };
}

/**
 * 목장 이동 신청 → 받는 쪽 목장 리더 전원(2026-11-26). 보내기는 옮겨 갈 목장, 데려오기는 지금 목장.
 * 그 목장에 앱을 쓰는 리더가 없으면 목사님에게(목사님이 처리한다). 신청마다 한 번(move-request:<신청>)
 */
export async function notifyMoveRequest(moveId: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const m = await moveInfo(admin, moveId);
  if (!m) return null;
  const decider = m.direction === "pull" ? m.from_group_id : m.to_group_id;
  const { data } = await admin.rpc("push_group_leader_targets", { p_group_id: decider });
  let users = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (users.length === 0) users = (((await admin.rpc("push_digest_targets")).data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (users.length === 0) return null;
  return sendPush(users, moveRequestMessage(m.direction, m.personName, m.fromName, m.toName), `move-request:${moveId}`);
}

/** 목장 이동 결과 → 신청한 리더. 신청마다 한 번(move-decision:<신청>) */
export async function notifyMoveDecision(moveId: string): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const m = await moveInfo(admin, moveId);
  if (!m?.requested_by || (m.status !== "accepted" && m.status !== "rejected")) return null;
  return sendPush([m.requested_by], moveDecisionMessage(m.status === "accepted", m.personName, m.toName), `move-decision:${moveId}`);
}

/** 새가족 → 목사님과 그 목장 리더들(넣은 리더 빼고). 사람마다 한 번(new-family:<사람>) */
export async function notifyNewFamily(personId: string, adderUserId: string | null): Promise<SendResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: p } = await admin.from("persons").select("name, group_id, groups(name)").eq("id", personId).maybeSingle();
  const person = p as { name: string; group_id: string | null; groups: { name: string } | null } | null;
  if (!person?.group_id || !person.groups) return null;
  const [leaders, pastors] = await Promise.all([admin.rpc("push_group_leader_targets", { p_group_id: person.group_id }), admin.rpc("push_digest_targets")]);
  const users = [...((leaders.data ?? []) as { user_id: string }[]), ...((pastors.data ?? []) as { user_id: string }[])].map((r) => r.user_id).filter((u) => u !== adderUserId);
  if (users.length === 0) return null;
  return sendPush(users, newFamilyMessage(person.groups.name, person.name, personId), `new-family:${personId}`);
}
