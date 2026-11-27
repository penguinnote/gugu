import { AbsenceStreakSection } from "@/components/absence-streaks";
import { PersonSummaryCard } from "@/components/person-summary";
import { buildPersonSummary } from "@/lib/person-summary";
import { AttendanceView } from "@/app/(tabs)/attendance/attendance-view";
import { AttendanceWide } from "@/app/(tabs)/attendance/attendance-wide";
import { bookWeeks, buildBook } from "@/lib/attendance-book";
import { notFound } from "next/navigation";

import { BlindSpotSection } from "@/components/blind-spots";
import { GroupNotesSection, PrayerFlowSection } from "@/components/pastor-digest";
import { AppHeader } from "@/components/app-header";
import { PageLoading } from "@/components/page-loading";
import { PushSettings } from "@/components/push-settings";
import { ProfileHeader, PROFILE_BTN } from "@/components/profile/profile-header";
import { ProfileEditSheet } from "../../me/profile-edit-sheet";
import { GroupCards } from "../../groups/group-cards";
import { FixedPage, GLASS_PILL, TabTitle } from "@/components/tab-title";
import type { BlindSpotPerson } from "@/lib/blind-spots";
import { allMenuFor } from "@/lib/all-menu";
import { addDays, currentWeekKey, kstToday } from "@/lib/week";

import { BerryCount } from "../../home/berry-count";
import { HOME_FIT, HOME_MAIN, HomeHero } from "../../home/launcher";
import { LeaderHero, type LeaderWeek } from "../../home/leader-status";
import { PushPrompt } from "../../home/push-prompt";
import { AdminHero, OfficerHero, PastorHero } from "../../home/role-status";
import { AllMenu } from "../../all/all-menu";
import { NoteBox } from "../../pastor/reports/[group]/note-box";
import { StreakLine } from "../../home/streak-line";
import { WorldLoadingPreview } from "./world-preview";
import { PastorWidePreview, PeopleWidePreview } from "./wide-preview";
import { AiDigestPreview } from "./ai-digest-preview";
import { RosterExport } from "@/components/roster-export";
import { TossCard } from "@/components/toss";
import { MenuList } from "@/components/menu-list";
import { AdminSummary } from "../../admin/admin-summary";
import { PushStatusTable } from "../../admin/push/push-status-table";
import { ExportForm } from "../../export/export-form";
import { MemberForm } from "../../groups/members/member-form";
import { MemberList, type MemberRow } from "../../groups/members/member-list";
import { VillagePicker } from "../../groups/members/village-picker";
import { emptyForm } from "@/lib/roster-edit";
import { RecordsList, RecordsMine } from "../../records/records-view";
import { ProfileView } from "../../groups/[name]/profile-view";
import type { MemberRow as ProfileMember } from "@/lib/group-profile";
import { ShopView } from "../../shop/shop-view";
import { ReportForm, type PersonRow } from "../../reports/report-form";
import { InstallGuide } from "@/components/install-guide/install-guide";
import { GuguChatPreview, PersonFlowPreview, ProfileFormPreview, ReportMemoPreview } from "./gugu-ai-preview";
import { ChatRequestsCard } from "../../approvals/chat-requests";
import type { InstallEnv } from "@/lib/install-env";
import { InsetsProbe } from "../insets/insets-probe";
import { MoveInbox, type MoveItem } from "../../groups/members/move-inbox";
import { MoveRequest } from "../../groups/members/move-request";
import { ApproveAll } from "../../approvals/approve-all";
import { FeedbackSection } from "../../pastor/feedback";
import { WeekPicker } from "../../pastor/week-picker";
import { SkipGiftPopup } from "../../home/skip-gift";
import { CARD } from "@/components/ui";

/**
 * 디자인 확인 화면 — **개발 서버에서만**(운영·프리뷰 빌드에서는 404). 지어낸 사람·목장으로 화면을 그려
 * 운영 DB 를 건드리지 않고 모양을 본다(보고서 작성 화면은 열기만 해도 그 주 보고서가 생기므로 여기서만 본다).
 *   /dev/design?screen=report | groups | records(&state=pastor) | home(&state=todo|late|done|reviewed|prayed|noted|skipped|pastor|admin|adminleader|officer)(&offer=1|buy|short — 쿠폰 칸)
 *                         | world(&state=loading|failed|report|home|shell&p=0.45) | shop(&viewer=1) | members | member
 *                         | roster-export(&as=leader|admin|pastor) | digest(목사님 주간 정리) · home 에 &prompt=push|install 이면 알림 켜기 팝업
 *                         | all(&state=leader|pastor|admin|adminleader|officer — 전체 탭) | note(목사님 한마디 칸)
 *                         | ai(&state=make|ready|fail|regen-fail|empty|last — AI 정리 칸 + 운영 카드, 단추는 서버를 부르지 않는다)
 *                         | chat-requests(승인 화면 챗봇 추가 신청 카드) · gugu(구구 챗봇 · &quota=12|full|again|pending|rejected 질문 횟수) · home 에 &gugu=1 이면 목장 이름 왼쪽 구구가 챗봇 입구 · flow(&fail=1 — 사람별 흐름 요약 카드) · report 에 &ai=1 이면 '모임 메모로 채우기'(가짜 답)
 *                         | install(&env=safari26|safari18|crios|kakao-ios|inapp-ios|samsung|chrome|prompt|kakao-and|inapp-and — 웹앱 설치 안내)
 * 이름은 모두 지어낸 것이다.
 */
