"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BTN } from "@/components/ui";

import { undoLeftById } from "./actions";

export const LEFT_KEY = "gg-left";

/**
 * '떠났어요' 되돌리기(2026-11-05) — 방금 뺀 사람을 명단 위에 한 번 띄운다. 주소(?left=)로 넘기면 뒤로가기 기록에
 * 명단이 두 번 쌓이고 다른 사람을 고친 뒤에도 다시 떴다 — 이 기기의 sessionStorage 로 한 번만 넘긴다.
 */
export function UndoLeft() {
  const router = useRouter();
  const [left, setLeft] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LEFT_KEY);
      sessionStorage.removeItem(LEFT_KEY);
      // 저장소에서 한 번 읽어 오는 것 — 렌더 중이 아니라 붙은 뒤에만 알 수 있다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLeft(JSON.parse(raw) as { id: string; name: string });
    } catch {
      /* 저장이 막힌 브라우저 — 띄우지 않는다 */
    }
  }, []);

  if (!left) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--gg-stone-soft)] px-4 py-3" data-testid="undo-left">
      <span className="min-w-0 text-sm font-semibold">
        {left.name}님을 명단에서 뺐어요
        {error ? <span className="block text-xs text-[var(--gg-berry-ink)]">{error}</span> : null}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await undoLeftById(left.id);
            if (!r.ok) {
              setError(r.message);
              return;
            }
            setLeft(null);
            router.refresh();
          } catch {
            setError("되돌리지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
          } finally {
            setBusy(false);
          }
        }}
        className={`${BTN("white", "sm")} !h-9 shrink-0 !px-3 !text-[13px]`}
      >
        {busy ? "되돌리는 중…" : "되돌리기"}
      </button>
    </div>
  );
}
