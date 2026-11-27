"use client";

import Link from "next/link";
import { useState } from "react";

import { digestFeedback, makeDigest, regenDigest, type FeedbackPatch } from "@/app/(tabs)/pastor/digest-actions";
import { IconCard } from "@/components/toss";
import { BTN, Chevron } from "@/components/ui";
import type { ShownDigest, ShownFeedback, ShownItem } from "@/lib/ai/digest";

/**
 * 목사님 주간 정리 v2 — AI 정리 칸(2026-11-07). 제출 현황 아래, 사각지대 위.
 *   저장된 정리가 있으면 바로 그린다. 없으면 'AI 정리 만들기' 단추 — 누를 때만 만든다(2026-11-08, 마감 전에도).
 *   만드는 동안 한 줄로 기다리고, 실패하면 알리고 단추를 그대로 둔다. 보낼 글이 없던 주는 그렇다고만 쓴다.
 *   눈여겨볼 것 · 감사 제목은 펼쳐 두고, 목장별 한 줄 · 함께 기도할 제목은 접어 둔다. 항목마다 근거 목장 보고서로 간다.
 *
 * 허점 고치기(2026-11-08)
 *   위에 '아직 열지 않은 보고서 n개' — AI 정리가 보고서 읽기를 대신하지 않게. 읽음은 보고서 상세를 열 때만 남는다(링크는 prefetch 없음)
 *   제목 아래 기준 한 줄("12개 목장 중 9개 기준 · 수요일 08:12"), 그 뒤 새로 내거나 고친 보고서가 있으면 '다시 만들기'(한 주 3번)
 *   항목마다 도움 됨 / 아님 · 틀린 내용. 아래에 AI 가 만든 정리라는 안내 한 줄(사용자 요청 — 작은 설명 글 없애기의 예외)
 */
/** 만들기 · 다시 만들기 · 피드백 — 기본은 서버 액션. 디자인 확인 화면은 가짜를 끼워 DB 를 건드리지 않는다 */
export type DigestActions = {
  make: (weekKey: string) => Promise<ShownDigest | null>;
  regen: (weekKey: string) => Promise<ShownDigest | null>;
  feedback: (weekKey: string, itemKey: string, patch: FeedbackPatch) => Promise<{ ok: boolean }>;
};
const SERVER_ACTIONS: DigestActions = { make: makeDigest, regen: regenDigest, feedback: digestFeedback };

export function AiDigestSection({
  weekKey,
  initial,
  canMake,
  unread,
  fresh: initialFresh,
  actions = SERVER_ACTIONS,
}: {
  weekKey: string;
  initial: ShownDigest | null;
  /** 아직 정리가 없고 만들 수 있다 — 단추를 보인다 */
  canMake: boolean;
  /** 제출됐는데 목사님이 아직 열지 않은(또는 연 뒤 고친) 보고서 수 */
  unread: number;
  /** 정리를 만든 뒤 새로 내거나 고친 보고서 수 */
  fresh: number;
  actions?: DigestActions;
}) {
  const [digest, setDigest] = useState<ShownDigest | null>(initial);
  const [make, setMake] = useState<"idle" | "busy" | "failed">("idle");
  const [fresh, setFresh] = useState(initialFresh);
  const [regen, setRegen] = useState<"idle" | "busy" | "failed">("idle");

  const create = () => {
    if (make === "busy") return;
    setMake("busy");
    actions.make(weekKey)
      .then((d) => {
        if (d) {
          setDigest(d);
          setFresh(0);
          setMake("idle");
        } else setMake("failed");
      })
      .catch(() => setMake("failed"));
  };

  const remake = () => {
    if (regen === "busy") return;
    const before = digest?.generatedAt ?? null;
    setRegen("busy");
    actions.regen(weekKey)
      .then((d) => {
        // 새로 만들어졌으면 만든 때가 바뀐다. 실패면 앞의 정리가 그대로 온다(또는 null)
        if (d && d.generatedAt !== before) {
          setDigest(d);
          setFresh(0);
          setRegen("idle");
        } else {
          setRegen("failed");
        }
      })
      .catch(() => setRegen("failed"));
  };

  const unreadLine =
    unread > 0 ? (
      <p className="flex items-center gap-2 px-1 text-[13px] font-semibold text-[var(--gg-sky-ink)]" data-testid="ai-unread">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--gg-sky)]" />
        아직 열지 않은 목장보고서 {unread}개
      </p>
    ) : null;

  if (!digest) {
    if (!canMake) return null;
    if (make === "busy") {
      return (
        <div className="space-y-2">
          {unreadLine}
          <div aria-busy="true">
            <IconCard icon="/icons/tossface/u2728.svg" title="AI 정리" sub="목장보고서를 읽고 있어요" testId="ai-digest-wait" />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {unreadLine}
        <IconCard icon="/icons/tossface/u2728.svg" title="AI 정리" testId="ai-digest-make">
          {make === "failed" ? (
            <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]" role="status" data-testid="ai-make-failed">
              만들지 못했어요. 잠시 뒤 다시 눌러 주세요.
            </p>
          ) : null}
          <button type="button" className={`${BTN("sky", "md")} mt-1 w-full`} onClick={create}>
            AI 정리 만들기
          </button>
        </IconCard>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {unreadLine}
      <IconCard id="ai-digest-title" icon="/icons/tossface/u2728.svg" title="AI 정리" sub={digest.basis ?? undefined} testId="ai-digest">
        <div className="space-y-4">
        {fresh > 0 ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--gg-sky-soft)] px-3.5 py-2.5" data-testid="ai-fresh">
            <span className="text-[13.5px] font-semibold text-[var(--gg-sky-ink)]">새로 들어온 목장보고서 {fresh}개</span>
            {digest.regenLeft > 0 ? (
              <button type="button" className="gg-pill !h-8 shrink-0 bg-[var(--gg-card)] !px-3 !text-[13px] font-bold" onClick={remake} disabled={regen === "busy"}>
                {regen === "busy" ? "다시 만드는 중" : "다시 만들기"}
              </button>
            ) : null}
          </div>
        ) : null}
        {regen === "failed" ? (
          <p className="text-[13px] font-semibold text-[var(--gg-berry-ink)]" role="status" data-testid="ai-regen-failed">
            다시 만들지 못했어요
          </p>
        ) : null}
        {digest.empty ? (
          <p className="text-[14px] text-muted" data-testid="ai-empty">
            정리할 글이 없어요
          </p>
        ) : null}
        {/* 다시 만들면 항목 번호가 바뀐다 — 피드백 상태를 새로 그린다 */}
        <div key={digest.generatedAt ?? "first"} className="space-y-4">
          {digest.highlights.length ? <Items title="눈여겨볼 것" items={digest.highlights} weekKey={weekKey} feedback={digest.feedback} send={actions.feedback} testId="ai-highlights" /> : null}
          {digest.thanks.length ? <Items title="감사 제목" items={digest.thanks} weekKey={weekKey} feedback={digest.feedback} send={actions.feedback} testId="ai-thanks" /> : null}
          {digest.groups.length ? (
            <Fold title={`목장별 한 줄 · ${digest.groups.length}곳`}>
              <Items items={digest.groups} weekKey={weekKey} feedback={digest.feedback} send={actions.feedback} testId="ai-groups" />
            </Fold>
          ) : null}
          {digest.intercession.length ? (
            <Fold title={`함께 기도할 제목 · ${digest.intercession.length}`}>
              <Items items={digest.intercession} weekKey={weekKey} feedback={digest.feedback} send={actions.feedback} testId="ai-intercession" />
            </Fold>
          ) : null}
        </div>
        </div>
      </IconCard>
      <p className="px-1 text-[12px] leading-relaxed text-muted" data-testid="ai-disclaimer">
        AI가 만든 정리라 틀리거나 빠진 것이 있을 수 있어요. 원본 목장보고서를 확인해 주세요.
      </p>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group space-y-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold text-[var(--gg-section)] [&::-webkit-details-marker]:hidden">
        {title}
        <Chevron className="h-4 w-4 transition-transform group-open:rotate-90" />
      </summary>
      {children}
    </details>
  );
}

