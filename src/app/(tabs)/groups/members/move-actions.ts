"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MoveResult = { ok: true; status?: string } | { ok: false; message: string };

/**
 * 목장 이동 신청 · 취소 · 수락 · 거절(2026-11-26). 권한과 규칙은 DB 함수(request · cancel · decide_group_move)가 본다.
 * 신청하면 받는 쪽 목장 리더에게, 처리하면 신청한 리더에게 웹 푸시(응답 뒤에).
 */
export async function requestMove(personId: string, toGroupId: string, note: string): Promise<MoveResult> {
  await requireAppUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_group_move", { p_person_id: personId, p_to_group_id: toGroupId, p_note: note.trim() || null });
  if (error || !data) return { ok: false, message: error?.message ?? "신청하지 못했습니다." };
  const id = data as string;
  after(async () => {
    const { notifyMoveRequest } = await import("@/lib/push/notify");
    await notifyMoveRequest(id).catch(() => null);
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelMove(id: string): Promise<MoveResult> {
  await requireAppUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_group_move", { p_id: id });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function decideMove(id: string, accept: boolean): Promise<MoveResult> {
  await requireAppUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_group_move", { p_id: id, p_accept: accept });
  if (error) return { ok: false, message: error.message };
  const status = (data as { status?: string } | null)?.status ?? "";
  if (status === "expired") return { ok: false, message: "기한(2주)이 지나 닫힌 신청이에요." };
  after(async () => {
    const { notifyMoveDecision } = await import("@/lib/push/notify");
    await notifyMoveDecision(id).catch(() => null);
  });
  revalidatePath("/", "layout");
  return { ok: true, status };
}
