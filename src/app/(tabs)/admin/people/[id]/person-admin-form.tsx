"use client";

import { useRouter } from "next/navigation";
import { useContext, useEffect, useState, useTransition } from "react";

import { BTN, CARD } from "@/components/ui";
import { CARE_STATUS_LABELS, GROUP_ROLE_LABELS, PERSON_STATUS_LABELS } from "@/lib/labels";
import { isSamePatch, patchOf, validatePatch, type GroupRef, type PersonAdminRow, type PersonPatch } from "@/lib/people-admin";
import type { Database } from "@/lib/supabase/database.types";

import { PanelDirty } from "../panel-dirty";
import { unlinkAccount, updatePerson, type PersonResult } from "./actions";

type Enums = Database["public"]["Enums"];

const SELECT = "gg-field";
// 고르는 칸(라디오) — 고른 칸만 하늘빛으로 찬다. 진짜 input 은 그대로 둔다(키보드 · 화면 읽기)
const CHOICE =
  "inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-[var(--gg-field)] text-[15px] font-semibold text-[var(--gg-section)] transition-colors has-[:checked]:border-[var(--gg-sky)] has-[:checked]:bg-[var(--gg-sky-soft)] has-[:checked]:text-[var(--gg-sky-ink)]";
// 켜고 끄는 줄(체크박스) — 켜면 잎빛
const TOGGLE =
  "flex cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-transparent bg-[var(--gg-field)] px-3.5 py-3 text-sm leading-relaxed font-semibold transition-colors has-[:checked]:border-[var(--gg-leaf)] has-[:checked]:bg-[var(--gg-leaf-soft)] has-[:checked]:text-[var(--gg-leaf-ink)]";
const TITLE = "gg-display block text-[17px]";

export type LinkedAccount = { name: string; providerLabel: string | null; roleLabel: string } | null;

/**
 * A-1 사람 수정 폼 — 한 화면에 전부, 저장 버튼 하나. 바뀐 게 없으면 저장이 나가지 않는다.
 * DB 가 거부할 조합은 저장 전에 말로 막는다(validatePatch). 계정 연결 해제는 두 번 눌러야 한다 —
 * 되돌리려면 본인이 다시 신청→승인해야 하는 일이다.
 * 구구 테마: 묶음마다 카드 하나, 라디오는 통통한 고르는 칸, 저장은 맨 밑 라임 단추(화면에 고정하지 않는다).
 */
