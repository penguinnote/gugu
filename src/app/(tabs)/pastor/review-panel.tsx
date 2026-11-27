"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";

import { BTN, ICON, Icon } from "@/components/ui";
import { benchKeyOf } from "@/lib/pastor-review";
import { REPORT_STAMPS, REPORT_STAMP_LABELS } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";

import { setNote, setStamp } from "./actions";

type Stamp = Database["public"]["Enums"]["report_stamp"];
const STAMP = REPORT_STAMPS[0];

/** 도장 · 한마디 저장 — 기본은 서버 액션(actions.ts, 휴대폰 상세와 같다). 디자인 확인 화면은 가짜를 끼운다 */
export type ReviewActions = {
  stamp: (reportId: string, stamp: Stamp) => Promise<{ ok: true; stamp: Stamp | null } | { ok: false; message: string }>;
  note: (reportId: string, note: string) => Promise<{ ok: true; note: string | null } | { ok: false; message: string }>;
};
const SERVER: ReviewActions = { stamp: setStamp, note: setNote };

/**
 * 넓은 화면 단축키(2026-11-27) — J 다음 목장 · K 이전 목장 · S 도장. 입력칸 안에서는 쉰다(lib/pastor-review benchKeyOf).
 * 작업대가 보이는 동안만(1024px 아래에서는 작업대가 display:none 이라 offsetParent 가 없다) — 휴대폰 배치에서 키보드를 써도 움직이지 않게.
 */
function useBenchKeys(probe: RefObject<HTMLElement | null>, on: { next: () => void; prev: () => void; stamp?: () => void }) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!probe.current || probe.current.offsetParent === null) return;
      const k = benchKeyOf(e);
      if (!k) return;
      const fn = k === "next" ? latest.current.next : k === "prev" ? latest.current.prev : latest.current.stamp;
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [probe]);
}

