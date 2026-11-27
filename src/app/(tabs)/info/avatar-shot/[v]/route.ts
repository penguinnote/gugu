import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * 정보 탭 배경 — 월드가 찍어 저장한 내 아바타 사진(world_avatar_shots, WebP)을 그대로 돌려준다(2026-10-25).
 * 본인 것만 읽힌다(RLS). 주소 끝 [v] 는 저장 시각(쓰지 않는다) — 다시 찍으면 주소가 바뀌니 오래 담아 둬도 된다.
 */
export async function GET() {
  const me = await getUserContext();
  if (!me || me.role === "pending") return new Response("Not Found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("world_avatar_shots").select("image").maybeSingle();
  // bytea 는 '\x' 로 시작하는 16진 글자로 온다
  const hex = typeof data?.image === "string" && data.image.startsWith("\\x") ? data.image.slice(2) : null;
  if (!hex) return new Response("Not Found", { status: 404 });
  return new Response(Buffer.from(hex, "hex"), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable" },
  });
}