export function PersonAdminForm({
  person,
  groups,
  expectedUpdatedAt,
  linked,
  save = updatePerson,
  unlink = unlinkAccount,
}: {
  person: PersonAdminRow;
  groups: GroupRef[];
  expectedUpdatedAt: string;
  linked: LinkedAccount;
  save?: typeof updatePerson;
  unlink?: typeof unlinkAccount;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [patch, setPatch] = useState<PersonPatch>(patchOf(person));
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [unlinkStep, setUnlinkStep] = useState<0 | 1>(0);
  const [disable, setDisable] = useState(false);

  const dirty = !isSamePatch(patch, patchOf(person));
  // 넓은 화면 명단의 편집 칸이면 고친 채인지 알린다(다른 사람을 누를 때 버릴지 묻는다, 2026-11-27)
  const reportDirty = useContext(PanelDirty);
  useEffect(() => {
    reportDirty?.(dirty);
  }, [dirty, reportDirty]);
  useEffect(() => () => reportDirty?.(false), [reportDirty]);
  const set = (part: Partial<PersonPatch>) => {
    setPatch((p) => ({ ...p, ...part }));
    setNotice(null);
  };

  function onSave() {
    if (pending || conflict || !dirty) return;
    const why = validatePatch(person, patch);
    if (why) {
      setNotice(why);
      return;
    }
    startTransition(async () => {
      const r: PersonResult = await save(person.id, patch, expectedUpdatedAt);
      if (r.ok) {
        router.refresh();
        setNotice("저장했습니다.");
        return;
      }
      setNotice(r.message);
      if (r.conflict) setConflict(true);
    });
  }

  function onUnlink() {
    if (pending) return;
    if (unlinkStep === 0) {
      setUnlinkStep(1);
      return;
    }
    startTransition(async () => {
      const r = await unlink(person.id, disable);
      if (r.ok) {
        router.refresh();
        setUnlinkStep(0);
        setNotice("연결을 해제했습니다. 계정은 미승인으로 돌아갔습니다.");
        return;
      }
      setNotice(r.message);
    });
  }

  const statuses = Object.keys(PERSON_STATUS_LABELS) as Enums["person_status"][];
  const cares = Object.keys(CARE_STATUS_LABELS) as Enums["care_status"][];

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-4 p-4`}>
        <div className="space-y-2">
          <label htmlFor="group" className={TITLE}>
            소속 목장
          </label>
          <select
            id="group"
            value={patch.group_id}
            // 목장을 옮기면 목장장은 내려놓는다 — 새 목장에는 이미 목장장이 있을 수 있다(목장당 한 명, Step 11)
            onChange={(e) => set({ group_id: e.target.value, is_group_head: e.target.value === person.group_id ? patch.is_group_head : false })}
            className={SELECT}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} 목장
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 border-t border-[var(--gg-line)] pt-4">
          <p className={TITLE}>목장에서</p>
          <div className="flex gap-2" role="radiogroup" aria-label="역할">
            {(["leader", "member"] as const).map((r) => (
              <label key={r} className={CHOICE}>
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={patch.group_role === r}
                  onChange={() => set({ group_role: r, is_group_head: r === "leader" ? patch.is_group_head : false })}
                  className="size-4 accent-[var(--gg-sky)]"
                />
                {GROUP_ROLE_LABELS[r]}
              </label>
            ))}
          </div>
          {patch.group_role === "leader" ? (
            <label className={TOGGLE}>
              <input
                type="checkbox"
                checked={patch.is_group_head}
                onChange={(e) => set({ is_group_head: e.target.checked })}
                className="mt-0.5 size-[18px] shrink-0 accent-[var(--gg-leaf)]"
              />
              <span>
                목자
              </span>
            </label>
          ) : null}
          {person.is_group_head && patch.group_id !== person.group_id ? (
            <p className="rounded-2xl bg-[var(--gg-sun-soft)] px-3.5 py-2.5 text-xs leading-relaxed font-semibold text-[var(--gg-sun-ink)]" data-testid="head-dropped">
              목장을 옮기면 목자는 내려놓습니다. 새 목장에서 목자이면 옮긴 뒤 다시 지정하세요.
            </p>
          ) : null}
        </div>
      </section>

      <section className={`${CARD} space-y-4 p-4`}>
        <div className="space-y-2">
          <label htmlFor="status" className={TITLE}>
            상태
          </label>
          <select id="status" value={patch.status} onChange={(e) => set({ status: e.target.value as Enums["person_status"] })} className={SELECT}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {PERSON_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {linked && patch.status === "left" && person.status !== "left" ? (
            <p
              className="rounded-2xl bg-[var(--gg-sun-soft)] px-3.5 py-2.5 text-xs leading-relaxed font-semibold text-[var(--gg-sun-ink)]"
              role="note"
              data-testid="left-linked"
            >
              계정은 연결된 채로 남습니다. 목장보고서 접근은 저절로 끊기지만, 앱을 더 쓰지 않으면 아래에서 연결을 해제하세요.
            </p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-[var(--gg-line)] pt-4">
          <label htmlFor="care" className={TITLE}>
            판정 태그
          </label>
          <select id="care" value={patch.care_status} onChange={(e) => set({ care_status: e.target.value as Enums["care_status"] })} className={SELECT}>
            {cares.map((c) => (
              <option key={c} value={c}>
                {CARE_STATUS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={`${CARD} space-y-2.5 p-4`}>
        <p className={TITLE}>앱 계정</p>
        {linked ? (
          <div className="space-y-3 rounded-2xl bg-[var(--gg-stone-soft)] px-3.5 py-3 text-sm" data-testid="linked">
            <p className="font-bold">
              {linked.name}
              <span className="ml-1.5 text-xs font-normal text-muted">
                {linked.providerLabel ? `${linked.providerLabel} · ` : ""}
                {linked.roleLabel}
              </span>
            </p>
            {unlinkStep === 1 ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={disable} onChange={(e) => setDisable(e.target.checked)} className="size-4 accent-[var(--gg-berry)]" />
                남의 계정이었습니다 — 계정을 잠급니다
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUnlink}
                aria-disabled={pending}
                className={
                  unlinkStep === 0
                    ? `${BTN("white", "sm")} !text-[14px] !text-[var(--gg-berry-ink)]`
                    : `${BTN("berry", "sm")} !h-auto min-h-10 w-full py-2 !text-[14px] leading-snug`
                }
                data-testid="unlink"
              >
                {unlinkStep === 0 ? "연결 해제" : "정말 해제 — 계정은 미승인으로 돌아갑니다"}
              </button>
              {unlinkStep === 1 ? (
                <button type="button" onClick={() => setUnlinkStep(0)} className={`${BTN("ghost", "sm")} !text-[14px]`}>
                  취소
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            연결된 계정이 없습니다.
          </p>
        )}
      </section>

      <div className="mt-2 pt-2">
        {notice ? (
          <p
            role={notice === "저장했습니다." ? "status" : "alert"}
            className={`mb-2.5 text-center text-[13px] leading-relaxed font-semibold ${
              notice === "저장했습니다." || notice.startsWith("연결을 해제했습니다") ? "text-[var(--gg-leaf-ink)]" : "text-[var(--gg-berry-ink)]"
            }`}
          >
            {notice}
          </p>
        ) : null}
        <button type="button" onClick={onSave} aria-disabled={pending || conflict || !dirty} className={`${BTN("leaf")} w-full`}>
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
