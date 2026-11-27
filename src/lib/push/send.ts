import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

import type { PushPayload } from "./messages";

/**
 * 웹 푸시 발송 — 서버 전용(Step 7, 06 §4.2).
 *
 *   1 claim_push(dedupeKey, users) — 이 알림을 아직 안 받은 사람만 남긴다(크론 중복·재제출에도 한 번)
 *   2 그 사람들의 기기(push_subscriptions)마다 VAPID 로 보낸다
 *   3 404·410(구독 만료·해제)은 그 기기를 지운다. 그 밖의 실패는 failure_count 만 올린다
 *
 * 키(VAPID·SUPABASE_SECRET_KEY)가 없으면 아무것도 하지 않는다 — 제출 같은 본 동작을 알림 때문에
 * 실패시키지 않는다. 돌려주는 값은 기록·로그용 숫자뿐.
 */

export type SendResult = { skipped: string | null; users: number; sent: number; failed: number; removed: number };

function configure(): string | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return "VAPID 키 없음";
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "mailto:admin@example.com", publicKey, privateKey);
  return null;
}

export async function sendPush(userIds: string[], payload: PushPayload, dedupeKey: string): Promise<SendResult> {
  const result: SendResult = { skipped: null, users: 0, sent: 0, failed: 0, removed: 0 };
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return result;

  const missing = configure();
  const admin = createAdminClient();
  if (missing || !admin) {
    result.skipped = missing ?? "SUPABASE_SECRET_KEY 없음";
    return result;
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_push", { p_key: dedupeKey, p_users: unique });
  if (claimError) {
    result.skipped = `claim 실패: ${claimError.message}`;
    return result;
  }
  const targets = (claimed ?? []) as string[];
  result.users = targets.length;
  if (targets.length === 0) return result;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .in("user_id", targets);

  const body = JSON.stringify(payload);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        result.sent += 1;
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.removed += 1;
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          result.failed += 1;
          // 다섯 번 내리 실패한 기기는 지운다(2026-11-06) — 알림 현황에 '등록됨' 으로 남아 안내할 사람을 놓쳤다
          if (s.failure_count + 1 >= 5) await admin.from("push_subscriptions").delete().eq("id", s.id);
          else await admin.from("push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
        }
      }
    }),
  );
  return result;
}
