"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth/session";
import { canEditProfile, normalizeProfileInput, type ProfileInput } from "@/lib/group-profile";
import { createClient } from "@/lib/supabase/server";

import type { SaveProfileResult } from "./profile-form";

const CONFLICT = "다른 리더가 방금 고쳤습니다. 다시 열어 주세요.";

/**
 * L-5b 저장. 행이 없으면 insert(프로덕션의 첫 편집), 있으면 **열 때의 updated_at 과 같을 때만** update —
 * 두 리더가 같은 프로필을 동시에 고치면 나중 사람이 조용히 덮어쓰지 않고 다시 연다.
 * 권한은 화면·여기·RLS 세 겹이다(canEditProfile 과 정책이 같은 규칙). updated_by 는 트리거가 세션 사용자로 채운다.
 */
export async function saveGroupProfile(
  groupId: string,
  input: ProfileInput & { expectedUpdatedAt: string | null },
): Promise<SaveProfileResult> {
  const me = await requireAppUser();
  if (!canEditProfile(me, groupId)) return { ok: false, message: "이 목장의 프로필은 고칠 수 없습니다." };

  const n = normalizeProfileInput(input);
  if (!n.ok) return n;
  const row = {
    verse: n.value.verse ?? null,
    intro: n.value.intro,
    free_text: n.value.freeText,
    ddays: n.value.ddays,
    theme_songs: n.value.themeSongs,
  };

  const supabase = await createClient();
  let updatedAt: string | null = null;

  if (input.expectedUpdatedAt === null) {
    const { data, error } = await supabase
      .from("group_profiles")
      .insert({ group_id: groupId, ...row })
      .select("updated_at")
      .maybeSingle();
    if (error?.code === "23505") return { ok: false, conflict: true, message: "다른 리더가 방금 프로필을 만들었습니다. 다시 열어 주세요." };
    if (error) return { ok: false, message: error.message };
    updatedAt = data?.updated_at ?? null;
  } else {
    const { data, error } = await supabase
      .from("group_profiles")
      .update(row)
      .eq("group_id", groupId)
      .eq("updated_at", input.expectedUpdatedAt)
      .select("updated_at")
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, conflict: true, message: CONFLICT };
    updatedAt = data.updated_at;
  }

  revalidatePath("/groups", "layout");
  return { ok: true, updatedAt: updatedAt ?? new Date().toISOString() };
}
