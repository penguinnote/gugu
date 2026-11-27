"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CARD } from "@/components/ui";

import { saveVillage } from "./actions";

/** 마을 — 목장에 붙는 한 칸(명단 엑셀의 A열). 고르면 바로 저장한다 */
export function VillagePicker({ groupId, value, options }: { groupId: string; value: string; options: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  function onChange(next: string) {
    const before = current;
    setCurrent(next);
    setNotice(null);
    startTransition(async () => {
      const r = await saveVillage(groupId, next);
      if (r.ok) {
        setNotice({ ok: true, text: "저장했어요" });
        router.refresh();
      } else {
        setCurrent(before);
        setNotice({ ok: false, text: r.message });
      }
    });
  }

  return (
    <section className={`${CARD} flex items-center gap-3 px-4 py-3`}>
      <label htmlFor="village" className="gg-display shrink-0 text-[17px]">
        마을
      </label>
      <select id="village" value={current} onChange={(e) => onChange(e.target.value)} aria-busy={pending} className="gg-field min-w-0 flex-1">
        <option value="">없음</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {notice ? (
        <span role={notice.ok ? "status" : "alert"} className={`shrink-0 text-[12.5px] font-semibold ${notice.ok ? "text-[var(--gg-leaf-ink)]" : "text-[var(--gg-berry-ink)]"}`}>
          {notice.text}
        </span>
      ) : null}
    </section>
  );
}