type SendFeedback = DigestActions["feedback"];

function Items({ title, items, weekKey, feedback, send, testId }: { title?: string; items: ShownItem[]; weekKey: string; feedback: Record<string, ShownFeedback>; send: SendFeedback; testId: string }) {
  return (
    <div className="space-y-2">
      {title ? <h3 className="text-[14px] font-semibold text-[var(--gg-section)]">{title}</h3> : null}
      <ul className="-mx-4 divide-y divide-[var(--gg-line)] border-y border-[var(--gg-line)]" data-testid={testId}>
        {items.map((it) => (
          <li key={it.key} className="space-y-2 px-4 py-3">
            <p className="gg-text text-[14.5px] leading-relaxed">{it.text}</p>
            {it.source ? (
              <Link href={it.source.href} prefetch={false} className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[var(--gg-sky-ink)]" data-testid="ai-source">
                {it.source.label}
                <Chevron className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            <Feedback weekKey={weekKey} itemKey={it.key} initial={feedback[it.key]} save={send} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 도움 됨 / 아님(같은 것을 다시 누르면 지운다) · 틀린 내용(켜고 끈다). 저장이 실패하면 되돌린다 */
function Feedback({ weekKey, itemKey, initial, save }: { weekKey: string; itemKey: string; initial: ShownFeedback | undefined; save: SendFeedback }) {
  const [helpful, setHelpful] = useState<boolean | null>(initial?.helpful ?? null);
  const [wrong, setWrong] = useState(initial?.wrong ?? false);
  const send = (patch: FeedbackPatch, undo: () => void) => {
    save(weekKey, itemKey, patch)
      .then((r) => {
        if (!r.ok) undo();
      })
      .catch(undo);
  };
  const pickHelpful = (v: boolean) => {
    const prev = helpful;
    const next = helpful === v ? null : v;
    setHelpful(next);
    send({ helpful: next }, () => setHelpful(prev));
  };
  const toggleWrong = () => {
    const prev = wrong;
    setWrong(!prev);
    send({ wrong: !prev }, () => setWrong(prev));
  };
  const pill = (on: boolean, tone: "sky" | "berry" = "sky") =>
    `gg-pill !h-7 !px-2.5 !text-[12px] ${
      on ? (tone === "berry" ? "bg-[var(--gg-berry-soft)] text-[var(--gg-berry-ink)]" : "bg-[var(--gg-sky-soft)] text-[var(--gg-sky-ink)]") : "bg-[var(--gg-tile)] text-[var(--gg-hint)]"
    }`;
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      <button type="button" className={pill(helpful === true)} aria-pressed={helpful === true} onClick={() => pickHelpful(true)}>
        도움 됨
      </button>
      <button type="button" className={pill(helpful === false)} aria-pressed={helpful === false} onClick={() => pickHelpful(false)}>
        아님
      </button>
      <button type="button" className={pill(wrong, "berry")} aria-pressed={wrong} onClick={toggleWrong}>
        틀린 내용
      </button>
    </span>
  );
}
