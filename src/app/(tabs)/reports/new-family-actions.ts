"use server";

import { after } from "next/server";

import { addMember } from "@/app/(tabs)/groups/members/actions";
import { requireAppUser } from "@/lib/auth/session";
import { emptyForm } from "@/lib/roster-edit";

/**
 * 새가족 추가 — 이름만. 지금 목장에 양으로, 들어온 날은 이 보고서의 주(이번 주 출석부터 적힌다). 권한 · 기본값은 명단의 사람 더하기(addMember)와 같다.
 * 나머지 칸은 나중에 우리 목장 명단에서 채운다. 훈련단계는 '없음'으로 시작한다(새가족반을 늦게 듣는 사람도 있다, 2026-11-26 사용자).
 */
export async function addNewFamily(weekKey: string, name: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const me = await requireAppUser();
  if (!me.leadsGroup || !me.groupId) return { ok: false, message: "우리 목장 리더만 넣을 수 있습니다." };
  const r = await addMember(me.groupId, { ...emptyForm(), name: name.trim(), group_role: "member" }, weekKey);
  if (!r.ok) return { ok: false, message: r.message };
  if (!r.id) return { ok: false, message: "넣지 못했습니다." };
  // 목사님과 그 목장 리더들에게 "OO 목장에 OOO이 새로 들어왔어요!"(2026-11-26) — 응답 뒤에, 넣은 리더는 빼고
  const id = r.id;
  after(async () => {
    const { notifyNewFamily } = await import("@/lib/push/notify");
    await notifyNewFamily(id, me.userId).catch(() => null);
  });
  return { ok: true, id };
}