/** 목장을 바꾼 뒤 — 작업대 위가 화면 위로 지나가 있으면 작업대 맨 위로(문서 맨 위까지 올리지는 않는다) */
function useBenchTop(key: string | null) {
  useEffect(() => {
    const el = document.getElementById("bench");
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [key]);
}

/** 고른 목장이 없거나 미제출일 때 — J · K 만 */
export function BenchKeys({ selected, next, prev }: { selected: string | null; next: string | null; prev: string | null }) {
  const router = useRouter();
  const probe = useRef<HTMLSpanElement>(null);
  useBenchTop(selected);
  useBenchKeys(probe, {
    next: () => next && router.replace(next, { scroll: false }),
    prev: () => prev && router.replace(prev, { scroll: false }),
  });
  return <span ref={probe} aria-hidden className="sr-only" />;
}

/**
 * 넓은 화면 오른쪽 칸(2026-11-27) — 지금 앱의 도장('기도하겠습니다')과 한마디(리더에게, 200자)를 한 칸에.
 *   남기고 다음 목장  한마디를 고쳤으면 저장하고 다음 미확인 목장으로. 도장은 찍지 않는다 — 휴대폰 상세도 한마디(보내기)와 도장이 따로다(2026-11-27 사용자).
 *                     미확인이 더 없으면 그 자리에서 '모두 확인했어요'
 *   건너뛰기          저장 없이 다음 미확인 목장으로
 *   도장              '기도하겠습니다' 단추와 S 로만 찍고 끈다(그 자리에 머문다 — 휴대폰 상세의 도장 단추와 달리 넘어가지 않는다)
 * 저장 · 권한 판정은 휴대폰 상세와 같은 서버 액션(set_report_stamp · set_report_note)이 한다.
 */
export function ReviewPanel({
  reportId,
  initialStamp,
  initialNote,
  next,
  prev,
  unchecked,
  actions = SERVER,
}: {
  reportId: string;
  initialStamp: Stamp | null;
  initialNote: string | null;
  /** J · K — 제출된 목장 사이 한 칸(없으면 null) */
  next: string | null;
  prev: string | null;
  /** 다음 미확인 목장 주소(없으면 null) */
  unchecked: string | null;
  actions?: ReviewActions;
}) {
  const router = useRouter();
  const probe = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<Stamp | null>(initialStamp);
  const [saved, setSaved] = useState<string | null>(initialNote);
  const [text, setText] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const on = current === STAMP;
  const dirty = text.trim() !== (saved ?? "");
  const left = 200 - text.trim().length;
  useBenchTop(reportId);

  const toggle = () => {
    if (pending) return;
    setError(null);
    const before = current;
    setCurrent(on ? null : STAMP);
    start(async () => {
      const r = await actions.stamp(reportId, STAMP);
      if (!r.ok) {
        setCurrent(before);
        setError(r.message);
        return;
      }
      setCurrent(r.stamp);
    });
  };

  const go = (href: string | null) => {
    if (href) router.replace(href, { scroll: false });
    else {
      setDone(true);
      router.refresh();
    }
  };

  const leave = () => {
    if (pending) return;
    setError(null);
    if (left < 0) return setError("한마디는 200자까지예요");
    start(async () => {
      if (dirty) {
        const r = await actions.note(reportId, text);
        if (!r.ok) return setError(r.message);
        setSaved(r.note);
        setText(r.note ?? "");
      }
      go(unchecked);
    });
  };

  useBenchKeys(probe, {
    next: () => next && router.replace(next, { scroll: false }),
    prev: () => prev && router.replace(prev, { scroll: false }),
    stamp: toggle,
  });

  return (
    <section ref={probe} aria-label="도장과 한마디" className="space-y-3 rounded-[22px] bg-[var(--gg-card)] p-4 shadow-[var(--gg-card-shadow)]" data-testid="review-panel">
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={toggle}
        className={on ? `${BTN("white")} w-full !text-[var(--gg-leaf-ink)]` : `${BTN("leaf")} w-full`}
        data-testid="review-stamp"
      >
        {REPORT_STAMP_LABELS[STAMP]}
        {on ? <Icon d={ICON.check} className="h-5 w-5" strokeWidth={3} /> : null}
      </button>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone(false);
        }}
        maxLength={220}
        rows={4}
        placeholder="리더에게 한마디"
        aria-label="리더에게 한마디"
        className="block w-full resize-none rounded-2xl bg-[var(--gg-field)] px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted"
        data-testid="review-note"
      />
      <p className={`text-right text-[12px] tabular-nums ${left < 0 ? "font-bold text-[var(--gg-berry-ink)]" : "text-muted"}`}>
        {saved && !dirty ? "보냈어요 ✓" : `${Math.max(0, text.trim().length)} / 200`}
      </p>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <button type="button" onClick={leave} disabled={pending} className={`${BTN("sky", "sm")} w-full !h-11`} data-testid="review-leave">
          남기고 다음 목장
        </button>
        <button type="button" onClick={() => go(unchecked)} disabled={pending} className={`${BTN("white", "sm")} w-full !h-11`} data-testid="review-skip">
          건너뛰기
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-center text-[13px] font-semibold text-[var(--gg-berry-ink)]">
          {error}
        </p>
      ) : done ? (
        <p role="status" className="text-center text-[13.5px] font-bold text-[var(--gg-leaf-ink)]" data-testid="review-all-done">
          미확인 목장을 모두 확인했어요
        </p>
      ) : null}
      <p className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--gg-hint)]" data-testid="review-keys">
        <span>
          <Kbd>J</Kbd> 다음 목장
        </span>
        <span>
          <Kbd>K</Kbd> 이전 목장
        </span>
        <span>
          <Kbd>S</Kbd> {REPORT_STAMP_LABELS[STAMP]}
        </span>
      </p>
    </section>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="mr-0.5 inline-grid h-5 min-w-5 place-items-center rounded-md border border-[var(--gg-line)] bg-[var(--gg-tile)] px-1 font-sans text-[11px] font-bold text-[var(--gg-section)]">{children}</kbd>;
}