/** 디자인 확인 — 명단 편집 저장을 흉내 낸다(아무것도 쓰지 않는다) */
async function designSaveRoster() {
  "use server";
  return { ok: true as const };
}

/** 디자인 확인 — 새가족 추가의 답을 지어낸다(아무것도 쓰지 않는다) */
async function designAddNewFamily(_week: string, name: string) {
  "use server";
  return { ok: true as const, id: `new-${name}` };
}
async function designNoop() {
  "use server";
}

/** 목장 이동 신청 예시(2026-11-26) */
const MOVES: MoveItem[] = [
  { id: "m1", person_name: "한별", from_group_name: "나래", to_group_name: "가온", direction: "push", note: "이사해서 가까운 목장으로", requester_name: "윤슬", can_decide: true, mine: false },
  { id: "m2", person_name: "다온", from_group_name: "가온", to_group_name: "초록", direction: "push", note: null, requester_name: "가람", can_decide: false, mine: true },
];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const sp = await searchParams;
  const screen = typeof sp.screen === "string" ? sp.screen : "report";
  const week = currentWeekKey();
  const today = kstToday();

  if (screen === "shop") {
    const it = (id: string, name: string, cat: "house" | "fence" | "nature" | "prop" | "wear" | "ticket", price: number, blurb: string, slot: string | null = null) => ({ id, name, cat, price, blurb, slot });
    return (
      <ShopView
        items={[
          it("cabin", "초록 지붕 집", "house", 30, "초록 지붕의 아담한 집"),
          it("redhouse", "빨간 지붕 집", "house", 60, "빨간 지붕, 하얀 벽의 집"),
          it("wood", "나무 울타리", "fence", 20, "목장 둘레를 두르는 나무 울타리"),
          it("picket", "하얀 울타리", "fence", 25, "하얀 말뚝 울타리"),
          it("apple", "둥근 나무", "nature", 15, "그늘이 넓은 둥근 나무"),
          it("tulips", "꽃밭", "nature", 10, "알록달록 작은 꽃밭"),
          it("swing", "그네", "prop", 55, "나란히 타는 그네"),
          it("slide", "미끄럼틀", "prop", 65, "쭉 내려오는 미끄럼틀"),
          it("strawhat", "밀짚모자", "wear", 40, "햇볕 가리는 넓은 챙", "hat"),
          it("balloon", "풍선", "wear", 35, "손에 쥔 노란 풍선", "hand"),
          it("freeze", "연속 지키기 쿠폰", "ticket", 80, "놓친 주를 지켜 주는 쿠폰"),
        ]}
        owned={{ cabin: 1, wood: 1, freeze: 1 }}
        berries={sp.viewer === "1" ? null : 58}
        groupName="가온"
        couponMax={2}
      />
    );
  }

  // 목장 명단 · 명단 고치기(2026-10-28) — 지어낸 사람
  if (screen === "members" || screen === "member") {
    const M = (id: string, name: string, extra: Partial<MemberRow> = {}): MemberRow => ({
      id, name, group_role: "member", is_group_head: false, training_stage: "새가족반", birth_year: 2003, gender: "female",
      occupation: "대학생", affiliation: "한빛대", youth_member: true, assembly_member: false, ...extra,
    });
    const people = [
      M("00000000-0000-0000-0000-000000000001", "가람", { group_role: "leader", is_group_head: true, training_stage: "목자", birth_year: 1997, gender: "male", occupation: "직장인", affiliation: "한빛전자(서울)" }),
      M("00000000-0000-0000-0000-000000000002", "나리", { group_role: "leader", training_stage: "목동", birth_year: 2000 }),
      M("00000000-0000-0000-0000-000000000003", "다온", { training_stage: "제자반", birth_year: 2002, gender: "male", occupation: "취준생", affiliation: null }),
      M("00000000-0000-0000-0000-000000000004", "라희", { training_stage: null, occupation: null, affiliation: null }),
    ];
    const serves = new Map([
      ["00000000-0000-0000-0000-000000000001", ["찬양팀", "임원진"]],
      ["00000000-0000-0000-0000-000000000003", ["주일학교"]],
    ]);
    const ministries = ["찬양팀", "임원진", "수찬기", "국제사역부", "주일학교", "사회자", "교회 안내", "통역", "방송실", "예배 반주", "홈페이지", "동아리", "새가족 안내"].map((name, i) => ({ id: `m${i}`, name }));
    return (
      <>
      {/* 안쪽 화면 머리(2026-11-11 B안) — ‹ 단추만, 큰 제목은 내용 맨 위 */}
      <AppHeader back="/all" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">가온 목장 명단</h1>
        {screen === "members" ? (
          <>
            <MoveInbox items={MOVES} />
            <MemberList people={people} serves={serves} />
            <VillagePicker groupId="g1" value="믿음" options={["믿음", "소망", "사랑", "은혜"]} />
          </>
        ) : (
          <MemberForm
            mode="edit"
            initial={{ ...emptyForm(), name: "다온", group_role: "member", training_stage: "제자반", birth_year: "2002", gender: "male", occupation: "취준생", youth_member: true, note: "주말 근무", ministries: ["m4"] }}
            ministries={ministries}
            personId="00000000-0000-0000-0000-000000000003"
            groupId="g1"
            expectedUpdatedAt="t"
            listHref="/groups/members"
            // &role=pastor 면 목사님 화면(구분 칸 보임), 아니면 리더 화면(구분 칸 없음, 2026-11-26)
            canChooseRole={sp.role === "pastor"}
            canMarkLeft
            thisYear={2026}
            beforeSave={
              sp.role !== "pastor" ? (
                <MoveRequest
                  personId="00000000-0000-0000-0000-000000000003"
                  groupId="g1"
                  groups={[{ id: "g1", name: "가온" }, { id: "g2", name: "나래" }, { id: "g10", name: "초록" }]}
                  pending={sp.move === "pending" ? MOVES[1] : null}
                />
              ) : null
            }
          />
        )}
      </main>
      </>
    );
  }

  // 전체 명단 화면 위 명단 엑셀 카드(2026-10-28, 10-29 내보내기에서 옮김) — 단추만 본다(누르면 실제로 받는다)
  if (screen === "roster-export") {
    const as = typeof sp.as === "string" ? sp.as : "leader";
    const gs = [
      { id: "00000000-0000-0000-0000-0000000000a1", name: "가온" },
      { id: "00000000-0000-0000-0000-0000000000a2", name: "나래" },
    ];
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-5 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">내보내기</h1>
        <RosterExport canAll={as !== "leader"} ownGroup={as === "pastor" ? null : gs[0].id} groups={as === "pastor" ? gs : [gs[0]]} />
      </main>
    );
  }

  // 운영 화면(2026-11-11 토스 결) — 운영 홈 · 알림 등록 현황 · 보고서 내려받기를 한 장에. 가짜 값
  if (screen === "ops") {
    const wk = currentWeekKey();
    const gs = ["가온", "나래", "다솜", "라온"].map((name, i) => ({ id: `00000000-0000-0000-0000-0000000000b${i}`, name }));
    return (
      <>
        <AppHeader back="/all" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <h1 className="gg-display text-[26px] leading-tight">운영</h1>
          <TossCard>
            <AdminSummary
              title="할 일"
              cards={[
                { href: "/approvals", icon: "approve", title: "승인 대기", value: "2건", note: "", warn: true },
                { href: "/admin/push", icon: "bell", title: "알림 미등록", value: "3 / 14명", note: "", warn: true },
                { href: "/admin/weeks", icon: "calendar", title: "이번 주", value: "모임 있음", note: "11월 8일" },
                { href: "/admin/exports", icon: "export", title: "내보내기 기록", value: "이번 달 4건", note: "" },
              ]}
            />
            <AdminSummary
              title="상태"
              testId="admin-status"
              cards={[
                { href: null, icon: "history", title: "보관 만료", value: "0건", note: "24개월 · 기준 2024-11-10 이전 · 마지막 정리 2026-11-01" },
                { href: null, icon: "hourglass", title: "명단 갱신", value: "2026-10-18", note: "" },
              ]}
            />
            <MenuList
              idPrefix="admin"
              itemTestId="admin-item"
              sections={[
                {
                  title: "관리",
                  items: [
                    { href: "/admin/people", label: "명단 관리", icon: "people", hint: "사람 · 계정 연결" },
                    { href: "/admin/accounts", label: "계정 권한", icon: "me", hint: "역할" },
                  ],
                },
              ]}
            />
          </TossCard>
          <h1 className="gg-display pt-6 text-[26px] leading-tight">알림 등록 현황</h1>
          <PushStatusTable
            rows={[
              { userId: "u1", name: "김가온", roleLabel: "리더", groupLabel: "가온 목장", devices: 0, lastSuccess: null },
              { userId: "u2", name: "이목사", roleLabel: "목사님", groupLabel: null, devices: 0, lastSuccess: null },
              { userId: "u3", name: "박나래", roleLabel: "리더", groupLabel: "나래 목장", devices: 2, lastSuccess: "오늘 오전 9:00" },
            ]}
          />
          <h1 className="gg-display pt-6 text-[26px] leading-tight">목장보고서 내려받기</h1>
          <ExportForm groups={gs} thisWeek={wk} weekOptions={[wk, addDays(wk, -7), addDays(wk, -14)]} />
          <h1 className="gg-display pt-6 text-[26px] leading-tight">명단 엑셀</h1>
          <RosterExport canAll ownGroup={null} groups={gs} />
        </main>
      </>
    );
  }

  if (screen === "world") {
    const state = typeof sp.state === "string" ? sp.state : "loading";
    return <WorldLoadingPreview state={state} p={typeof sp.p === "string" ? Number(sp.p) : 0.45} />;
  }

  if (screen === "chat-requests") {
    // 승인 화면의 구구 챗봇 추가 신청 카드(지어낸 신청) — 단추는 아무 일도 하지 않는다
    async function noop() {
      "use server";
    }
    const at = new Date().toISOString();
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-[calc(var(--nn-safe-top)+24px)] pb-8">
        <h1 className="gg-display text-[26px] leading-tight">승인 대기</h1>
        <ChatRequestsCard
          action={noop}
          chats={[
            { id: "r1", user_id: "u1", name: "이나래", group_name: "가온", used: 25, quota: 25, reason: "행사 준비로 질문이 많았어요", created_at: at, mine: false },
            { id: "r2", user_id: "u2", name: "박다솜", group_name: "새싹", used: 25, quota: 25, reason: null, created_at: at, mine: false },
            { id: "r3", user_id: "u3", name: "김가온", group_name: "토브", used: 25, quota: 25, reason: "목장 모임 준비", created_at: at, mine: true },
          ]}
        />
      </main>
    );
  }
  if (screen === "absences") {
    // 연속 결석(2026-11-17) — 지어낸 사람
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-4 pb-8">
        <AbsenceStreakSection
          people={sp.empty === "1" ? [] : [
            { id: "a", name: "이나윤", group: "가온", weeks: 4, contacted: false, since: addDays(week, -21) },
            { id: "b", name: "김가람", group: "하늘", weeks: 2, contacted: true, since: addDays(week, -7) },
          ]}
        />
      </main>
    );
  }
  if (screen === "person-summary") {
    // 사람별 기록 정리(2026-11-16) — 지어낸 26주
    const upTo = addDays(week, -7);
    const recs = Array.from({ length: 26 }, (_, i) => addDays(upTo, -7 * i)).flatMap((w, i) => {
      if (i === 5 || i === 11) return [];
      const absent = i < 2 || i === 9;
      const online = !absent && i % 4 === 3;
      return [{
        week_key: w, worship_attended: !absent, worship_online: online, group_meeting_attended: !absent && i % 3 !== 0, one_on_one_contacted: i % 2 === 0,
        prayer_request: i % 3 === 0 ? ["이직 준비 중 지혜를 주시도록", "가족 건강", "시험 잘 볼 수 있도록", "새 직장에 잘 적응하도록"][i % 4] : null,
        online_reason: online ? "출장" : null, meeting_absent_reason: !absent && i % 3 === 0 ? "야근" : null, absent_reason: absent ? (i === 9 ? "감기" : "여행") : null,
      }];
    });
    const summary = buildPersonSummary({ upTo, joinedWeek: null, skipped: [addDays(upTo, -7 * 11)], records: recs });
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-4 pb-8">
        <h1 className="gg-display text-[26px] leading-tight">김가온</h1>
        <PersonSummaryCard summary={summary} />
      </main>
    );
  }
  if (screen === "attendance") {
    // 출석부 표(2026-11-16) — 지어낸 사람 · 출석. ?weeks=12
    const weeks = bookWeeks("2026-11-22", "2027-12-31").slice(0, typeof sp.weeks === "string" ? Number(sp.weeks) : 8);
    const names = ["김가온", "이나래", "박도윤", "최하늘", "정다온", "한서준", "윤소담", "강이든", "조하람", "임채원"];
    const groups = [{ id: "g1", name: "가온", number: 1 }, { id: "g2", name: "나래", number: 2 }];
    const people = names.map((name, i) => ({ id: `p${i}`, name, group_id: i < 5 ? "g1" : "g2", group_role: i % 5 === 0 ? "leader" : "member", is_group_head: i % 5 === 0, care_status: i === 8 ? "military" : "active", assembly_member: i !== 3, campus: null, attendance_off: i === 2 ? "교환" : null }));
    const records = people.flatMap((p, pi) => weeks.flatMap((w, wi) => (pi === 4 && wi < 2 ? [] : [{ person_id: p.id, week_key: w, onsite: pi === 9 ? false : (pi + wi) % 4 !== 0, online: pi !== 9 && (pi + wi) % 4 === 0 && pi % 2 === 1 }])));
    // 넓은 화면(2026-11-27, 1024px 이상)은 한 장짜리 표 — 둘째 주를 휴주로 지어낸다
    const book = buildBook({ weeks: weeks.filter((_, i) => i !== 1), groups, people, records: records.filter((r) => r.week_key !== weeks[1]), own: "g2" });
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-4 pb-8 lg:max-w-[1200px] lg:px-8">
        <h1 className="gg-display text-[26px] leading-tight">출석부</h1>
        <div className="contents lg:hidden">
          <AttendanceView book={buildBook({ weeks, groups, people, records, own: "g2" })} thisWeek={weeks[weeks.length - 1]} />
        </div>
        <div className="hidden lg:block">
          <AttendanceWide book={book} skipped={[weeks[1]]} thisWeek={weeks[weeks.length - 1]} />
        </div>
      </main>
    );
  }
  // 화면 진단(2026-11-23) — /dev/insets 는 로그인해야 열려 여기서도 본다
  if (screen === "insets") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-5 pt-[calc(var(--nn-safe-top)+24px)] pb-8">
        <h1 className="gg-display text-[26px] leading-tight">화면 진단</h1>
        <InsetsProbe />
      </main>
    );
  }
  if (screen === "profile-edit") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-[calc(var(--nn-safe-top)+24px)] pb-8">
        <h1 className="gg-display text-[26px] leading-tight">프로필 편집</h1>
        <ProfileFormPreview today={kstToday()} />
      </main>
    );
  }
  if (screen === "gugu") return <GuguChatPreview quota={typeof sp.quota === "string" ? sp.quota : undefined} />;
  if (screen === "flow") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-[calc(var(--nn-safe-top)+24px)] pb-8">
        <h1 className="gg-display text-[26px]">박다솜</h1>
        <PersonFlowPreview fail={sp.fail === "1"} />
      </main>
    );
  }

  if (screen === "install") {
    const ENVS: Record<string, InstallEnv> = {
      safari26: { os: "ios", browser: "safari", safari: 26 },
      safari18: { os: "ios", browser: "safari", safari: 18 },
      crios: { os: "ios", browser: "other", safari: 0 },
      "kakao-ios": { os: "ios", browser: "kakao", safari: 0 },
      "inapp-ios": { os: "ios", browser: "inapp", safari: 0 },
      samsung: { os: "android", browser: "samsung", safari: 0 },
      chrome: { os: "android", browser: "chrome", safari: 0 },
      prompt: { os: "android", browser: "chrome", safari: 0 },
      "kakao-and": { os: "android", browser: "kakao", safari: 0 },
      "inapp-and": { os: "android", browser: "inapp", safari: 0 },
    };
    const key = typeof sp.env === "string" && sp.env in ENVS ? sp.env : "safari26";
    return (
      <div className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--background)]">
        <InstallGuide key={key} env={ENVS[key]} canPrompt={key === "prompt"} />
      </div>
    );
  }

  // 승인 화면 '모두 승인'(2026-11-26) — 단추와 건너뛴 신청 한 장
  if (screen === "approvals") {
    return (
      <>
        <AppHeader back="/all" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <h1 className="gg-display text-[26px] leading-tight">승인 대기</h1>
          <ApproveAll count={3} action={designNoop} />
          <section className={`${CARD} space-y-1.5 p-4`}>
            <p className="text-sm">
              <strong className="font-bold">윤슬</strong>
              <span className="text-muted"> · 구글 계정이</span>
            </p>
            <p className="rounded-xl bg-[var(--gg-stone-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--gg-stone-ink)]">모두 승인에서 건너뜀 · 같은 이름을 두 사람이 골랐어요</p>
            <p className="gg-display text-[20px] leading-snug">나래 목장 한별</p>
          </section>
        </main>
      </>
    );
  }

  // 목사님 — 목장 보고서 피드백 현황(미확인 · 확인됨) · 주 고르기(2026-11-26)
  // 넓은 화면(2026-11-27) — 1024px 이상에서 보기. 왼쪽 메뉴는 쿠키 gg-dev-nav=leader|pastor|admin|officer 로(탭 레이아웃)
  if (screen === "pastor-wide") return <PastorWidePreview week={week} g={typeof sp.g === "string" ? sp.g : null} />;
  if (screen === "people-wide") return <PeopleWidePreview p={typeof sp.p === "string" ? sp.p : null} />;

  if (screen === "unstamped") {
    const row = (i: number, g: string, w: number, note?: string) => ({ report_id: `r${i}`, week_key: addDays(week, -7 * w), group_name: g, is_late: i === 3, note });
    return (
      <>
        <AppHeader back="/" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <FeedbackSection
            pending={{ rows: [row(1, "가온", 0), row(2, "나래", 0), row(3, "초록", 1), row(4, "하람", 2), row(5, "바다", 5)], total: 9, moreHref: "/dev/design?screen=unstamped&more=10" }}
            done={{ rows: [row(6, "다솜", 0, "기도하겠습니다"), row(7, "라온", 0, "기도하겠습니다"), row(8, "마루", 1, "기도하겠습니다")], total: 3, moreHref: null }}
          />
          <nav className="flex items-center justify-center">
            <WeekPicker weekKey={week} thisWeek={week} basePath="/dev/design" />
          </nav>
        </main>
      </>
    );
  }

  if (screen === "home") {
    const state = typeof sp.state === "string" ? sp.state : "todo";
    const streak = { streak: 3, currentIncluded: ["done", "reviewed", "prayed", "noted"].includes(state), everOnTime: true, broken: false };
    // 제출 시각은 그 주 일요일 저녁 8시(한국 시간)로 지어낸다 — 렌더 중 Date.now() 를 쓰지 않는다
    const at = `${week}T11:00:00.000Z`;
    const lw: LeaderWeek = {
      skipped: state === "skipped",
      report: ["done", "reviewed", "prayed", "noted"].includes(state) ? { id: "r1", submitted_at: at, is_late: false } : null,
      review: ["reviewed", "prayed", "noted"].includes(state) ? { report_id: "r1", first_read_at: at, stamp: state === "reviewed" ? null : "pray", note: state === "noted" ? "이번 주 새 친구가 왔다니 정말 기뻐요. 다음 주에도 잘 챙겨 주세요!" : null } : null,
      streak,
      // 홈 카드 두 줄 — &care=0 이면 돌봄 0명, &att=none 이면 출석부 줄 없음, &att=n 이면 이번 주 n명(2026-11-16, 예전 디데이)
      care: sp.care === "none" ? null : typeof sp.care === "string" ? Number(sp.care) : 2,
      // &moves=n — 목장 이동 신청 줄(2026-11-26)
      moves: typeof sp.moves === "string" ? Number(sp.moves) : null,
    };
    // adminleader — 운영자 겸 리더(리더 바로가기 + 운영, 2026-11-10)
    const role = state === "pastor" ? "pastor" : state === "admin" || state === "adminleader" ? "admin" : state === "officer" ? "officer" : "leader";
    // 늦은 주를 보이려면 지난주 키를 쓴다(마감이 지난 주)
    const wk = state === "late" ? addDays(week, -7) : sp.fresh === "1" ? addDays(week, 7) : week;
    const lead = role === "leader" || state === "adminleader";
    return (
      <div className={HOME_FIT} data-no-scroll>
        <HomeHero
          title={lead ? "가온 목장" : "구구"}
          gugu={sp.gugu === "1"}
          aside={
            lead ? (
              <>
                <StreakLine streak={streak} variant="chip" />
                <BerryCount berries={128} groupName="가온" />
              </>
            ) : null
          }
        />
        <main className={HOME_MAIN}>
          {role === "pastor" ? (
            <PastorHero weekKey={wk} week={{ total: 12, submitted: typeof sp.n === "string" ? Number(sp.n) : 7, skipped: null }} now={new Date()} />
          ) : role === "admin" && !lead ? (
            <AdminHero weekKey={wk} week={{ pending: typeof sp.n === "string" ? Number(sp.n) : 2, skipped: sp.skip === "1", total: 12, submitted: 7, quiet: 3 }} />
          ) : role === "officer" ? (
            <OfficerHero weekKey={wk} />
          ) : (
            <div className="flex flex-col gap-3">
              <LeaderHero weekKey={wk} week={lw} offer={sp.offer ? { berries: sp.offer === "short" ? 30 : 120, coupons: sp.offer === "1" ? 1 : 0, coupon_price: 80, freeze_week: addDays(wk, -7), freeze_keeps: 3, freezes_used: 0, freezes_per_term: 2 } : null} serverNow={new Date()} chat={sp.gugu === "1"} />
              {sp.prompt === "push" || sp.prompt === "install" ? <PushPrompt preview={sp.prompt} /> : null}
              {/* &gift=1 — 휴주 선물 팝업(2026-11-26) */}
              {sp.gift === "1" ? <SkipGiftPopup weeks={[week]} total={200} /> : null}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (screen === "records") {
    // 기록 탭(2026-11-10) — 지어낸 목장 열둘. 3번(가온)이 우리 목장(state=pastor 면 우리 목장 없이)
    const state = typeof sp.state === "string" ? sp.state : "leader";
    const names = ["새싹", "다온", "가온", "토브", "온새미", "늘봄", "한울", "보람", "나래", "미리내", "아라", "은솔"];
    const streaks = [4, 0, 7, 2, 12, 1, 0, 3, 5, 0, 9, 2];
    const rows = names.map((name, i) => ({ group_id: `g${i + 1}`, number: i + 1, name, streak: streaks[i], berries: 60 + streaks[i] * 37 + ((i * 53) % 90) }));
    return (
      <FixedPage header={<TabTitle title="기록" photo="/home/hd-records-sym.webp" pin pinMid />} stuck={state === "pastor" ? null : <RecordsMine rows={rows} mine="g3" />}>
        <div className="mx-auto w-full max-w-sm px-4 pb-8">
          <RecordsList rows={rows} mine={state === "pastor" ? null : "g3"} />
        </div>
      </FixedPage>
    );
  }

  if (screen === "note") {
    // 목사님 한마디 칸(2026-11-10) — 빈 칸과 보낸 칸. 보내기는 목사님 로그인이 없으면 거절된다(DB 를 건드리지 않는다)
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-5 pt-5 pb-8">
        <NoteBox reportId="00000000-0000-0000-0000-000000000000" initial={null} />
        <NoteBox reportId="00000000-0000-0000-0000-000000000000" initial="이번 주 새 친구가 왔다니 정말 기뻐요. 다음 주에도 잘 챙겨 주세요!" />
      </main>
    );
  }

  if (screen === "all") {
    // 전체 탭(2026-11-10) — 역할마다 메뉴. 운영자는 승인 대기 2건
    const state = typeof sp.state === "string" ? sp.state : "leader";
    const role = state === "pastor" ? "pastor" : state === "admin" || state === "adminleader" ? "admin" : state === "officer" ? "officer" : "leader";
    const me = { role, leadsGroup: state === "leader" || state === "adminleader" } as const;
    return <AllMenu name="김가온" diag={role === "admin"} sections={allMenuFor(me, { pending: role === "admin" ? 2 : 0, ai: sp.ai !== "0", digest: true, week })} />;
  }

  if (screen === "ai") {
    // AI 정리(2026-11-08) — 목사님 홈의 AI 정리 칸(운영 홈 카드는 2026-11-26 뺐다)
    const state = typeof sp.state === "string" ? sp.state : "make";
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-5 pb-8">
        <AiDigestPreview state={state} weekKey={week} />
      </main>
    );
  }

  if (screen === "digest") {
    // 목사님 주간 정리 v1(2026-11-05) — 제출 현황 아래의 사각지대 변화 · 기도제목 · 특이사항
    const sp = (id: string, name: string, groupName: string, extra: Partial<BlindSpotPerson> = {}): BlindSpotPerson => ({
      person_id: id, name, groupName, group_id: "g1", group_role: "member", care_status: "active", contact_gap: true, meeting_gap: true,
      contact_leaders: 0, last_contact_week: addDays(week, -35), last_meeting_week: addDays(week, -42), needs_check: false, state: "judged",
      weeks_recorded: 4, window_start: addDays(week, -28), window_end: addDays(week, -7), absent_streak: false,
      last_worship_week: addDays(week, -7), ...extra,
    });
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-5 pb-8">
        <BlindSpotSection
          showGroup
          change={{ added: new Set(["p2"]), left: 1 }}
          summary={{ state: "judged", windowStart: addDays(week, -28), windowEnd: addDays(week, -7), spots: [sp("p1", "김하늘", "가온", { absent_streak: true }), sp("p2", "이바람", "나래")], priority: 1, singleLinks: [], judged: 40, newcomers: 2 }}
        />
        <PrayerFlowSection
          flow={{
            total: 63,
            firstEver: 3,
            long: [
              { personId: "q1", name: "박구름", groupName: "다솜", weeks: 7, text: "어머니 수술이 잘 끝나고 회복이 빠르도록. 병원비 걱정도 내려놓을 수 있도록" },
              { personId: "q2", name: "최별", groupName: "가온", weeks: 5, text: "이직 준비 중인데 길이 열리도록" },
              { personId: "q3", name: "정해", groupName: "라온", weeks: 4, text: "졸업 논문 마무리" },
            ],
          }}
        />
        <GroupNotesSection
          weekKey={week}
          notes={[
            { groupName: "가온", note: "새 친구 한 명이 처음 왔어요. 다음 주에도 오기로 했습니다." },
            { groupName: "마루", note: "목장 모임을 카페에서 했고 다들 늦게까지 이야기 나눴습니다.\n다음 주는 리더 한 명이 출장이라 한 명이 진행합니다." },
          ]}
        />
      </main>
    );
  }

  if (screen === "loading") return <PageLoading />;
  if (screen === "push") {
    // 알림 화면(2026-11-11 다시 그림) — 이 기기 스위치 + 받는 알림(리더 · 운영자 겸임)
    return (
      <>
        <AppHeader back="/all" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <h1 className="gg-display text-[26px] leading-tight">알림</h1>
          <PushSettings audience={{ role: "admin", leadsGroup: true }} />
        </main>
      </>
    );
  } // 안쪽 화면 불러오기 껍데기(2026-11-11)

  if (screen === "me") {
    // 내 프로필(2026-11-11 인스타처럼) — 지어낸 사람. '프로필 편집' 을 누르면 목록(고르면 서버를 부른다 — 여기선 누르지 않는다)
    return (
      <>
        <AppHeader back="/all" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-5 pt-1 pb-8">
          <ProfileHeader
            p={{ seed: "p1", name: "김가온", photoUrl: null, stats: [{ label: "목장", value: "가온" }, { label: "구분", value: "리더" }, { label: "훈련 단계", value: "목자" }], bio: "밥 같이 먹는 걸 좋아해요.\n금요일 저녁 목장 모임 환영!", verse: "수고하고 무거운 짐 진 자들아 다 내게로 오라 (마 11:28)", interests: ["찬양", "캠핑", "커피"] }}
            actions={<><ProfileEditSheet hasPhoto={false} /><span className={PROFILE_BTN}>가온 목장</span></>}
          />
        </main>
      </>
    );
  }

  if (screen === "profiles") {
    // 전체 목장(2026-11-11 토스 결) — 청년부 카드 + 목장 줄. 지어낸 목장
    const groups = ["가온", "나래", "다솜", "라온", "마루", "바다"].map((n, i) => ({
      id: `g${i + 1}`, name: n, leaders: 2 + (i % 3), members: 4 + i, intro: i % 2 ? null : "함께 밥 먹고 함께 기도하는 목장",
      ddays: i === 0 ? [{ title: "목장 수련회", date: addDays(today, 12) }] : [],
    }));
    return (
      <>
        <AppHeader back="/groups" />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8">
          <h1 className="gg-display text-[26px] leading-tight">전체 목장</h1>
          <GroupCards groups={groups} myGroupId="g6" today={today} />
        </main>
      </>
    );
  }

  if (screen === "groups") {
    return (
      <FixedPage header={<TabTitle title="가온 목장" sub="리더 2 · 양 4" photo="/home/hd-room-blank.webp" photoLabel="가온 목장" pin pinDrop={8} aside={<span className={GLASS_PILL}>전체 목장</span>} />}>
        {/* 목장 탭(2026-11-11) — 내 목장 집 안 사진 위에 이름, 아래에 프로필(group-home). 지어낸 사람 · 목장 */}
        <main className="mx-auto flex w-full max-w-sm flex-col gap-5 px-5 pt-1 pb-8">
          <ProfileView
            blocks={{ intro: "함께 밥 먹고 함께 기도하는 목장", freeText: "이번 달은 금요일 저녁에 모여요.", ddays: [{ title: "목장 수련회", date: addDays(today, 12) }], themeSongs: [{ title: "주의 친절한 팔에 안기세", url: "https://example.com" }] }}
            members={[
              { id: "a", name: "김가온", group_role: "leader", is_group_head: true },
              { id: "b", name: "이나래", group_role: "leader", is_group_head: false },
              { id: "c", name: "박다솜", group_role: "member", is_group_head: false },
              { id: "d", name: "최라온", group_role: "member", is_group_head: false },
              { id: "e", name: "정마루", group_role: "member", is_group_head: false },
              { id: "f", name: "한바다", group_role: "member", is_group_head: false },
             ] as ProfileMember[]}
            today={today}
            editHref="/groups/가온/edit"
          />
        </main>
      </FixedPage>
    );
  }

  const persons: PersonRow[] = [
    { id: "a", name: "김가온", groupRole: "leader", isSelf: true },
    { id: "b", name: "이나래", groupRole: "leader", isSelf: false },
    { id: "c", name: "박다솜", groupRole: "member", isSelf: false },
    { id: "d", name: "최라온", groupRole: "member", isSelf: false },
    { id: "e", name: "정마루", groupRole: "member", isSelf: false },
  ];
  // 넓은 화면(2026-11-27, 1024px 이상)은 실제 화면(reports-screen)과 같은 틀 · &viewers=1 이면 같이 보고 있는 리더
  const viewers = sp.viewers === "1" ? ["이나래"] : [];
  return (
    <>
      <AppHeader back="/" wide />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-1 pb-8 lg:max-w-[1200px] lg:px-8">
      {sp.ai === "1" ? (
        <ReportMemoPreview
          reportId="00000000-0000-0000-0000-000000000000"
          weekKey={week}
          groupName="가온"
          persons={persons}
          initialRows={[]}
          prev={{ c: { text: "취업 준비가 잘 되도록", weeksAgo: 1 } }}
          initialNote={null}
          submittedAt={null}
          isLate={false}
          initialViewers={[]}
          serverStamp={new Date(0).toISOString()}
          serverNow={new Date().toISOString()}
          initialStreak={{ streak: 3, currentIncluded: false, everOnTime: true, broken: false }}
        />
      ) : (
        <ReportForm
          reportId="00000000-0000-0000-0000-000000000000"
          weekKey={week}
          groupName="가온"
          persons={persons}
          initialRows={[]}
          prev={{ c: { text: "취업 준비가 잘 되도록", weeksAgo: 1 } }}
          initialNote={null}
          submittedAt={null}
          isLate={false}
          initialViewers={viewers}
          serverStamp={new Date(0).toISOString()}
          serverNow={new Date().toISOString()}
          initialStreak={{ streak: 3, currentIncluded: false, everOnTime: true, broken: false }}
          saveRoster={designSaveRoster}
          newFamilyGroupId="g1"
          newFamilyActions={{ add: designAddNewFamily }}
        />
      )}
    </main>
    </>
  );
}
