"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MemoFill } from "@/components/ai/memo-fill";
import type { DictationResult } from "@/lib/ai/dictation";

import {
  CHIPS,
  EMPTY_REASONS,
  REASON_LABEL,
  chipOn,
  fromFlags,
  reasonFields,
  reasonSlots,
  requiresPrayer,
  tapChip,
  tapMeeting,
  toFlags,
  WORSHIP_SEG,
  type Attendance,
  type Chip,
  type Reasons,
} from "@/lib/attendance";
import { BerryIcon } from "@/components/berry-icon";
import { CARD, ICON, Icon } from "@/components/ui";
import { HEAD_LABEL, memberRoleLabel } from "@/lib/labels";
import { initialOf, roleDotColor } from "@/lib/profile-photo";
import { BERRY_GAIN_KEY, berryGainText, type BerryGain } from "@/lib/berries";
import type { StreakInfo } from "@/lib/labels";
import { formatRemaining, formatWeekDate, isPastDeadline, kstToday } from "@/lib/week";

import { submitReport, touchPresence, type SubmitRow, type VisibleRow } from "./actions";
import { NewFamily, type NewFamilyActions } from "./new-family";
import { RosterEditor, type RosterSave } from "./roster-editor";

/**
 * 주간 보고서 작성 폼.
 *
 * 한 화면에 목장 전원이 세로로 쌓이고, 맨 아래에서 제출한다. 사람마다 페이지를
 * 넘기지 않는다. 성공 기준은 하나 — 모임 끝나고 3분 안에 제출.
 *
 * 상태 세 층
 *   서버      제출 시에만 쓴다. 초안 없음.
 *   폼        사람별 값 + 불러올 때의 기준선(baseline). 둘을 비교해 바뀐 필드만 보낸다.
 *   로컬 보관  입력 유실 방지. 서버 초안이 아니다. 제출 성공 시 지운다.
 *             **화면을 열면 항상 서버 값을 그린다.** 사본이 있으면 배너로 알리기만
 *             하고, '복원' 을 눌러야 폼에 들어간다. 먼저 덮어 그리고 '버리기' 를 주는
 *             방식은 배너를 못 본 사람에게 남의 기도제목을 제출시킨다(2026-09-27 사고).
 *             7일 지난 사본은 어느 보고서 화면을 열든 함께 지운다.
 *
 * 빈 기도제목은 어떤 식으로도 강조하지 않는다. 빈칸이 눈에 띄면
 * "말 못 할 사정이 있다" 는 추론 경로가 생긴다. 필수 항목이 비었을 때는
 * 하단 바에 **이름 없이 숫자만** 보인다("출석 미입력 2명"). 행에는 표시하지 않는다.
 *
 * 제출 버튼은 페이지 맨 밑(마지막 사람 · 특이사항 다음)에 있고 — 화면에 붙여 띄우지 않는다(2026-10-23, 탭바와 겹쳐 보여서) — 버튼 글자가 상태를 말한다.
 *   제출        아직 제출 안 함 (미완성이어도 누를 수 있다 — 누르면 첫 빈 곳으로 스크롤)
 *   제출됨      제출했고 고친 것 없음. 흐리고, 눌러도 아무 일 없다. 증거는 위 줄의 시각이다
 *   다시 제출   제출한 뒤 고쳤다
 * "제출했습니다" 같은 메시지는 띄우지 않는다 — 버튼 위에 메시지가 뜨고 버튼이 그대로면
 * 된 건지 또 눌러야 하는지 알 수 없다.
 */

export type PersonRow = {
  id: string;
  name: string;
  groupRole: "leader" | "member";
  isSelf: boolean;
  /** 목장장 — 이름 칸이 연한 갈색(목장 프로필과 같은 결, 2026-11-11) */
  isHead?: boolean;
  /** 프로필 사진 저장 시각(ms) — 있으면 동그라미에 사진(/groups/photo) */
  photoAt?: number | null;
  /** 보고서 명단에서 숨김(2026-11-14 명단 편집) — 숨긴 사람은 화면 · 빈칸 검사에서 빠진다 */
  hidden?: boolean;
  /** 이 주에 들어온 새가족(2026-11-26) — 이름 옆 '새가족' */
  isNew?: boolean;
};

export type PrevPrayer = {
  text: string;
  weeksAgo: number;
};

type RowValue = {
  attendance: Attendance | null;
  /** 사유 칸의 글 — 칩을 끄면 칸은 숨지만 글은 남는다(다시 켜면 그대로). 저장은 보이는 칸만 */
  reasons: Reasons;
  prayer: string;
  contact: boolean;
};

type Baseline = {
  value: RowValue;
  updatedAt: string | null; // null = 아직 서버에 행이 없다
};

type Props = {
  reportId: string;
  weekKey: string;
  groupName: string | null;
  persons: PersonRow[];
  initialRows: VisibleRow[];
  prev: Record<string, PrevPrayer | undefined>;
  initialNote: string | null;
  submittedAt: string | null;
  isLate: boolean;
  initialViewers: string[];
  serverStamp: string; // 서버 상태의 최신 시각. 로컬 사본이 이보다 새로울 때만 복원한다
  /** 서버가 이 화면을 그린 시각. 하이드레이션 때 서버와 같은 '지금' 을 써야 마감 문구가 어긋나지 않는다 */
  serverNow: string;
  /** 연속 제출. 제출하면 액션이 새 값을 돌려주고 상단 숫자가 그 자리에서 오른다 (Step 6) */
  initialStreak: StreakInfo | null;
  /** 이번 주 목장 모임 없음(2026-11-06) */
  initialNoMeeting?: boolean;
  /** 보고서 받아쓰기(2026-11-12) — 모임 메모 → 사람별 기도제목 · 특이사항. 구구 AI 가 꺼져 있으면 null(AI 없이 이름으로 나눈다, 2026-11-16), 안 주면 단추가 없다 */
  memoFill?: ((reportId: string, personIds: string[], memo: string) => Promise<DictationResult>) | null;
  /** 명단 편집(2026-11-14) — 있으면 '명단 편집' 링크. persons 는 숨긴 사람까지 순서대로 온다 */
  saveRoster?: RosterSave | null;
  /** 새가족 추가(2026-11-26) — 이 보고서 화면에서 이름만으로. 우리 목장 리더 · 아직 안 낸 주만 */
  newFamilyGroupId?: string | null;
  /** 디자인 확인 화면용 — 새가족 추가의 답을 지어낸 것으로 */
  newFamilyActions?: NewFamilyActions;
};

