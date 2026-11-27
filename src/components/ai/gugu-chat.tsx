"use client";

import { useEffect, useRef, useState } from "react";

import { BackButton } from "@/components/back-button";
import { Gugu } from "@/components/gugu";

import type { QuotaView } from "@/lib/ai/chat-quota";
import type { ChatEvent, ChatTurn } from "@/lib/ai/gugu-chat";

export type RequestMore = (reason: string | null) => Promise<{ ok: true; quota: QuotaView } | { ok: false; message: string }>;

/**
 * 구구 챗봇 화면(2026-11-12) — '구구에게 물어보기'.
 *   위 ‹ · 가운데 구구 · 오른쪽 '새 대화' / 가운데 말풍선(내 말은 라임 오른쪽, 구구 말은 흰 칸 왼쪽 + 구구 얼굴) / 아래 입력 칸 + 보내기
 *   처음엔 큰 구구와 물어볼 거리 단추 몇 개.
 * 대화는 이 폰에만(localStorage — 사용자 결정, 서버에 남기지 않는다). 키보드가 뜨면 보이는 높이(visualViewport)에 맞춰 입력 칸이 키보드 위에 붙는다.
 * send 는 서버(/api/gugu/chat)와 줄 단위 JSON 으로 주고받는다. 디자인 확인 화면은 가짜 send 를 넣는다.
 *
 * 질문 횟수(2026-11-12, 리더만) — 입력 칸 위 오른쪽에 연한 회색 '쓴 횟수/한도'(12/20). 세는 것은 서버(DB)가 하고 화면은 받은 숫자만 보인다.
 * 다 쓰면 입력 칸 대신 '이번 달 질문을 다 썼어요' + '추가 신청': 그달 첫 신청은 바로 +5, 그다음은 사유(선택 · 100자) → '신청됨'.
 */

export type ChatSend = (turns: ChatTurn[], onEvent: (e: ChatEvent) => void) => Promise<void>;

const KEEP = 30;
const MAX = 1000;

export const serverSend: ChatSend = async (turns, onEvent) => {
  const res = await fetch("/api/gugu/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turns }) });
  if (!res.ok || !res.body) {
    onEvent({ t: "e", v: "구구가 지금 답하지 못해요. 잠시 뒤 다시 해 주세요." });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line) as ChatEvent);
    }
  }
};

function load(key: string): ChatTurn[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as ChatTurn[]).filter((t) => t && typeof t.text === "string") : [];
  } catch {
    return [];
  }
}
function save(key: string, turns: ChatTurn[]) {
  try {
    localStorage.setItem(key, JSON.stringify(turns.slice(-KEEP)));
  } catch {}
}

