"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { BTN, CARD } from "@/components/ui";
import { finishTo } from "@/lib/nav-history";
import { LIMITS, OCCUPATION_HINTS, TRAINING_STAGES, isSameForm, validateRosterForm, type RosterForm } from "@/lib/roster-edit";

import { useLeaveGuard } from "@/lib/use-leave-guard";

import { addMember, markLeft, saveMember, type MemberResult } from "./actions";
import { LEFT_KEY } from "./undo-left";

const FIELD = "gg-field";
// 토스 결(2026-11-11 사용자 요청) — 둘 중 하나는 회색 판 위 흰 알약(세그먼트), 켜고 끄는 것은 스위치, 여러 개 고르는 것은 라임 알약
const SEG = "flex gap-1 rounded-[14px] bg-[var(--gg-field)] p-1";
const CHOICE =
  "inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[11px] text-[15px] font-semibold text-[var(--gg-section)] transition-colors has-[:checked]:bg-[var(--gg-card)] has-[:checked]:text-foreground has-[:checked]:shadow-[0_1px_4px_rgb(16_24_40/0.12)]";
const TOGGLE = "group flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[16px] font-medium";
const SWITCH =
  "relative h-[30px] w-[50px] shrink-0 rounded-full bg-[var(--gg-line)] transition-colors group-has-[:checked]:bg-[var(--gg-sky)] after:absolute after:top-[3px] after:left-[3px] after:size-6 after:rounded-full after:bg-white after:shadow-[0_1px_4px_rgb(0_0_0/0.2)] after:transition-transform group-has-[:checked]:after:translate-x-5";
const CHIP =
  "inline-flex h-9 cursor-pointer items-center rounded-full bg-[var(--gg-field)] px-3.5 text-[14px] font-semibold text-[var(--gg-section)] transition-colors has-[:checked]:bg-[var(--gg-sky)] has-[:checked]:text-[var(--gg-on-sky)]";
const TITLE = "block text-[14px] font-semibold text-[var(--gg-section)]";
const DIVIDED = "space-y-2";
const HINT = "text-[12.5px] font-normal text-[var(--gg-hint)]";

export type MinistryOption = { id: string; name: string };

/**
 * 명단 한 사람 — 엑셀의 칸 그대로 한 화면에. 고치기(mode edit)와 인원 추가(mode new)가 같이 쓴다.
 * 바뀐 게 없으면 저장이 나가지 않는다. 저장하면 목장 명단으로 돌아간다(이 화면은 기록에서 빠진다).
 * 리더가 새로 넣는 사람은 양으로만(DB 규칙) — 구분 칸을 보이지 않는다.
 */
