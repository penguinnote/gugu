import { getUserContext } from "@/lib/auth/session";
import { loadRosterModel } from "@/lib/export/roster-data";
import { rosterFileName } from "@/lib/export/roster-model";
import { buildRosterWorkbook } from "@/lib/export/roster-xlsx";
import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/week";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 명단 엑셀 내려받기(2026-10-28) — 교회가 쓰던 명단 엑셀과 같은 모양, 기준일은 오늘(KST).
 *   · 전체 명단(?group 없음) — 목사님 · 운영자 · 임원진(2026-10-30)
 *   · 목장 명단(?group=<id>) — 그 목장 리더 · 목사님 · 운영자. 같은 모양에 그 목장 사람만
 * 그 밖은 404. 순서가 통제다: ① log_roster_export() — 실패하면 내보내지 않는다  ② 그 세션으로 읽기(RLS)  ③ 시트 한 장
 */
export async function GET(request: Request) {
  const me = await getUserContext();
  const asked = new URL(request.url).searchParams.get("group");
  const groupId = asked && UUID.test(asked) ? asked : null;
  const anyGroup = me?.role === "pastor" || me?.role === "admin";
  const canAll = anyGroup || !!me?.isOfficer;
  const ownGroup = !!me && me.leadsGroup && me.groupId === groupId;
  if (!me || (asked && !groupId) || !(groupId ? anyGroup || ownGroup : canAll)) return new Response("Not Found", { status: 404 });

  const supabase = await createClient();
  const { error: logError } = await supabase.rpc("log_roster_export", groupId ? { p_group_id: groupId } : {});
  if (logError) {
    return new Response(`기록을 남기지 못해 내보내지 않았습니다. ${logError.message}`, {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const today = kstToday();
  const model = await loadRosterModel(supabase, today, groupId ?? undefined);
  const buffer = await buildRosterWorkbook(model).xlsx.writeBuffer();
  const name = rosterFileName(today, model.scope);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="roster.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
