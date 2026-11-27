import { NextResponse } from "next/server";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 0 연결 확인용.
 *
 * 아직 테이블이 없으므로 테이블을 읽지 않는다. 확인하는 것은 두 가지다.
 *   1) 환경변수가 채워져 있고 Supabase 클라이언트가 에러 없이 만들어지는가
 *   2) 그 프로젝트 주소가 실제로 응답하는가
 *
 * 테이블 조회와 권한 확인은 로드맵 Step 1~2에서 따로 다룬다.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  let url: string;
  try {
    url = getSupabaseUrl();
    getSupabasePublishableKey();
    checks.env = "ok";
  } catch (error) {
    checks.env = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    await supabase.auth.getClaims();
    checks.client = "ok";
  } catch (error) {
    checks.client = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: getSupabasePublishableKey() },
      cache: "no-store",
    });
    checks.reachable = response.ok ? "ok" : `HTTP ${response.status}`;
  } catch (error) {
    checks.reachable = error instanceof Error ? error.message : "알 수 없는 오류";
  }

  const ok = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
