"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BTN, CARD } from "@/components/ui";
import { validateNewPerson, type NewPersonInput } from "@/lib/people-admin";

import { registerPerson, type RegisterResult } from "./actions";

const FIELD = "gg-field";
// 고르는 칸(라디오) — 고른 칸만 하늘빛으로 찬다. 진짜 input 은 그대로 둔다(키보드 · 화면 읽기)
const CHOICE =
  "inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-[var(--gg-field)] text-[15px] font-semibold text-[var(--gg-section)] transition-colors has-[:checked]:border-[var(--gg-sky)] has-[:checked]:bg-[var(--gg-sky-soft)] has-[:checked]:text-[var(--gg-sky-ink)]";
const TITLE = "gg-display block text-[17px]";
const DIVIDED = "space-y-2 border-t border-[var(--gg-line)] pt-4";

/**
 * Step 11 새 사람 등록 폼 — 다섯 칸, 저장 하나. 미리 골라 둔 값은 없다(목장·역할·성별을 잘못 고른 채 저장되지 않게).
 * 저장되면 그 사람의 명단 상세로 간다. 구구 테마: 다섯 칸을 카드 하나에, 등록은 맨 밑 라임 단추(화면에 고정하지 않는다).
 */
export function NewPersonForm({
  groups,
  thisYear,
  save = registerPerson,
}: {
  groups: { id: string; name: string }[];
  thisYear: number;
  save?: (input: NewPersonInput) => Promise<RegisterResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState<NewPersonInput>({ group_id: "", name: "", group_role: "", gender: "", birth_year: "" });
  const [notice, setNotice] = useState<string | null>(null);

  const set = (part: Partial<NewPersonInput>) => {
    setInput((p) => ({ ...p, ...part }));
    setNotice(null);
  };

  function onSave() {
    if (pending) return;
    const v = validateNewPerson(input, groups.map((g) => g.id), thisYear);
    if (!v.ok) {
      setNotice(v.message);
      return;
    }
    startTransition(async () => {
      const r = await save(input);
      if (r.ok) {
        router.replace(`/admin/people/${r.id}?created=1`); // 등록 화면은 기록에서 빠진다 — 뒤로 하면 명단
        return;
      }
      setNotice(r.message);
    });
  }

  const radio = (name: "group_role" | "gender", options: [string, string][]) => (
    <div className="flex gap-2" role="radiogroup" aria-label={name === "group_role" ? "역할" : "성별"}>
      {options.map(([value, label]) => (
        <label key={value} className={CHOICE}>
          <input
            type="radio"
            name={name}
            value={value}
            checked={input[name] === value}
            onChange={() => set({ [name]: value } as Partial<NewPersonInput>)}
            className="size-4 accent-[var(--gg-sky)]"
          />
          {label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={`${CARD} space-y-4 p-4`}>
        <section className="space-y-2">
          <label htmlFor="new-group" className={TITLE}>
            목장
          </label>
          <select id="new-group" value={input.group_id} onChange={(e) => set({ group_id: e.target.value })} className={FIELD}>
            <option value="">고르세요</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} 목장
              </option>
            ))}
          </select>
        </section>

        <section className={DIVIDED}>
          <label htmlFor="new-name" className={TITLE}>
            이름
          </label>
          <input id="new-name" value={input.name} onChange={(e) => set({ name: e.target.value })} maxLength={20} autoComplete="off" className={FIELD} />
        </section>

        <section className={DIVIDED}>
          <p className={TITLE}>목장에서</p>
          {radio("group_role", [
            ["member", "양"],
            ["leader", "리더"],
          ])}
          {input.group_role === "leader" ? (
            <p className="rounded-2xl bg-[var(--gg-sky-soft)] px-3.5 py-2.5 text-xs leading-relaxed font-semibold text-[var(--gg-sky-ink)]" data-testid="leader-guide">
              리더는 앱에서 로그인 → 이름 골라 신청 → 운영 승인 순서로 계정을 붙입니다. 승인 대기에 뜨면 확인해 주세요.
            </p>
          ) : null}
        </section>

        <section className={DIVIDED}>
          <p className={TITLE}>성별</p>
          {radio("gender", [
            ["male", "남"],
            ["female", "여"],
          ])}
        </section>

        <section className={DIVIDED}>
          <label htmlFor="new-birth" className={TITLE}>
            출생년도 <span className="font-[family-name:var(--font-sans)] text-[13px] text-muted">선택 · 동명이인 구분용</span>
          </label>
          <input
            id="new-birth"
            value={input.birth_year}
            onChange={(e) => set({ birth_year: e.target.value })}
            inputMode="numeric"
            maxLength={4}
            placeholder="2003"
            className={FIELD}
          />
        </section>
      </div>

      <div className="mt-2 pt-2">
        {notice ? (
          <p role="alert" className="mb-2.5 text-center text-[13px] leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
            {notice}
          </p>
        ) : null}
        <button type="button" onClick={onSave} aria-disabled={pending} className={`${BTN("leaf")} w-full`}>
          {pending ? "등록 중…" : "등록"}
        </button>
      </div>
    </div>
  );
}
