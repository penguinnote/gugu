import { loadAttendance } from "@/lib/attendance-data";
import { getUserContext } from "@/lib/auth/session";
import { attendanceFileName, attendanceXlsxBuffer } from "@/lib/export/attendance-xlsx";
import { createClient } from "@/lib/supabase/server";

/**
 * 출석부 엑셀 내려받기(2026-11-16) — 앱을 쓰는 사람 모두(승인 대기는 404).
 * 시트 1 현장 예배 출석부 + 현장 · 온라인 출석부, 시트 2 회원 명단, 시트 3 요약(lib/export/attendance-xlsx). 기간은 출석부 시작 주 ~ 이번 주.
 * 순서가 통제다: ① 그 세션으로 읽기(함수가 권한을 본다)  ② log_attendance_export() — 실패하면 내보내지 않는다  ③ 파일
 */
export async function GET() {
  const me = await getUserContext();
  if (!me || me.role === "pending") return new Response("Not Found", { status: 404 });
  const supabase = await createClient();
  const { book } = await loadAttendance(supabase);
  if (book.weeks.length === 0) return new Response("아직 출석 기록이 없습니다.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const { error } = await supabase.rpc("log_attendance_export", { p_from: book.start, p_to: book.end });
  if (error) {
    return new Response(`기록을 남기지 못해 내보내지 않았습니다. ${error.message}`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const buffer = await attendanceXlsxBuffer(book);
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent(attendanceFileName(book))}`,
      "cache-control": "no-store",
    },
  });
}