export function MemberForm({
  mode,
  initial,
  ministries,
  personId,
  groupId,
  expectedUpdatedAt,
  listHref,
  canChooseRole,
  canBeHead = true,
  joinedWeek,
  canMarkLeft,
  thisYear,
  beforeSave,
}: {
  mode: "edit" | "new";
  initial: RosterForm;
  ministries: MinistryOption[];
  personId?: string;
  groupId: string;
  expectedUpdatedAt?: string;
  listHref: string;
  canChooseRole: boolean;
  /** 새로 넣을 때 들어온 주 — 지난 주 보고서에서 왔으면 그 주(2026-11-06) */
  joinedWeek?: string;
  /** 목장장이 될 수 있나 — 활동 중인 사람만(휴면 · 기록 제외 리더에게는 칸을 띄우지 않는다, 2026-11-06) */
  canBeHead?: boolean;
  canMarkLeft: boolean;
  thisYear: number;
  /** 저장 단추 바로 위에 끼울 것 — 상태 · 판정 태그 · 목장 옮기기 · 목장 이동 신청(바로 저장되는 칸, 2026-11-17 사용자: 저장 위로, 2026-11-26 이동 신청도) */
  beforeSave?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<RosterForm>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const dirty = mode === "new" || !isSameForm(form, initial);
  // 손댄 것이 있으면 나가기 전에 묻는다(2026-11-05) — 새로 넣기도 빈 채로는 묻지 않는다
  // 저장이 끝나면 지킴 칸을 다시 얹지 않는다(2026-11-10) — 다시 얹으면 finishTo 가 1.5초를 다 기다린 뒤에야 떠난다
  const [saved, setSaved] = useState(false);
  useLeaveGuard(!isSameForm(form, initial), pending || saved);
  const set = (part: Partial<RosterForm>) => {
    setForm((f) => ({ ...f, ...part }));
    setNotice(null);
  };
  const toggleMinistry = (id: string, on: boolean) =>
    set({ ministries: on ? [...new Set([...form.ministries, id])] : form.ministries.filter((m) => m !== id) });

  const finish = (r: MemberResult) => {
    if (r.ok) {
      setSaved(true);
      finishTo(listHref, router);
      return;
    }
    setNotice(r.message);
    if (r.conflict) setConflict(true);
  };

  function onSave() {
    if (pending || conflict || !dirty) return;
    const v = validateRosterForm(form, thisYear);
    if (!v.ok) {
      setNotice(v.message);
      return;
    }
    startTransition(async () => {
      finish(mode === "new" ? await addMember(groupId, form, joinedWeek) : await saveMember(personId!, form, expectedUpdatedAt!));
    });
  }

  function onLeft() {
    if (pending || !personId || !expectedUpdatedAt) return;
    setLeaving(false);
    startTransition(async () => {
      const r = await markLeft(personId, expectedUpdatedAt);
      if (r.ok) {
        // 명단 위에 '되돌리기' 를 한 번 띄운다(undo-left.tsx) — 주소에 싣지 않는다(2026-11-05)
        try {
          sessionStorage.setItem(LEFT_KEY, JSON.stringify({ id: personId, name: form.name }));
        } catch {
          /* 저장이 막힌 브라우저 — 되돌리기 없이 */
        }
      }
      finish(r);
    });
  }

  // 지금 값이 목록 밖이면(예전 명단의 다른 말) 그 값도 고를 수 있게 둔다
  const stages = form.training_stage && !(TRAINING_STAGES as readonly string[]).includes(form.training_stage) ? [...TRAINING_STAGES, form.training_stage] : TRAINING_STAGES;

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-4 p-4`}>
        <div className="space-y-2">
          <label htmlFor="m-name" className={TITLE}>
            이름
          </label>
          <input id="m-name" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={LIMITS.name} autoComplete="off" className={FIELD} />
        </div>

        {canChooseRole ? (
          <div className={DIVIDED}>
            <p className={TITLE}>구분</p>
            <div className={SEG} role="radiogroup" aria-label="구분">
              {(
                [
                  ["leader", "리더"],
                  ["member", "양"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={CHOICE}>
                  <input
                    type="radio"
                    name="m-role"
                    checked={form.group_role === value}
                    // 양으로 바꾸면 목장장도 함께 푼다 — 숨은 칸이 켜진 채 저장이 막히지 않게(2026-11-06)
                    onChange={() => set(value === "member" ? { group_role: value, is_group_head: false } : { group_role: value })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className={DIVIDED}>
          <label htmlFor="m-stage" className={TITLE}>
            훈련단계 <span className={HINT}>교육과정</span>
          </label>
          <select id="m-stage" value={form.training_stage} onChange={(e) => set({ training_stage: e.target.value })} className={FIELD}>
            <option value="">없음</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className={`${DIVIDED} grid grid-cols-2 gap-3`}>
          <div className="space-y-2">
            <label htmlFor="m-birth" className={TITLE}>
              출생년도
            </label>
            <input
              id="m-birth"
              value={form.birth_year}
              onChange={(e) => set({ birth_year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              inputMode="numeric"
              placeholder="2001"
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <p className={TITLE}>성별</p>
            <div className={SEG} role="radiogroup" aria-label="성별">
              {(
                [
                  ["male", "남"],
                  ["female", "여"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={CHOICE}>
                  <input type="radio" name="m-gender" checked={form.gender === value} onChange={() => set({ gender: value })} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`${CARD} space-y-4 p-4`}>
        <div className="space-y-2">
          <label htmlFor="m-job" className={TITLE}>
            직업
          </label>
          <input
            id="m-job"
            value={form.occupation}
            onChange={(e) => set({ occupation: e.target.value })}
            maxLength={LIMITS.occupation}
            list="m-job-hints"
            autoComplete="off"
            className={FIELD}
          />
          <datalist id="m-job-hints">
            {OCCUPATION_HINTS.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-1.5">
            {OCCUPATION_HINTS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => set({ occupation: h })}
                className={`h-8 rounded-full px-3 text-[13px] font-semibold ${form.occupation === h ? "bg-[var(--gg-sky)] text-[var(--gg-on-sky)]" : "bg-[var(--gg-field)] text-[var(--gg-section)]"}`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        <div className={DIVIDED}>
          <label htmlFor="m-aff" className={TITLE}>
            소속 <span className={HINT}>학교 · 회사</span>
          </label>
          <input id="m-aff" value={form.affiliation} onChange={(e) => set({ affiliation: e.target.value })} maxLength={LIMITS.affiliation} autoComplete="off" className={FIELD} />
        </div>
        {/* 캠퍼스 모임(2026-11-16) — 적으면 캠퍼스 모임 명단에 그 캠퍼스로 나온다. 비우면 빠진다 */}
        <div className={DIVIDED}>
          <label htmlFor="m-campus" className={TITLE}>
            캠퍼스 <span className={HINT}>캠퍼스 모임</span>
          </label>
          <input id="m-campus" value={form.campus} onChange={(e) => set({ campus: e.target.value })} maxLength={LIMITS.campus} autoComplete="off" className={FIELD} data-testid="m-campus" />
        </div>
        {/* 출석 제외(2026-11-17) — 두세 글자(교환 · 군복무 …). 적으면 출석부에서 결석을 세지 않고 회색 칸에 이 글자 */}
        <div className={DIVIDED}>
          <label htmlFor="m-off" className={TITLE}>
            출석 제외 <span className={HINT}>교환 · 군복무</span>
          </label>
          <input id="m-off" value={form.attendance_off} onChange={(e) => set({ attendance_off: e.target.value })} maxLength={LIMITS.attendanceOff} autoComplete="off" className={FIELD} data-testid="m-off" />
        </div>
        {/* 목장장(2026-11-06) — 리더만, 한 목장에 한 명. 정하면 전 목장장은 풀린다 */}
        {mode === "edit" && form.group_role === "leader" && (canBeHead || form.is_group_head) ? (
          <div className={DIVIDED}>
            <label className={TOGGLE} data-testid="group-head">
              <input type="checkbox" checked={form.is_group_head} onChange={(e) => set({ is_group_head: e.target.checked })} className="sr-only" />
              목자
              <span aria-hidden className={SWITCH} />
            </label>
          </div>
        ) : null}
        <div className="space-y-1">
          <label className={TOGGLE}>
            <input type="checkbox" checked={form.youth_member} onChange={(e) => set({ youth_member: e.target.checked })} className="sr-only" />
            청년대학부 회원
            <span aria-hidden className={SWITCH} />
          </label>
          <label className={TOGGLE}>
            <input type="checkbox" checked={form.assembly_member} onChange={(e) => set({ assembly_member: e.target.checked })} className="sr-only" />
            공동의회 회원
            <span aria-hidden className={SWITCH} />
          </label>
        </div>
      </section>

      <section className={`${CARD} space-y-2.5 p-4`} aria-labelledby="m-serve">
        <p id="m-serve" className={TITLE}>
          섬김 부서
        </p>
        <div className="flex flex-wrap gap-2">
          {ministries.map((m) => (
            <label key={m.id} className={CHIP}>
              <input type="checkbox" checked={form.ministries.includes(m.id)} onChange={(e) => toggleMinistry(m.id, e.target.checked)} className="sr-only" />
              {m.name}
            </label>
          ))}
        </div>
      </section>

      <section className={`${CARD} space-y-2 p-4`}>
        <label htmlFor="m-note" className={TITLE}>
          비고
        </label>
        <textarea id="m-note" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={LIMITS.note} rows={3} className={`${FIELD} !h-auto py-2.5`} />
      </section>

      {beforeSave}

      <div className="pt-2">
        {/* 저장 단추는 늘 맨 아래(2026-11-26 사용자) — '목장을 떠났어요' 도 저장 위로 */}
        {mode === "edit" && canMarkLeft ? (
          // 회색 단추 → 묻는 창(2026-11-06 사용자 요청). 빨간색은 쓰지 않는다
          <button
            type="button"
            onClick={() => !pending && setLeaving(true)}
            aria-disabled={pending}
            className={`${BTN("ghost", "sm")} mb-3 w-full !text-[14px] !text-muted`}
            data-testid="member-left"
          >
            목장을 떠났어요
          </button>
        ) : null}
        {notice ? (
          <p role="alert" className="mb-2.5 text-center text-[13px] leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
            {notice}
          </p>
        ) : null}
        <button type="button" onClick={onSave} aria-disabled={pending || conflict || !dirty} className={`${BTN("sky")} w-full`} data-testid="member-save">
          {pending ? "저장 중…" : mode === "new" ? "명단에 추가" : "저장"}
        </button>
        {leaving ? <LeaveConfirm onYes={onLeft} onNo={() => setLeaving(false)} /> : null}
      </div>
    </div>
  );
}

/** '목장을 떠났어요' 묻는 창(2026-11-06) — 예 · 아니오. 바깥을 누르거나 Esc 면 아니오 */
function LeaveConfirm({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center print:hidden" data-testid="leave-confirm">
      <button type="button" aria-label="닫기" onClick={onNo} className="gg-fade-in absolute inset-0 bg-black/40" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-confirm-title"
        className="gg-sheet-up relative w-full max-w-sm rounded-t-[28px] bg-[var(--gg-card)] px-6 pt-7 pb-[calc(var(--nn-safe-bottom)+1.25rem)] text-center shadow-[0_-8px_32px_rgb(0_0_0/0.18)]"
      >
        <h2 id="leave-confirm-title" className="gg-display text-[22px] leading-snug">
          정말 명단에서 뺄까요?
        </h2>
        <p className="mt-2 text-[14px] text-muted">지난 기록은 남아요</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onNo} className={`${BTN("white")} w-full`}>
            아니오
          </button>
          <button type="button" onClick={onYes} className={`${BTN("sky")} w-full`} data-testid="leave-yes">
            예
          </button>
        </div>
      </section>
    </div>
  );
}
