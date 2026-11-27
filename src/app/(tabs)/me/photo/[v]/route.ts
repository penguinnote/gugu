import { getUserContext } from "@/lib/auth/session";
import { photoResponse } from "@/lib/profile-photo";
import { createClient } from "@/lib/supabase/server";

/** 내 프로필 사진(2026-11-11) — 본인 것만 읽힌다(RLS). [v] 는 저장 시각(바뀌면 주소가 바뀐다) */
export async function GET() {
  const me = await getUserContext();
  if (!me || me.role === "pending") return new Response("Not Found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("profile_photos").select("image").maybeSingle();
  return photoResponse(data?.image);
}