/**
 * 출석 칸(2026-11-11 토스 결로 다시 — 사용자 요청: 칸을 작게, 사람 카드를 낮게) — 네모 칸 36px 두 줄.
 * 고른 칸 색: 예배는 라임, 불참 · 결석은 돌빛(강조색은 하나, 2026-10-23).
 */
const ON_COLOR: Record<Chip, string> = {
  in_person: "bg-[var(--gg-sky)] font-bold text-[var(--gg-on-sky)]",
  online: "bg-[var(--gg-sky)] font-bold text-[var(--gg-on-sky)]",
  meeting_off: "bg-[var(--gg-stone)] font-bold text-white",
  absent: "bg-[var(--gg-stone)] font-bold text-white",
};
const CHIP = "inline-flex h-9 items-center justify-center rounded-xl px-2 text-[14px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97]";
const CHIP_OFF = "bg-[var(--gg-field)] text-[var(--gg-section)]";

/** 기도제목 칸 — 한 줄에서 시작해 쓴 만큼 늘어난다(2026-11-11, 사람 카드를 낮게) */
function growField(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 3}px`;
}

/** 켜고 끄는 스위치 모양(알림 화면과 같은 결) — 눌리는 건 감싼 label 이다 */
function SwitchLook({ on, dim = false }: { on: boolean; dim?: boolean }) {
  return (
    <span aria-hidden className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors ${on ? "bg-[var(--gg-sky)]" : "bg-[var(--gg-line)]"} ${dim ? "opacity-50" : ""}`}>
      <span className={`absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)] transition-transform ${on ? "translate-x-[18px]" : ""}`} />
    </span>
  );
}

/** 이름 앞 프로필 동그라미 — 사진, 없으면 사람마다 정해진 색에 이름 둘째 글자. 출석을 고르면 오른쪽 아래 ✓(그 칸 색) */
function PersonDot({ p, attendance }: { p: PersonRow; attendance: Attendance | null }) {
  return (
    <span aria-hidden className="relative size-8 shrink-0">
      {p.photoAt ? (
        // eslint-disable-next-line @next/next/no-img-element -- 프로필 사진(/groups/photo — 작은 정사각 WebP · JPEG)
        <img src={`/groups/photo/${p.id}/${p.photoAt}`} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: roleDotColor({ id: p.id, groupRole: p.groupRole, isHead: p.isHead }) }}>
          {initialOf(p.name)}
        </span>
      )}
      {attendance ? (
        <span className={`absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-[var(--gg-card)] ${ON_COLOR[attendance.worship]}`} data-testid="person-dot-check">
          <Icon d={ICON.check} className="size-2.5" strokeWidth={3.4} />
        </span>
      ) : null}
    </span>
  );
}

const LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_PREFIX = "nn:report:";

type LocalDraft = {
  savedAt: string;
  values: Record<string, Partial<RowValue>>;
  note: string;
};

/** 2026-10-30 전 사본의 출석은 글자 하나("present" · "worship_only" · "absent")였다 — 새 모양으로 옮긴다 */
const OLD_ATTENDANCE: Record<string, Attendance> = {
  present: { worship: "in_person", meetingOff: false },
  worship_only: { worship: "in_person", meetingOff: true },
  absent: { worship: "absent", meetingOff: true },
};

function parseDraft(raw: string | null): LocalDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof d?.savedAt !== "string" || Number.isNaN(Date.parse(d.savedAt))) return null;
    const values: LocalDraft["values"] = {};
    for (const [id, v] of Object.entries(d.values ?? {})) {
      const a = v?.attendance as unknown;
      values[id] = typeof a === "string" ? { ...v, attendance: OLD_ATTENDANCE[a] ?? null } : v;
    }
    return { savedAt: d.savedAt, values, note: d.note ?? "" };
  } catch {
    return null;
  }
}

/**
 * 만료된(7일)·깨진 사본을 전부 지운다 — 이 화면 것만이 아니라 다른 주차 것도.
 * 그 주차를 다시 여는 사람에게 지뢰가 되지 않도록, 어느 보고서 화면을 열든 한 번 돈다.
 */
function sweepExpiredDrafts(now: number) {
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(LOCAL_PREFIX)) continue;
    const d = parseDraft(localStorage.getItem(key));
    if (!d || now - Date.parse(d.savedAt) > LOCAL_TTL_MS) doomed.push(key);
  }
  for (const key of doomed) localStorage.removeItem(key);
}

/**
 * 시각 표시. 오늘이면 "오후 3:12", 아니면 "9월 25일 오후 3:12". 한국 시간 기준.
 * Intl 을 쓰지 않는다 — 서버(Node ICU)와 브라우저가 "AM 5:00" / "오전 5:00" 으로 다르게
 * 그려 하이드레이션이 깨진다. 손으로 조립하면 양쪽이 같다.
 */
function formatKstTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h24 = kst.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = `${h24 < 12 ? "오전" : "오후"} ${h12}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  if (kstToday(d) === kstToday(now)) return time;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${time}`;
}

function emptyValue(): RowValue {
  return { attendance: null, reasons: { ...EMPTY_REASONS }, prayer: "", contact: false };
}

function baselineFrom(rows: VisibleRow[], persons: PersonRow[]): Record<string, Baseline> {
  const byPerson = new Map(rows.map((r) => [r.person_id ?? "", r]));
  const out: Record<string, Baseline> = {};
  for (const p of persons) {
    const r = byPerson.get(p.id);
    out[p.id] = r
      ? {
          value: {
            // 뷰의 컬럼은 타입상 전부 nullable 이다. 원본은 not null 이므로 기본값으로 메운다.
            attendance: fromFlags(r.worship_attended ?? false, r.group_meeting_attended ?? false, r.worship_online ?? false),
            reasons: { online: r.online_reason ?? "", meeting: r.meeting_absent_reason ?? "", absent: r.absent_reason ?? "" },
            prayer: r.prayer_request ?? "",
            contact: r.one_on_one_contacted ?? false,
          },
          updatedAt: r.updated_at,
        }
      : { value: emptyValue(), updatedAt: null };
  }
  return out;
}

function valuesFrom(baseline: Record<string, Baseline>): Record<string, RowValue> {
  return Object.fromEntries(Object.entries(baseline).map(([id, b]) => [id, { ...b.value, reasons: { ...b.value.reasons } }]));
}

