import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 목장 탭 배경 — 월드가 찍어 저장한 그 목장 집 안 사진(world_room_shots, WebP)을 그대로 돌려준다(2026-10-24).
 * 읽기는 RLS(승인된 앱 사용자)에 맡긴다. 주소 끝 [v] 는 저장 시각(쓰지 않는다) — 다시 찍으면 주소가 바뀌니 오래 담아 둬도 된다.
 * (쿼리 문자열 대신 경로에 둔다 — next/image 는 localPatterns 없이 쿼리가 붙은 로컬 주소를 받지 않는다)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ group: string; v: string }> }) {
  const { group } = await params;
  const me = await getUserContext();
  if (!me || me.role === "pending" || !UUID.test(group)) return new Response("Not Found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("world_room_shots").select("image").eq("group_id", group).maybeSingle();
  // bytea 는 '\x' 로 시작하는 16진 글자로 온다
  const hex = typeof data?.image === "string" && data.image.startsWith("\\x") ? data.image.slice(2) : null;
  if (!hex) return new Response("Not Found", { status: 404 });
  return new Response(Buffer.from(hex, "hex"), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable" },
  });
}
