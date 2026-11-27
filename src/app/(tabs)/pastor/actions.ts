"use server";

import { after } from "next/server";

import { notifyNoted, notifyStamped } from "@/lib/push/notify";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Stamp = Database["public"]["Enums"]["report_stamp"];

/**
 * 스탬프 한 탭. 같은 것을 다시 누르면 취소 — 판정은 DB 함수(set_report_stamp)가 한다.
 * 돌려주는 값이 지금 상태다(null = 없음). 권한은 함수 안에서 is_pastor() 로 막힌다.
 */
export async function setStamp(reportId: string, stamp: Stamp): Promise<{ ok: true; stamp: Stamp | null } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_report_stamp", { p_report_id: reportId, p_stamp: stamp });
  if (error) return { ok: false, message: error.message };
  // 찍었을 때만 목장 리더에게 알린다(취소는 알리지 않는다). 껐다 켜도 한 번(stamped:<report>:<stamp>).
  const now = data ?? null;
  if (now) {
    after(async () => {
      const res = await notifyStamped(reportId, now);
      if (res?.skipped) console.log(`[push] stamped ${reportId} skipped=${res.skipped}`);
    });
  }
  return { ok: true, stamp: now };
}

/**
 * 목사님 한마디(2026-11-10) — 쓰기 · 고치기 · 지우기(빈 글). 200자까지, 판정은 DB 함수(set_report_note)가 한다.
 * 돌려주는 값이 지금 한마디(null = 없음). 남겼으면 목장 리더에게 알린다(처음 한 번 — 글은 싣지 않는다).
 */
export async function setNote(reportId: string, note: string): Promise<{ ok: true; note: string | null } | { ok: false; message: string }> {
  if (note.trim().length > 200) return { ok: false, message: "한마디는 200자까지예요" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_report_note", { p_report_id: reportId, p_note: note });
  if (error) return { ok: false, message: error.message };
  const now = data ?? null;
  if (now) {
    after(async () => {
      const res = await notifyNoted(reportId);
      if (res?.skipped) console.log(`[push] noted ${reportId} skipped=${res.skipped}`);
    });
  }
  return { ok: true, note: now };
}
