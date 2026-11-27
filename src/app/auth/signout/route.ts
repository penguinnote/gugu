import { NextResponse, type NextRequest } from "next/server";

import { absoluteUrl } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * 로그아웃.
 *
 * GET 이 아니라 POST 다. 링크 프리페치나 이미지 태그로 남을 로그아웃시킬 수
 * 있으면 안 되기 때문이다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(absoluteUrl("/login", request.headers), { status: 303 });
}