function sameAttendance(a: Attendance | null, b: Attendance | null): boolean {
  return a?.worship === b?.worship && (a?.meetingOff ?? false) === (b?.meetingOff ?? false);
}

function diffRow(base: RowValue, cur: RowValue): SubmitRow["fields"] {
  const fields: SubmitRow["fields"] = {};
  // 출석은 세 칸을 늘 함께 보낸다 — 온라인 제약(예배 O · 목장 X)이 한 칸씩 바뀌다 걸리지 않게
  if (cur.attendance && !sameAttendance(cur.attendance, base.attendance)) {
    Object.assign(fields, toFlags(cur.attendance));
  }
  const curR = reasonFields(cur.attendance, cur.reasons);
  const baseR = reasonFields(base.attendance, base.reasons);
  for (const k of Object.keys(curR) as Array<keyof typeof curR>) {
    if (curR[k] !== baseR[k]) fields[k] = curR[k];
  }
  if (cur.prayer.trim() !== base.prayer.trim()) {
    fields.prayer_request = cur.prayer.trim() === "" ? null : cur.prayer.trim();
  }
  if (cur.contact !== base.contact) fields.one_on_one_contacted = cur.contact;
  return fields;
}

export function ReportForm(props: Props) {
  const { reportId, weekKey, groupName, prev } = props;
  const storageKey = `nn:report:${reportId}`;
  // 명단 편집(2026-11-14) — 숨긴 사람까지 다 들고 있고(기준선 · 값도 모두), 화면 · 검사 · 제출은 보이는 사람만
  const [roster, setRoster] = useState<PersonRow[]>(props.persons);
  const persons = useMemo(() => roster.filter((p) => !p.hidden), [roster]);

  const [baseline, setBaseline] = useState<Record<string, Baseline>>(() =>
    baselineFrom(props.initialRows, props.persons),
  );
  const [values, setValues] = useState<Record<string, RowValue>>(() => valuesFrom(baseline));
  const [note, setNote] = useState(props.initialNote ?? "");
  const [noteBase, setNoteBase] = useState(props.initialNote ?? "");
  // 서버에 있는 특이사항 그대로(없으면 null) — 충돌 확인에는 이것을 보낸다. 빈 글과 null 을 섞으면 '다른 리더가 바꿨다' 로 잘못 걸린다(2026-11-16)
  const noteBaseExact = useRef<string | null>(props.initialNote ?? null);
  // 이번 주 목장 모임 없음(2026-11-06) — 단추는 2026-11-14 뺐다. 예전에 켠 보고서는 그 값대로 그린다(바꿀 길은 없다)
  const [noMeeting] = useState(props.initialNoMeeting ?? false);
  const [noMeetingBase, setNoMeetingBase] = useState(props.initialNoMeeting ?? false);
  // 임시 저장한 시각(2026-11-06) — 하단 줄에 한 번
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [submittedAt, setSubmittedAt] = useState(props.submittedAt);
  const [isLate, setIsLate] = useState(props.isLate);
  const [streak, setStreak] = useState<StreakInfo | null>(props.initialStreak);
  // 숫자가 바뀐 순간을 표시한다 — 바뀔 때마다 key 가 바뀌어 애니메이션이 다시 돈다.
  // 처음 제출한 순간 받은 열매(World 5) — 하단 바 위에 한 줄. 화면을 떠나면 홈이 한 번 더 알린다
  const [gain, setGain] = useState<BerryGain | null>(null);
  const [viewers, setViewers] = useState<string[]>(props.initialViewers);
  // 아직 결정하지 않은 로컬 사본. 폼에는 들어가지 않았다 — '복원' 을 눌러야 들어간다.
  const [pendingDraft, setPendingDraft] = useState<LocalDraft | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  // 경고 한 줄(충돌·서버 오류). 완료 메시지는 없다 — 버튼이 말한다. 입력이 바뀌면 지운다.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 하이드레이션 불일치 방지 — 첫 렌더는 서버가 그린 시각을 그대로 쓴다. 클라이언트 시계로는
  // 마운트 뒤에 바꾼다. new Date() 로 시작하면 서버와 클라이언트가 다른 '지금' 을 그려
  // "마감까지 N시간" 이 어긋날 수 있다(시간 경계·기기 시계 차이).
  const [now, setNow] = useState(() => new Date(props.serverNow));

  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  // 이 화면에서 사본을 쓴 적이 있는가. 쓴 적이 없으면 지우지도 않는다 — 마운트 직후
  // "dirty 아님" 만 보고 지우면, 아직 결정하지 않은 남의(이전 방문의) 사본을 없앤다.
  const wroteLocalRef = useRef(false);

  // ---- 편집 상태 ---------------------------------------------------------
  const update = useCallback((personId: string, patch: Partial<RowValue>) => {
    setValues((cur) => ({ ...cur, [personId]: { ...cur[personId], ...patch } }));
    setNotice(null);
    // 사본을 두고 새로 쓰기 시작했다 — 사본은 잊는다. 나중에 '복원' 이 새 입력을 덮으면 안 된다.
    setPendingDraft(null);
  }, []);

  const dirtyRows = useMemo<SubmitRow[]>(() => {
    const out: SubmitRow[] = [];
    for (const p of persons) {
      const fields = diffRow(baseline[p.id].value, values[p.id]);
      if (Object.keys(fields).length === 0) continue;
      out.push({ person_id: p.id, expected_updated_at: baseline[p.id].updatedAt, fields });
    }
    return out;
  }, [persons, baseline, values]);

  const noteDirty = note.trim() !== noteBase.trim();
  const noMeetingDirty = noMeeting !== noMeetingBase;
  const dirty = dirtyRows.length > 0 || noteDirty || noMeetingDirty;

  // 미완성 집계 — 숫자만. 누가 비었는지는 화면 어디에도 쓰지 않는다.
  const missingAttendance = persons.filter((p) => !values[p.id].attendance);
  const missingPrayer = persons.filter(
    (p) => requiresPrayer(values[p.id].attendance) && values[p.id].prayer.trim() === "",
  );
  const complete = missingAttendance.length === 0 && missingPrayer.length === 0;

  // ---- 로컬 보관: 사본 확인 (폼에 넣지 않는다) ----------------------------
  // 하이드레이션이 끝난 뒤에 해야 한다 — 서버가 그린 화면과 첫 렌더가 같아야
  // 하므로 초기 상태에서 localStorage 를 읽을 수 없다. 한 틱 미뤄 확인한다.
  // 확인 결과는 배너뿐이다. 값은 사용자가 '복원' 을 눌렀을 때만 들어간다.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        sweepExpiredDrafts(Date.now());
        const saved = parseDraft(localStorage.getItem(storageKey));
        if (!saved) return;
        if (Date.parse(saved.savedAt) <= Date.parse(props.serverStamp)) {
          // 서버가 더 새롭다. 그 사이 누군가 제출했다 — 사본은 낡았다.
          localStorage.removeItem(storageKey);
          return;
        }
        // 서버 값과 다른 것이 하나도 없으면 알릴 것이 없다. 배너를 띄우지 않는다 —
        // 매번 뜨는 배너는 무시하는 습관을 만들고, 그러면 진짜 필요한 순간에도 무시한다.
        const differs =
          persons.some((p) => {
            const v = saved.values[p.id];
            return v && Object.keys(diffRow(baseline[p.id].value, { ...emptyValue(), ...v })).length > 0;
          }) || (saved.note ?? "").trim() !== noteBase.trim();
        if (!differs) {
          localStorage.removeItem(storageKey);
          return;
        }
        setPendingDraft(saved);
      } catch {
        // 로컬 저장소를 못 쓰는 환경. 사본 없이 진행한다.
      }
    }, 0);
    return () => clearTimeout(t);
    // baseline·noteBase 는 마운트 시점 값만 쓰면 된다. 확인은 한 번만 일어난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, persons, props.serverStamp]);

  // ---- 로컬 보관: 저장 (300ms 디바운스) — dirty 일 때만 ----------------------
  useEffect(() => {
    // 결정하지 않은 사본이 있는 동안은 쓰지도 지우지도 않는다. 지금 폼은 서버 값이라
    // dirty 가 아니고, 여기서 지워 버리면 사용자가 '복원' 을 누르기 전에 사본이 사라진다.
    if (pendingDraft) return;
    const t = setTimeout(() => {
      try {
        // 서버와 다른 입력이 있을 때만 쓴다. 제출·버리기 뒤에는 dirty 가 없으므로
        // 사본이 다시 생기지 않고, 새로고침해도 배너가 뜨지 않는다.
        if (dirtyRows.length === 0 && !noteDirty) {
          if (wroteLocalRef.current) {
            localStorage.removeItem(storageKey);
            wroteLocalRef.current = false;
          }
          return;
        }
        localStorage.setItem(
          storageKey,
          JSON.stringify({ savedAt: new Date().toISOString(), values, note }),
        );
        wroteLocalRef.current = true;
      } catch {
        // 저장 실패는 조용히 넘긴다. 유실 방지는 최선 노력이다.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [values, note, storageKey, dirtyRows, noteDirty, pendingDraft]);

  // ---- 접속 표시: 60초마다 --------------------------------------------
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const names = await touchPresence(reportId);
        if (alive) setViewers(names);
      } catch {
        // 신호 실패는 무시한다
      }
    };
    const id = setInterval(tick, 60_000);
    // 마운트 직후 한 번 클라이언트 시계로 맞추고, 이후 1분마다 갱신한다.
    const firstClock = setTimeout(() => setNow(new Date()), 0);
    const clock = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(firstClock);
      clearInterval(clock);
    };
  }, [reportId]);

  const pastDeadline = isPastDeadline(weekKey, now);

  // ---- 제출 --------------------------------------------------------------
  const onSubmit = () => send(true);
  // 임시 저장(2026-11-06) — 다 채우지 않아도 쓴 만큼 서버에 남긴다. 공동 리더가 다른 폰에서 이어 쓴다
  const onSave = () => send(false);

  const send = async (submit: boolean) => {
    if (busy) return;
    setNotice(null);

    // 미완성이면 막지 않고 첫 빈 곳으로 데려간다. 왜 못 내는지는 하단 바의 숫자가 말한다.
    const firstMissing = missingAttendance[0] ?? missingPrayer[0];
    if (submit && firstMissing) {
      rowRefs.current[firstMissing.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // 고친 것이 없으면 할 일이 없다(제출 전 임시 저장도).
    if (!dirty && (submittedAt || !submit)) return;

    setBusy(true);
    try {
      const res = await submitReport({
        reportId,
        rows: dirtyRows,
        note: note.trim() === "" ? null : note.trim(),
        noteDirty,
        noteBase: noteDirty ? noteBaseExact.current : undefined,
        submit,
        noMeeting: noMeetingDirty ? noMeeting : undefined,
        weekKey,
      });

      if (!res.ok) {
        const n = res.missingAttendance.length + res.missingPrayer.length;
        setNotice(n > 0 ? `입력이 비어 있는 분이 ${n}명 있습니다. 새로고침 후 확인해 주세요.` : res.message);
        return;
      }

      // 서버 상태로 기준선을 바꾼다. 충돌 행은 내 입력을 남기고 표시한다.
      const nextBaseline = baselineFrom(res.rows, roster);
      setBaseline(nextBaseline);
      setValues((cur) => {
        const next = valuesFrom(nextBaseline);
        for (const id of res.conflicts) next[id] = cur[id];
        return next;
      });
      // 연 뒤에 다른 리더가 특이사항을 바꿨다 — 내 글은 그대로 두고, 그 글을 보여 준다. 다시 내면 내 글로 바뀐다(2026-11-06)
      if (res.noteConflict !== undefined) {
        setNoteBase(res.noteConflict ?? "");
        noteBaseExact.current = res.noteConflict ?? null;
        setNotice(`다른 리더가 방금 특이사항을 바꿨습니다: "${res.noteConflict ?? ""}" · 확인하고 다시 제출해 주세요.`);
        return;
      }
      if (noteDirty && res.conflicts.length === 0) {
        setNoteBase(note.trim());
        noteBaseExact.current = note.trim() === "" ? null : note.trim();
      }

      if (res.conflicts.length > 0) {
        setConflicts(res.conflicts);
        const names = res.conflicts
          .map((id) => persons.find((p) => p.id === id)?.name ?? "")
          .filter(Boolean);
        setNotice(`다른 리더가 방금 ${names.join(", ")}을(를) 고쳤습니다 · 표시된 사람을 확인하고 다시 제출해 주세요.`);
        return;
      }

      setConflicts([]);
      setNoMeetingBase(noMeeting);
      if (!submit) {
        // 임시 저장 — 제출은 아니다. 이 기기의 사본은 서버에 올라갔으니 지운다
        setSavedAt(new Date().toISOString());
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // 무시
        }
        setPendingDraft(null);
        return;
      }
      setSubmittedAt(new Date().toISOString());
      if (res.isLate !== null) setIsLate(res.isLate);
      // 제출하는 순간 상단이 오른다 — "3주 연속 제출 중" → "4주 연속 제출 중". 이게 유일한 보상이다.
      if (res.streak && res.streak.streak !== (streak?.streak ?? -1)) {
        setStreak(res.streak);
        // 홈으로 돌아가면 거기서도 한 번 강조한다(home/streak-line.tsx).
        try {
          sessionStorage.setItem("nn:streak-bump", String(res.streak.streak));
        } catch {
          // 무시
        }
      } else if (res.streak) {
        setStreak(res.streak);
      }
      if (res.berries) {
        setGain(res.berries);
        try {
          sessionStorage.setItem(BERRY_GAIN_KEY, JSON.stringify(res.berries));
        } catch {
          // 무시
        }
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // 무시
      }
      setPendingDraft(null); // 서버 값으로 제출했으니 낡은 사본은 의미가 없다
      // 완료 메시지 없음. 버튼이 '제출됨' 으로, 위 줄이 제출 시각으로 바뀐다.
    } catch {
      // 연결이 끊겼거나 배포로 화면이 낡았다(2026-11-04) — 말없이 '제출' 로 돌아가면 보내졌는지 알 수 없다.
      // 입력은 이 기기의 임시 저장에 남아 있다
      setNotice("제출하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const restoreDraft = () => {
    if (!pendingDraft) return;
    const saved = pendingDraft;
    setValues((cur) => {
      const next = { ...cur };
      for (const p of persons) if (saved.values[p.id]) next[p.id] = { ...emptyValue(), ...saved.values[p.id] };
      return next;
    });
    setNote(saved.note ?? "");
    setPendingDraft(null); // 이제 폼이 dirty 이므로 저장 effect 가 사본을 다시 쓴다
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // 무시
    }
    setPendingDraft(null); // 폼은 이미 서버 값이다. 되돌릴 것이 없다
  };

  // ---- 하단 바의 말 ---------------------------------------------------------
  // settled: 제출했고 고친 것도 빈 곳도 없다 — 할 일이 없는 상태. '막힘' 이 아니라 '끝남' 이다.
  const settled = Boolean(submittedAt) && !dirty && complete;
  const buttonLabel = busy ? "저장 중…" : settled ? "제출됨" : submittedAt ? "다시 제출" : "제출";

  let statusLine: string | null = null;
  if (busy) {
    statusLine = null;
  } else if (notice) {
    statusLine = notice;
  } else if (!complete) {
    const parts: string[] = [];
    if (missingAttendance.length > 0) parts.push(`출석 미입력 ${missingAttendance.length}명`);
    if (missingPrayer.length > 0) parts.push(`기도제목 비어 있음 ${missingPrayer.length}명`);
    statusLine = parts.join(" · ");
  } else if (submittedAt && dirty) {
    statusLine = `고친 내용 ${dirtyRows.length + (noteDirty ? 1 : 0)}건`;
  } else if (submittedAt) {
    statusLine = `${formatKstTime(submittedAt, now)} 제출됨${isLate ? " · 마감 지남 · 연속 기록 미반영" : ""}`;
  }
  if (!busy && !notice && savedAt && !dirty && !submittedAt) statusLine = `${formatKstTime(savedAt, now)} 임시 저장됨${statusLine ? ` · ${statusLine}` : ""}`;

  // ---- 렌더 --------------------------------------------------------------
  // 새 얼굴(2026-10-23) — 맨 위에 작은 줄(남은 시간 · 연속) · 큰 제목 · 진행 막대(출석을 고른 사람 / 전원).
  // 완료 메시지는 여전히 띄우지 않는다 — 버튼이 '제출됨' 으로 바뀐다.
  const marked = persons.length - missingAttendance.length;
  // 새가족 추가 · 명단 편집 — 휴대폰은 진행 막대 옆, 넓은 화면은 명단 표 머리(같은 처리)
  const addNewFamily = (np: { id: string; name: string }) => {
    // 지금 쓰던 입력은 그대로 — 새 사람 칸만 더하고 명단 맨 아래에
    const empty = { value: emptyValue(), updatedAt: null };
    setBaseline((cur) => ({ ...cur, [np.id]: empty }));
    setValues((cur) => ({ ...cur, [np.id]: emptyValue() }));
    setRoster((cur) => [...cur, { id: np.id, name: np.name, groupRole: "member", isSelf: false, isNew: true }]);
  };
  const onRosterSaved = (next: { id: string; hidden: boolean }[]) => {
    const byId = new Map(roster.map((p) => [p.id, p]));
    setRoster(next.map((it) => ({ ...byId.get(it.id)!, hidden: it.hidden })));
  };
  const progress = persons.length > 0 ? marked / persons.length : 0;
  return (
    // 1024px 이상은 넓은 배치(globals.css .gg-report-grid — 머리 · 왼쪽 붙여넣기 · 특이사항 · 오른쪽 명단 표 · 아래 제출 줄, 2026-11-27).
    // 작은 화면에 닿는 것은 없다 — 넓은 화면에서만 보이는 조각은 display:none 이고, 나머지는 lg: 클래스뿐
    <div className="gg-report-grid flex flex-col gap-5">
      {/* 머리 — 남은 시간(마감 전만) · 제목 · 진행 막대(2026-11-14 연속 알약 · 목사님 확인 줄, 11-15 마감 지남 · 노란 칸은 뺐다 — 사용자 요청) */}
      <header className="space-y-4 lg:[grid-area:head]">
        <div className="space-y-1.5 lg:flex lg:items-end lg:justify-between lg:gap-4 lg:space-y-0">
          {/* 넓은 화면 머리 오른쪽(2026-11-27) — 같이 보고 있는 리더 · 임시 저장 시각 · 지난 목장보고서. 남은 시간 · 연속 제출은 넣지 않는다 */}
          <div className="hidden shrink-0 items-center gap-2 lg:order-last lg:flex" data-testid="report-wide-head">
            {viewers.length > 0 ? (
              <span className="gg-pill bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]" title="같은 사람을 함께 고치면 나중에 제출하는 쪽이 확인 요청을 받습니다" data-testid="report-viewers">
                {viewers.join(", ")} 리더도 보는 중
              </span>
            ) : null}
            {savedAt ? <span className="text-[13px] text-muted tabular-nums">{formatKstTime(savedAt, now)} 임시 저장됨</span> : null}
            <Link href="/reports" className="gg-btn gg-btn-white gg-btn-sm !h-9 !px-3 !text-[13.5px]" data-testid="report-past">
              지난 목장보고서
            </Link>
          </div>
          {/* 마감 전에만 남은 시간 알약 — '마감 지남' · 노란 칸은 뺐다(2026-11-15 사용자 요청) */}
          {pastDeadline ? null : (
            <div className="flex flex-wrap items-center gap-1.5 lg:hidden">
              <span className="gg-pill bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)] tabular-nums">{formatRemaining(weekKey, now)}</span>
            </div>
          )}
          <h1 className="gg-display pt-1 text-[26px] leading-tight lg:text-[28px]">{formatWeekDate(weekKey)} 목장보고서</h1>
        </div>
        <div className="space-y-2">
          <div className="gg-progress !h-1.5" role="progressbar" aria-label="출석 입력" aria-valuemin={0} aria-valuemax={persons.length} aria-valuenow={marked}>
            <span style={{ width: `${progress > 0 ? Math.max(progress * 100, 4) : 0}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-[13px] text-muted tabular-nums lg:block">
              {persons.length}명 중 {marked}명 입력
            </p>
            <p className="text-[13px] text-muted tabular-nums lg:hidden">
              {marked} / {persons.length}명 입력
            </p>
            <span className="flex items-center gap-3 lg:hidden">
            {props.newFamilyGroupId && !submittedAt ? (
              <NewFamily weekKey={weekKey} actions={props.newFamilyActions} onAdded={addNewFamily} />
            ) : null}
            {props.saveRoster ? (
              <RosterEditor items={roster.map((p) => ({ id: p.id, name: p.name, hidden: !!p.hidden }))} save={props.saveRoster} onSaved={onRosterSaved} />
            ) : null}
            </span>
          </div>
        </div>
      </header>

      {/* 보고서 받아쓰기(2026-11-12) — 모임 메모를 사람별 기도제목 · 특이사항으로. 고른 것만 칸에 넣고 제출은 평소처럼 */}
      {props.memoFill !== undefined ? (
        <MemoFill
          persons={persons.map((p) => ({ id: p.id, name: p.name, prayer: values[p.id]?.prayer ?? "" }))}
          note={note}
          action={props.memoFill ? (ids, memo) => props.memoFill!(props.reportId, ids, memo) : null}
          onApply={(prayers, newNote) => {
            setValues((cur) => {
              const next = { ...cur };
              for (const f of prayers) if (next[f.personId]) next[f.personId] = { ...next[f.personId], prayer: f.prayer };
              return next;
            });
            if (newNote !== null) setNote(newNote);
            setNotice(null);
            setPendingDraft(null);
          }}
          className="lg:[grid-area:memo]"
        />
      ) : null}

      {/* 한 번에 하나만. 사본 배너가 위다 — 사용자 입력이 걸려 있다. 넓은 화면은 머리 오른쪽 알약으로 */}
      {viewers.length > 0 && !pendingDraft ? (
        <p className="rounded-2xl bg-[var(--gg-sky-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--gg-sky-ink)] lg:hidden">
          {viewers.join(", ")} 리더가 지금 이 목장보고서를 열어두고 있습니다. 같은 사람을 함께 고치면
          나중에 제출하는 쪽이 확인 요청을 받습니다.
        </p>
      ) : null}

      {pendingDraft ? (
        <div className="space-y-3 rounded-[20px] bg-[var(--gg-sun-soft)] px-4 py-3.5 text-sm lg:[grid-area:banner]">
          <p className="leading-relaxed">
            {formatKstTime(pendingDraft.savedAt, now)}에 이 기기에서 쓰다 만 입력이 있습니다. 화면에는 서버에
            저장된 값이 보입니다.
          </p>
          <div className="flex gap-2.5">
            <button type="button" onClick={restoreDraft} className="gg-btn gg-btn-sky gg-btn-sm flex-1">
              복원
            </button>
            <button type="button" onClick={discardDraft} className="gg-btn gg-btn-white gg-btn-sm flex-1">
              버리기
            </button>
          </div>
        </div>
      ) : null}

      {/* '이번 주 목장 모임 없음' 단추는 뺐다(2026-11-14 사용자 — 쉬는 주는 휴주로 운영자 · 목사님 · 임원진이 정한다). 예전에 켠 보고서의 값은 그대로 보낸다 */}

      {/* 명단 — 휴대폰은 사람마다 카드, 넓은 화면은 한 줄씩 표(이름 · 예배 · 목장 모임 · 개별 연락 · 기도제목/사유) */}
      <ol className="flex flex-col gap-3 lg:gap-0 lg:overflow-hidden lg:rounded-[22px] lg:bg-[var(--gg-card)] lg:shadow-[var(--gg-card-shadow)] lg:[grid-area:table] lg:@container" data-testid="report-roster">
        <li className="hidden items-center justify-between gap-3 px-5 pt-4 pb-3 lg:flex" data-testid="report-table-head">
          <h2 className="text-[16px] font-bold tabular-nums">이번 주 명단 {persons.length}명</h2>
          <span className="flex items-center gap-3">
            {props.newFamilyGroupId && !submittedAt ? <NewFamily weekKey={weekKey} actions={props.newFamilyActions} onAdded={addNewFamily} /> : null}
            {props.saveRoster ? <RosterEditor items={roster.map((p) => ({ id: p.id, name: p.name, hidden: !!p.hidden }))} save={props.saveRoster} onSaved={onRosterSaved} /> : null}
          </span>
        </li>
        {/* 표 머리 — 표 폭이 740px 아래면(1024~1279px) 기도제목 · 사유 칸은 줄마다 다음 줄로 내려가 예배 칸부터 끝까지 쓴다(그때는 이 머리에서도 뺀다) */}
        <li aria-hidden className="hidden gap-x-3 border-y border-[var(--gg-line)] bg-[var(--gg-tile)] px-5 py-2 text-[12px] font-semibold text-[var(--gg-section)] lg:grid lg:grid-cols-[128px_150px_100px_48px_minmax(0,1fr)]">
          <span>이름</span>
          <span>예배</span>
          <span>목장 모임</span>
          <span className="text-center">연락</span>
          <span className="hidden lg:@[740px]:block">기도제목 · 사유</span>
        </li>
        {persons.map((p) => {
          const v = values[p.id];
          const pv = prev[p.id];
          const conflicted = conflicts.includes(p.id);
          const meetingLocked = v.attendance?.worship === "online" || v.attendance?.worship === "absent";
          return (
            <li
              key={p.id}
              ref={(el) => {
                rowRefs.current[p.id] = el;
              }}
              className={[
                CARD,
                "space-y-2.5 px-4 pt-3.5 pb-3",
                conflicted ? "ring-2 ring-[var(--gg-sun)]" : "",
                // 넓은 화면 — 표의 한 줄. 출석을 아직 안 고른 줄은 옅은 노랑(2026-11-27)
                "lg:grid lg:grid-cols-[128px_150px_100px_48px_minmax(0,1fr)] lg:items-start lg:gap-x-3 lg:gap-y-2 lg:space-y-0 lg:rounded-none lg:border-b lg:border-[var(--gg-line)] lg:px-5 lg:py-3 lg:shadow-none lg:ring-inset",
                v.attendance ? "lg:bg-transparent" : "lg:bg-[var(--gg-row-todo)]",
              ].join(" ")}
              data-testid="report-person"
            >
              <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-1">
                {/* 목장장은 이름 칸이 연한 갈색, 리더는 연한 연두(목장 프로필과 같은 결) — 글자 꼬리표는 없다 */}
                <span className="flex min-w-0 items-center gap-2 lg:flex-wrap lg:gap-y-0">
                  <PersonDot p={p} attendance={v.attendance} />
                  <span
                    className={`truncate text-[16px] font-bold ${p.isHead ? "rounded-full bg-[var(--gg-head-soft)] px-2.5 py-0.5" : p.groupRole === "leader" ? "rounded-full bg-[var(--gg-sky-soft)] px-2.5 py-0.5" : ""}`}
                    data-testid="report-person-name"
                  >
                    {p.name}
                  </span>
                  {p.groupRole === "leader" ? <span className="sr-only">{p.isHead ? "(목자)" : "(목동)"}</span> : null}
                  {/* 넓은 화면 — 이름 아래 작은 글씨로 구분(목자 · 목동 · 양) */}
                  <span aria-hidden className="hidden basis-full pl-10 text-[12px] text-muted lg:block">{p.isHead ? HEAD_LABEL : memberRoleLabel(p.groupRole, false)}</span>
                  {p.isNew ? (
                    <span className="gg-pill shrink-0 bg-[var(--gg-leaf-soft)] text-[var(--gg-leaf-ink)]" data-testid="new-family-badge">
                      새가족
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {conflicted ? <span className="gg-pill shrink-0 bg-[var(--gg-sun-soft)] text-[var(--gg-sun-ink)]">다시 확인</span> : null}
                  {/* 이번 주 컨택 — 이름 줄 오른쪽 스위치(2026-11-11, 사람 카드를 낮게) */}
                  <label
                    className={`flex items-center gap-2 lg:hidden ${p.isSelf ? "cursor-default" : "cursor-pointer"}`}
                    title={p.isSelf ? "본인과의 개별 연락으로 교제는 집계하지 않습니다" : undefined}
                  >
                    <span className={`text-[13px] font-semibold ${v.contact ? "text-[var(--gg-sky-ink)]" : "text-[var(--gg-section)]"}`}>개별 연락으로 교제</span>
                    <input
                      type="checkbox"
                      checked={v.contact}
                      disabled={p.isSelf}
                      onChange={(e) => update(p.id, { contact: e.target.checked })}
                      aria-label={`${p.name} 이번 주 개별 연락으로 교제`}
                      className="sr-only"
                    />
                    <SwitchLook on={v.contact} dim={p.isSelf} />
                  </label>
                </span>
              </div>

              {/* 출석 넷 — 기본값 없음. 고른 칸만 색이 찬다. 온라인이면 불참이 함께 켜지고 잠긴다 */}
              <div role="group" aria-label={`${p.name} 출석`} className="grid grid-cols-2 gap-1.5 lg:hidden">
                {CHIPS.filter((opt) => !noMeeting || opt.value !== "meeting_off").map((opt) => {
                  const on = chipOn(v.attendance, opt.value);
                  const locked = opt.value === "meeting_off" && (v.attendance?.worship === "online" || v.attendance?.worship === "absent");
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={on}
                      disabled={locked}
                      onClick={() => {
                        const next = tapChip(v.attendance, opt.value);
                        // 모임이 없는 주 — 현장 예배는 늘 목장 불참으로
                        update(p.id, { attendance: noMeeting && next?.worship === "in_person" ? { ...next, meetingOff: true } : next });
                      }}
                      className={`${CHIP} ${on ? ON_COLOR[opt.value] : CHIP_OFF} disabled:active:scale-100 ${locked && !on ? "opacity-40" : ""}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* 넓은 화면 — 예배(현장 · 온라인 · 결석) · 목장 모임(참석 · 불참) · 개별 연락. 규칙은 휴대폰 칩과 같다(lib/attendance) */}
              <div role="group" aria-label={`${p.name} 예배`} className="hidden gap-1 lg:flex">
                {WORSHIP_SEG.map((opt) => {
                  const on = v.attendance?.worship === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = tapChip(v.attendance, opt.value);
                        update(p.id, { attendance: noMeeting && next?.worship === "in_person" ? { ...next, meetingOff: true } : next });
                      }}
                      className={`${CHIP} flex-1 !px-1 !text-[13px] ${on ? ON_COLOR[opt.value] : CHIP_OFF}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div role="group" aria-label={`${p.name} 목장 모임`} className="hidden gap-1 lg:flex">
                {noMeeting ? (
                  <span className="text-[13px] text-muted">—</span>
                ) : (
                  ([true, false] as const).map((attend) => {
                    const on = attend ? v.attendance?.worship === "in_person" && !v.attendance.meetingOff : chipOn(v.attendance, "meeting_off");
                    return (
                      <button
                        key={String(attend)}
                        type="button"
                        aria-pressed={on}
                        disabled={meetingLocked}
                        onClick={() => update(p.id, { attendance: tapMeeting(v.attendance, attend) })}
                        className={`${CHIP} flex-1 !px-1 !text-[13px] ${on ? (attend ? ON_COLOR.in_person : ON_COLOR.meeting_off) : CHIP_OFF} disabled:active:scale-100 ${meetingLocked && !on ? "opacity-40" : ""}`}
                      >
                        {attend ? "참석" : "불참"}
                      </button>
                    );
                  })
                )}
              </div>
              <label className={`hidden h-9 items-center justify-center lg:flex ${p.isSelf ? "cursor-default opacity-50" : "cursor-pointer"}`} title={p.isSelf ? "본인과의 개별 연락으로 교제는 집계하지 않습니다" : undefined}>
                <input
                  type="checkbox"
                  checked={v.contact}
                  disabled={p.isSelf}
                  onChange={(e) => update(p.id, { contact: e.target.checked })}
                  aria-label={`${p.name} 이번 주 개별 연락으로 교제`}
                  className="size-5 accent-[var(--gg-sky-lip)]"
                  data-testid="report-contact-wide"
                />
              </label>

              {/* 사유 · 기도제목 · 지난 기도제목 — 넓은 화면은 표의 마지막 칸 하나에. 작은 화면은 감싼 칸이 없는 것과 같다(display:contents) */}
              <div className="contents space-y-2.5 lg:col-start-2 lg:col-end-[-1] lg:block lg:space-y-2 lg:@[740px]:col-start-5 lg:@[740px]:row-start-1">
              {reasonSlots(v.attendance).filter((k) => !noMeeting || k !== "meeting").map((k) => (
                <input
                  key={k}
                  value={v.reasons[k]}
                  onChange={(e) => update(p.id, { reasons: { ...v.reasons, [k]: e.target.value } })}
                  placeholder={REASON_LABEL[k]}
                  aria-label={`${p.name} ${REASON_LABEL[k]}`}
                  className="gg-field !py-2"
                  data-testid={`reason-${k}`}
                />
              ))}

              {/* 기도제목 — 비어 있어도 아무 강조 없음 */}
              <textarea
                value={v.prayer}
                onChange={(e) => update(p.id, { prayer: e.target.value })}
                // 새 함수라 그릴 때마다 불린다 — '이어서 쓰기' · 사본 복원으로 글이 바뀌어도 높이가 맞는다
                ref={(el) => growField(el)}
                rows={1}
                placeholder="기도제목"
                aria-label={`${p.name} 기도제목`}
                className="gg-field resize-none !py-2"
              />

              {pv ? (
                <div className="flex items-start justify-between gap-3 text-xs leading-relaxed text-muted">
                  <p className="min-w-0">
                    <span className="gg-pill mr-1.5 !h-5 bg-[var(--gg-field)] !px-1.5 !text-[10.5px] text-muted">{pv.weeksAgo === 1 ? "지난주" : `${pv.weeksAgo}주 전`}</span>
                    <span className="gg-text break-keep">{pv.text}</span>
                  </p>
                  {v.prayer.trim() === "" ? (
                    <button
                      type="button"
                      onClick={() => update(p.id, { prayer: pv.text })}
                      className="shrink-0 rounded-full bg-[var(--gg-sky-soft)] px-2.5 py-1 font-bold text-[var(--gg-sky-ink)] active:scale-95"
                    >
                      이어서 쓰기
                    </button>
                  ) : null}
                </div>
              ) : null}
              </div>

            </li>
          );
        })}
      </ol>

      <section className={`${CARD} space-y-2.5 p-4 lg:[grid-area:note]`}>
        <label htmlFor="note" className="flex items-center gap-2 text-[16px] font-bold">
          <Image src="/icons/tossface/u1F4DD.svg" alt="" width={22} height={22} unoptimized className="size-[22px] shrink-0" />
          특이사항
          <span className="ml-auto text-[12.5px] text-[var(--gg-hint)]">목장 · 선택</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNotice(null);
            setPendingDraft(null);
          }}
          rows={3}
          className="gg-field resize-none"
        />
      </section>

      {/* 맨 밑 제출 — 상태 한 줄(있을 때만) + 버튼. 한 번에 하나만 말한다. 화면에 고정하지 않는다(2026-10-23). */}
      {/* 넓은 화면 — 본문 아래에 붙은 제출 줄: 왼쪽 남은 일 · 알림 받는 사람, 오른쪽 단추 */}
      <div className="mt-2 pt-2 lg:sticky lg:bottom-[calc(var(--nn-safe-bottom)+12px)] lg:z-10 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-5 lg:rounded-[22px] lg:bg-[var(--gg-card)] lg:px-5 lg:py-3 lg:shadow-[0_8px_28px_rgb(16_24_40/0.14)] lg:[grid-area:submit]" data-testid="report-submit-bar">
        {!submittedAt ? (
          <p className="hidden text-[12.5px] text-muted lg:col-start-1 lg:block" data-testid="report-notify-hint">
            제출하면 목사님과 다른 리더에게 알림이 가요
          </p>
        ) : null}
        {gain && !notice ? (
          <p
            data-testid="berry-gain"
            className="nn-bump mb-2.5 flex items-center justify-center gap-1.5 text-[15px] font-bold text-[var(--gg-berry-ink)] lg:col-start-1 lg:mb-0 lg:justify-start"
          >
            <BerryIcon className="h-5 w-5" />
            {berryGainText(groupName, gain)}
          </p>
        ) : null}
        {statusLine ? (
          <p
            role={notice ? "alert" : "status"}
            className={`mb-2.5 text-center text-[13px] leading-relaxed font-semibold lg:col-start-1 lg:row-start-1 lg:mb-0 lg:text-left lg:text-[14px] ${notice ? "text-[var(--gg-berry-ink)]" : "text-muted"}`}
          >
            {statusLine}
          </p>
        ) : null}
        <div className={`lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:w-[340px] ${submittedAt ? "" : "grid grid-cols-[1fr_2fr] gap-2"}`}>
          {/* 임시 저장 — 처음 제출하기 전에만(2026-11-06). 제출한 뒤에는 고치면 바로 '다시 제출' 이다 */}
          {submittedAt ? null : (
            <button type="button" onClick={onSave} aria-disabled={busy || !dirty} className="gg-btn gg-btn-white w-full" data-testid="report-save">
              임시 저장
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            aria-disabled={busy || settled}
            className={settled ? "gg-btn gg-btn-white w-full !text-[var(--gg-sky-ink)]" : "gg-btn gg-btn-sky w-full"}
          >
            {settled ? <Icon d={ICON.check} className="h-5 w-5" strokeWidth={3} /> : null}
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
