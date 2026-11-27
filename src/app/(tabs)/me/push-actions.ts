"use server";

import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 이 기기의 알림 켜기·끄기(시험 알림은 2026-11-11 뺐다). 저장·삭제는 DB 함수가 본인 것만 다룬다(save/remove_push_subscription).
 */

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  await requireAppUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.keys.p256dh,
    p_auth: sub.keys.auth,
    p_user_agent: sub.userAgent ?? undefined,
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await requireAppUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return { ok: !error };
}