export function GuguChat({
  storageKey,
  suggestions,
  send = serverSend,
  back = "/",
  quota: quota0 = null,
  requestMore,
}: {
  storageKey: string;
  suggestions: string[];
  send?: ChatSend;
  back?: string;
  /** 이번 달 질문 횟수 — 없거나 unlimited(목사님)면 숫자 · 소진 카드 없음 */
  quota?: QuotaView | null;
  requestMore?: RequestMore;
}) {
  const [quota, setQuota] = useState<QuotaView | null>(quota0);
  const counted = !!quota && !quota.unlimited;
  const exhausted = counted && quota.used >= quota.quota;
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<{ text: string; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 폰에 남긴 대화 — 붙은 뒤에만 읽는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(load(storageKey));
  }, [storageKey]);

  // 키보드가 뜨면 보이는 높이에 맞춘다(아이폰 · 갤럭시 모두 입력 칸이 키보드 위에)
  useEffect(() => {
    const vv = window.visualViewport;
    const el = boxRef.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, live, error]);

  const ask = async (text: string) => {
    const q = text.trim().slice(0, MAX);
    if (!q || live) return;
    const next = [...turns, { role: "user" as const, text: q }];
    setTurns(next);
    save(storageKey, next);
    setDraft("");
    setError(null);
    setLive({ text: "", status: null });
    let answer = "";
    let failed: string | null = null;
    let out = false;
    await send(next.slice(-12), (e) => {
      if (e.t === "d") {
        answer += e.v;
        setLive({ text: answer, status: null });
      } else if (e.t === "s") setLive({ text: answer, status: e.v });
      else if (e.t === "e") failed = e.v;
      else if (e.t === "q") setQuota((q) => (q ? { ...q, used: e.used, quota: e.quota } : q));
      else if (e.t === "x") {
        out = true;
        setQuota((q) => (q ? { ...q, used: e.used, quota: e.quota } : q));
      }
    }).catch(() => {
      failed = "구구가 지금 답하지 못해요. 잠시 뒤 다시 해 주세요.";
    });
    setLive(null);
    if (out) {
      // 다 써서 묻지 못했다 — 말풍선을 거두고 쓴 글은 입력 칸에 돌려 둔다(추가를 받으면 바로 다시 보낸다)
      setTurns(turns);
      save(storageKey, turns);
      setDraft(q);
      return;
    }
    if (answer.trim()) {
      const done = [...next, { role: "assistant" as const, text: answer.trim() }];
      setTurns(done);
      save(storageKey, done);
    }
    if (failed) setError(failed);
  };

  const reset = () => {
    setTurns([]);
    setError(null);
    save(storageKey, []);
  };

  return (
    <div ref={boxRef} className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col bg-[var(--background)]" data-testid="gugu-chat">
      <header className="shrink-0 pt-[var(--nn-safe-top)]">
        <div className="mx-auto flex h-[52px] w-full max-w-sm items-center justify-between px-2">
          <BackButton fallback={back} />
          <span className="flex items-center gap-1.5 text-[17px] font-bold">
            <Gugu mood="base" size={28} className="size-7" />
            구구
          </span>
          {turns.length > 0 && !live ? (
            <button type="button" onClick={reset} className="h-10 px-3 text-[14px] font-semibold text-[var(--gg-section)]" data-testid="gugu-reset">
              새 대화
            </button>
          ) : (
            <span className="w-[72px]" />
          )}
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-sm flex-col gap-3 px-4 pt-2 pb-4">
          {turns.length === 0 && !live ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
              <div className="gg-bob">
                <Gugu mood="wave" size={104} title="손을 흔드는 구구" />
              </div>
              <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">무엇이든 물어보세요</h1>
              <div className="flex w-full flex-col gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="gg-card w-full rounded-[18px] px-4 py-3.5 text-left text-[15px] font-semibold" data-testid="gugu-suggest">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((t, i) => (t.role === "user" ? <Mine key={i} text={t.text} /> : <Theirs key={i} text={t.text} />))}
          {live ? <Theirs text={live.text} status={live.status} live /> : null}
          {error ? (
            <p role="alert" className="pl-10 text-[14px] font-semibold text-[var(--gg-berry-ink)]" data-testid="gugu-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {exhausted && quota ? (
        <OutOfQuestions quota={quota} requestMore={requestMore} onQuota={setQuota} />
      ) : (
      <>
      {/* 키보드가 떠 있으면(html[data-kb], keyboard-watch) 홈 바 자리 여백을 빼서 입력 칸을 키보드에 붙인다(2026-11-12 실기기) */}
      <form
        className="shrink-0 px-3 pt-2 pb-[calc(var(--nn-safe-bottom)+10px)] [html[data-kb]_&]:pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
          inputRef.current?.focus();
        }}
      >
        {counted ? (
          <p className="mx-auto mb-1.5 w-full max-w-sm px-2 text-right text-[13px] text-muted tabular-nums" data-testid="gugu-quota">
            {quota.used}/{quota.quota}
          </p>
        ) : null}
        <div className="mx-auto flex w-full max-w-sm items-end gap-2 rounded-[26px] bg-[var(--gg-card)] py-1.5 pr-1.5 pl-4 shadow-[var(--gg-card-shadow)]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, MAX));
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              // 컴퓨터에서는 Enter 로 보내고 Shift+Enter 로 줄바꿈(휴대폰 키보드의 줄바꿈은 그대로)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            rows={1}
            placeholder="구구에게 물어보기"
            aria-label="구구에게 물어보기"
            className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
            data-testid="gugu-input"
          />
          <button
            type="submit"
            disabled={!draft.trim() || !!live}
            aria-label="보내기"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--gg-sky)] text-[var(--gg-on-sky)] transition-opacity disabled:opacity-35"
            data-testid="gugu-send"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
      </>
      )}
    </div>
  );
}

