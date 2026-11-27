"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

import { IconCard, CARD_LIST } from "@/components/toss";
import { BTN } from "@/components/ui";
import { groupLabel } from "@/lib/labels";

import type { ConsentSave } from "./actions";

export type ConsentPerson = { id: string; name: string; groupId: string | null; leader: boolean; consentedAt: string | null };
export type ConsentGroup = { id: string; name: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const norm = (s: string) => s.replace(/\s+/g, "");

/**
 * AI 동의 한꺼번에(2026-11-13) — 목장별로 사람마다 체크칸. 동의서의 'AI 정리를 위한 해외 서버 사용' 항목을 받은 사람을 체크하고 아래 단추로 한 번에 저장한다.
 * 바뀐 사람만 보낸다. 저장 전에 확인 창(사용자 요청). 체크를 푸는 것은 철회 — 그 사람이 들어간 지난 AI 정리도 지워진다(DB 소급 트리거).
 */
export function ConsentBoard({
  people,
  groups,
  save,
}: {
  people: ConsentPerson[];
  groups: ConsentGroup[];
  save: (on: string[], off: string[]) => Promise<ConsentSave>;
}) {
  const router = useRouter();
  const initial = useMemo(() => new Set(people.filter((p) => p.consentedAt).map((p) => p.id)), [people]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial));
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const cancel = useCallback(() => setAsking(false), []);

  const on = people.filter((p) => checked.has(p.id) && !initial.has(p.id)).map((p) => p.id);
  const off = people.filter((p) => !checked.has(p.id) && initial.has(p.id)).map((p) => p.id);
  const changed = on.length + off.length;

  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const k = norm(q);
  const shown = (p: ConsentPerson) => !k || norm(p.name).includes(k);
  const sections = [...groups, { id: "", name: "목장 없음" }]
    .map((g) => ({ g, rows: people.filter((p) => (p.groupId ?? "") === g.id && shown(p)) }))
    .filter((s) => s.rows.length > 0);

  const submit = () =>
    start(async () => {
      setAsking(false);
      setMsg(null);
      const r = await save(on, off);
      if (!r.ok) {
        setMsg({ ok: false, text: r.message });
        return;
      }
      setMsg({ ok: true, text: `저장했습니다 — 동의 ${r.on}명${r.off ? ` · 철회 ${r.off}명` : ""}` });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] font-bold tabular-nums" data-testid="consent-count">
        동의 {checked.size} / {people.length}명
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름 찾기"
        aria-label="이름 찾기"
        className="gg-field"
      />

      {sections.map(({ g, rows }) => (
        <IconCard
          key={g.id || "none"}
          icon="/icons/tossface/u1F465.svg"
          title={g.id ? groupLabel(g.name) : g.name}
          aside={`${rows.filter((p) => checked.has(p.id)).length} / ${rows.length}`}
        >
          <ul className={CARD_LIST}>
            {rows.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={checked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-[20px] shrink-0 accent-[var(--gg-sky)]"
                    data-testid="consent-check"
                    data-person={p.id}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {p.name}
                    {p.leader ? <span className="ml-1.5 text-[12px] font-normal text-[var(--gg-hint)]">리더</span> : null}
                  </span>
                  {p.consentedAt && checked.has(p.id) ? (
                    <span className="shrink-0 text-[12.5px] text-[var(--gg-hint)] tabular-nums">{day(p.consentedAt)}</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </IconCard>
      ))}

      <div className="sticky bottom-[calc(var(--nn-tabbar)+12px)] z-10 flex flex-col gap-2">
        {msg ? (
          <p className={`rounded-xl bg-[var(--gg-card)] px-3 py-2 text-[13px] font-semibold shadow-[var(--gg-card-shadow)] ${msg.ok ? "text-[var(--gg-leaf-ink)]" : "text-[var(--gg-berry-ink)]"}`} role="status">
            {msg.text}
          </p>
        ) : null}
        <button type="button" disabled={changed === 0 || pending} onClick={() => setAsking(true)} className={`${BTN("leaf")} w-full disabled:opacity-40`} data-testid="consent-save">
          {changed === 0 ? "바뀐 사람 없음" : `저장 · 동의 ${on.length}명${off.length ? ` · 철회 ${off.length}명` : ""}`}
        </button>
      </div>
      <ConfirmDialog
        open={asking}
        title={`동의 ${on.length}명${off.length ? ` · 철회 ${off.length}명` : ""}을 저장할까요?`}
        body={off.length ? "철회하는 분의 기록은 AI로 보내지 않고, 그분이 들어간 지난 AI 정리도 지워집니다." : "동의서의 'AI 정리를 위한 해외 서버 사용' 항목에 동의한 분만 체크했는지 확인해 주세요."}
        confirmLabel="저장"
        busy={pending}
        onConfirm={submit}
        onCancel={cancel}
        testId="consent-confirm"
      />
    </div>
  );
}
