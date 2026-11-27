import { getUserContext } from "@/lib/auth/session";
import { loadActiveGroups, loadExportModel } from "@/lib/export/data";
import { watermarkText } from "@/lib/export/model";
import { parseExportParams, rangeLabel } from "@/lib/export/range";
import { buildWorkbook, exportFileName } from "@/lib/export/xlsx";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey, kstToday } from "@/lib/week";

/**
 * P-6 Excel 내려받기 — 목사님 · 자기 목장 리더(그 외 404, session.ts requireExport 와 같은 규칙). 순서가 통제다:
 *   ① 범위 검증  ② log_export() — 실패하면 내보내지 않는다  ③ 목사님 세션으로 읽기(RLS)  ④ 시트 5장(lib/export/xlsx.ts)
 * 로그가 내용보다 먼저다. 내용을 만들다 실패해도 "받으려 했다" 는 남는다.
 */
export async function GET(request: Request) {
  const me = await getUserContext();
  // 목사님은 고른 목장, 리더는 자기 목장 하나로 묶는다(2026-10-14) — 주소의 groups 는 보지 않는다. log_export 도 같은 규칙
  const ownGroup = me?.role === "pastor" ? null : me?.leadsGroup && me.groupId ? me.groupId : undefined;
  if (!me || ownGroup === undefined) return new Response("Not Found", { status: 404 });

  const supabase = await createClient();
  const active = await loadActiveGroups(supabase);
  const sp = new URL(request.url).searchParams;
  const parsed = parseExportParams(
    { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, groups: ownGroup ?? sp.get("groups") ?? undefined },
    currentWeekKey(),
    active.map((g) => g.id),
  );
  if (!parsed.ok) return new Response(parsed.message, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  const range = parsed.range;

  const { error: logError } = await supabase.rpc("log_export", {
    p_format: "xlsx",
    p_start: range.from,
    p_end: range.to,
    p_group_ids: range.groupIds, // null = 전체 목장 — 키를 빼면 인자가 없어 함수를 못 찾는다
  });
  if (logError) {
    return new Response(`기록을 남기지 못해 내보내지 않았습니다. ${logError.message}`, {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const model = await loadExportModel(supabase, range, active);
  const wb = buildWorkbook(model, { watermark: watermarkText(kstToday(), me.displayName), rangeLabel: rangeLabel(range.from, range.to) });
  const buffer = await wb.xlsx.writeBuffer();
  const name = exportFileName(range.from, range.to);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
