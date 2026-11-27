import { getUserContext } from "@/lib/auth/session";
import { photoResponse } from "@/lib/profile-photo";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 명단 사람의 프로필 사진(2026-11-11) — 목장 프로필 '함께하는 사람' 동그라미. 승인된 앱 사용자 누구나(DB 함수 person_photo) */
export async function GET(_request: Request, { params }: { params: Promise<{ person: string; v: string }> }) {
  const { person } = await params;
  const me = await getUserContext();
  if (!me || me.role === "pending" || !UUID.test(person)) return new Response("Not Found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("person_photo", { p_person_id: person });
  return photoResponse(data);
}