/**
 * 이번 달 질문을 다 썼을 때(2026-11-12) — 입력 칸 자리. 첫 신청은 누르는 즉시 +5, 그다음은 사유(선택)를 받아 운영자에게.
 */
function OutOfQuestions({ quota, requestMore, onQuota }: { quota: QuotaView; requestMore?: RequestMore; onQuota: (q: QuotaView) => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (r: string | null) => {
    if (!requestMore) return;
    setBusy(true);
    setError(null);
    const res = await requestMore(r).catch(() => ({ ok: false as const, message: "신청하지 못했어요. 잠시 뒤 다시 해 주세요." }));
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAsking(false);
    onQuota(res.quota);
  };
  return (
    <div className="shrink-0 px-3 pt-2 pb-[calc(var(--nn-safe-bottom)+10px)] [html[data-kb]_&]:pb-2" data-testid="gugu-out">
      <div className="mx-auto w-full max-w-sm space-y-3 rounded-[24px] bg-[var(--gg-card)] px-4 pt-4 pb-4 shadow-[var(--gg-card-shadow)]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[16px] font-bold">이번 달 질문을 다 썼어요</p>
          <span className="shrink-0 text-[13px] text-muted tabular-nums">
            {quota.used}/{quota.quota}
          </span>
        </div>
        {quota.hasPending ? (
          <button type="button" disabled className="gg-btn gg-btn-white gg-btn-sm !h-11 w-full !opacity-100" data-testid="gugu-more-pending">
            신청됨
          </button>
        ) : asking ? (
          <div className="space-y-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 100))}
              maxLength={100}
              placeholder="사유 (선택)"
              aria-label="추가 신청 사유"
              className="gg-field !py-2.5 !text-[15px]"
              data-testid="gugu-more-reason"
            />
            <p className="px-1 text-[12.5px] text-muted">목장원 이름이나 기도제목은 적지 말아 주세요</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} disabled={busy} className="gg-btn gg-btn-white gg-btn-sm !h-11 flex-1">
                취소
              </button>
              <button type="button" onClick={() => void submit(reason)} disabled={busy} className="gg-btn gg-btn-sky gg-btn-sm !h-11 flex-[2]" data-testid="gugu-more-send">
                {busy ? "보내는 중…" : "신청하기"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {quota.lastStatus === "rejected" ? <p className="text-[13px] text-muted">지난 신청은 어려웠어요</p> : null}
            <button
              type="button"
              onClick={() => (quota.canAuto ? void submit(null) : setAsking(true))}
              disabled={busy || !requestMore}
              className="gg-btn gg-btn-sky gg-btn-sm !h-11 w-full"
              data-testid="gugu-more"
            >
              {busy ? "신청하는 중…" : "추가 신청"}
            </button>
          </>
        )}
        {error ? (
          <p role="alert" className="text-[13.5px] font-semibold text-[var(--gg-berry-ink)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Mine({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="gg-text max-w-[82%] rounded-[20px] rounded-br-[6px] bg-[var(--gg-sky)] px-4 py-2.5 text-[15.5px] leading-relaxed font-medium whitespace-pre-wrap text-[var(--gg-on-sky)] break-keep" data-testid="gugu-mine">
        {text}
      </p>
    </div>
  );
}

function Theirs({ text, status = null, live = false }: { text: string; status?: string | null; live?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Gugu mood="base" size={32} className="mt-0.5 size-8 shrink-0" />
      <div className="max-w-[82%] min-w-0 space-y-1">
        {text ? (
          <p className="gg-text rounded-[20px] rounded-tl-[6px] bg-[var(--gg-card)] px-4 py-2.5 text-[15.5px] leading-relaxed whitespace-pre-wrap shadow-[var(--gg-card-shadow)] break-keep" data-testid="gugu-theirs">
            {text}
          </p>
        ) : live ? (
          <p className="inline-flex rounded-[20px] rounded-tl-[6px] bg-[var(--gg-card)] px-4 py-3.5 text-[var(--gg-hint)] shadow-[var(--gg-card-shadow)]" aria-label="구구가 쓰는 중">
            <span className="gg-dots">
              <i />
              <i />
              <i />
            </span>
          </p>
        ) : null}
        {live && status ? <p className="pl-1 text-[13px] text-muted">{status}</p> : null}
      </div>
    </div>
  );
}
