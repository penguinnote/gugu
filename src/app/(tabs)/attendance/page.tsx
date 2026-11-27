import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { DownloadLink } from "@/components/download-link";
import { BTN, GuguSays, ICON, Icon } from "@/components/ui";
import { weekShort, type Book } from "@/lib/attendance-book";
import { loadAttendance, SCREEN_WEEKS } from "@/lib/attendance-data";
import { requireAppUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { currentWeekKey } from "@/lib/week";

import { AttendanceView } from "./attendance-view";
import { AttendanceWide } from "./attendance-wide";

export const metadata: Metadata = {
  title: "출석부 · 구구",
};

/**
 * 출석부(2026-11-16) — 앱을 쓰는 사람 모두(같은 날 사용자 결정으로 전체 공개 — 예전엔 운영자 · 목사님 · 임원진). 목장 보고서가 제출되면 그 주 예배 출석이 저절로 나온다(lib/attendance-book).
 * 화면은 최근 12주(횟수 · 비율은 시작 주부터 전부로 센 값), 목장별로 접혀 있고 이름으로 찾는다. 전체 기간 · 회원 명단 ·
 * 회원 자격 중지 · 온라인 비율 초과 표시는 엑셀에만(2026-11-16 사용자).
 */
export default async function AttendancePage() {
  const me = await requireAppUser();
  const supabase = await createClient();
  let book: Book | null = null;
  let skipped: string[] = [];
  try {
    ({ book, skipped } = await loadAttendance(supabase, me.leadsGroup ? me.groupId : null));
  } catch {
    book = null;
  }
  const rows = book?.groups.flatMap((g) => g.rows) ?? [];
  const hasAny = rows.some((r) => r.onsite + r.online + r.absent > 0);
  // 화면에는 최근 주만 — 칸은 자르고 횟수는 그대로
  const cut = book && book.weeks.length > SCREEN_WEEKS ? book.weeks.length - SCREEN_WEEKS : 0;
  const shown: Book | null = book && { ...book, weeks: book.weeks.slice(cut), groups: book.groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, marks: r.marks.slice(cut) })) })) };

  return (
    <>
      <AppHeader back={me.role === "admin" ? "/admin" : "/all"} wide />
      {/* 1024px 이상은 넓은 표(./attendance-wide) — 같은 출석부를 한 장으로. 휴대폰 배치만 있는 칸은 lg:hidden */}
      <main className="mx-auto flex w-full gg-col flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:max-w-[1200px] lg:px-8">
        <header className="flex items-baseline justify-between lg:items-end">
          <div className="lg:space-y-1">
            <h1 className="gg-display text-[26px] leading-tight lg:text-[28px]">출석부</h1>
            {shown && hasAny ? (
              <p className="hidden text-[14px] text-muted tabular-nums lg:block">
                {weekShort(book!.start)} 부터 {book!.weeks.length}주 · {rows.length}명
              </p>
            ) : null}
          </div>
          {hasAny ? <span className="text-[14px] font-semibold text-muted tabular-nums lg:hidden" data-testid="att-total">총 {rows.length}명</span> : null}
          {shown && hasAny ? (
            <DownloadLink href="/export/attendance" className={`${BTN("leaf", "sm")} hidden lg:inline-flex`} testId="att-xlsx-wide">
              <Icon d={ICON.export} className="h-4 w-4" strokeWidth={2.4} />
              엑셀 내려받기
            </DownloadLink>
          ) : null}
        </header>
        {!shown ? (
          <GuguSays mood="sleepy" size={72} lines={["출석부를 불러오지 못했어요.", "잠시 뒤 다시 열어 주세요."]} />
        ) : !hasAny ? (
          <GuguSays size={72} lines={["아직 출석 기록이 없어요.", "목장보고서가 제출되면 여기에 나와요."]} />
        ) : (
          <>
            <DownloadLink href="/export/attendance" className={`${BTN("leaf")} w-full lg:hidden`} testId="att-xlsx">
              <Icon d={ICON.export} className="h-5 w-5" strokeWidth={2.4} />
              출석부 엑셀
            </DownloadLink>
            <div className="contents lg:hidden">
              <AttendanceView book={shown} thisWeek={currentWeekKey()} />
            </div>
            <div className="hidden lg:block">
              <AttendanceWide book={book!} skipped={skipped} thisWeek={currentWeekKey()} />
            </div>
          </>
        )}
      </main>
    </>
  );
}
