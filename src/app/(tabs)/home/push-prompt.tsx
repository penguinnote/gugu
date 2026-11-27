"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Gugu } from "@/components/gugu";
import { BTN } from "@/components/ui";
import { detectPush, turnOnPush } from "@/lib/push/client";

/** '나중에' 를 누르면 이만큼 다시 묻지 않는다 */
export const ASK_AGAIN_MS = 3 * 24 * 60 * 60 * 1000;
const KEY = "gg-push-ask";

type Ask = "push" | "install";

/** 다시 물어도 되나 — '나중에' 를 누른 때가 없거나 ASK_AGAIN_MS 가 지났다. 저장소가 막혀 있으면 묻는다 */
export function canAskAgain(now: number, saved: string | null): boolean {
  const at = Number(saved);
  return !saved || !Number.isFinite(at) || now - at >= ASK_AGAIN_MS;
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snooze() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* 저장소가 막힌 기기 — 다음에 또 묻는다 */
  }
}

/**
 * 알림 켜기 팝업(2026-10-29) — 리더 홈을 열면 아래에서 올라온다. 목사님 홈도(2026-11-05, audience="pastor" — 수요일 정리 알림). 이 기기에 알림이 없을 때(2026-11-11 — 예전엔 계정에 켠 기기가 하나도 없을 때만이라, 앱을 지우고 다시 깔면 옛 기기 등록 때문에 다시 묻지 않았다).
 *   · 켤 수 있는 기기 → 구구 + '알림 켜기'. 누르면 그 손길로 기기의 허용 창이 뜬다(브라우저는 손길 없이 허용 창을 띄우지 않는다)
 *   · 아이폰 사파리(홈 화면 앱 아님) → 홈 화면에 추가하는 법
 *   · 차단 · 미지원 · 이미 켬 → 띄우지 않는다(차단은 기기 설정에서만 풀린다 — 아래 안내 줄이 남는다)
 * '나중에' 는 이 기기에서 3일 동안 다시 묻지 않는다. preview 는 디자인 확인 화면용 — 기기를 살피지 않고 그 모양을 바로 띄운다.
 */
export function PushPrompt({ preview, audience = "leader" }: { preview?: Ask; audience?: "leader" | "pastor" } = {}) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(preview ?? null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (preview || !canAskAgain(Date.now(), readSaved())) return;
    void detectPush().then(({ support, endpoint }) => {
      const next: Ask | null = support === "ready" && !endpoint ? "push" : support === "ios-install" ? "install" : null;
      // 홈이 다 보인 뒤 살짝 늦게 — 열자마자 화면을 가리지 않게
      if (alive && next) timer = setTimeout(() => setAsk(next), 700);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [preview]);

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      snooze();
      setAsk(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask]);

  function later() {
    snooze();
    setAsk(null);
  }

  async function onTurnOn() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const r = await turnOnPush();
    setBusy(false);
    if (r.ok) {
      setDone(true);
      router.refresh(); // 아래 '알림이 꺼져 있어요' 줄을 걷는다
      setTimeout(() => setAsk(null), 1400);
    } else if (r.denied || !r.message) {
      later();
    } else {
      setNote(r.message);
    }
  }

  if (!ask) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center print:hidden" data-testid="push-prompt">
      <button type="button" aria-label="닫기" onClick={later} className="gg-fade-in absolute inset-0 bg-black/40" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
        className="gg-sheet-up relative w-full max-w-sm rounded-t-[28px] bg-[var(--gg-card)] px-6 pt-7 pb-[calc(var(--nn-safe-bottom)+1.25rem)] text-center shadow-[0_-8px_32px_rgb(0_0_0/0.18)]"
      >
        <div className="gg-bob mx-auto w-fit">
          <Gugu mood={done ? "sparkle" : "wave"} size={92} />
        </div>
        {ask === "push" ? (
          <>
            <h2 id="push-prompt-title" className="gg-display mt-3 text-[22px] leading-snug">
              {done ? "알림이 켜졌어요!" : "알림을 켜 둘까요?"}
            </h2>
            <p className="mx-auto mt-2 max-w-[18rem] text-[14px] leading-relaxed text-muted">
              {audience === "pastor"
                ? "수요일 아침 7시에 지난주 목장보고서 정리를, 목장이 목장보고서를 냈을 때 바로 알려 드려요."
                : "목장보고서를 아직 안 썼을 때(월요일 저녁 8시), 같은 목장 리더가 제출했을 때, 목사님이 확인하셨을 때, 목장 이동 신청이 왔을 때 바로 알려 드려요."}
            </p>
            {note ? (
              <p role="alert" className="mt-3 text-[13px] font-semibold text-[var(--gg-berry-ink)]">
                {note}
              </p>
            ) : null}
            {done ? null : (
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={() => void onTurnOn()} aria-disabled={busy} className={`${BTN("sky")} w-full`} data-testid="push-prompt-on">
                  {busy ? "켜는 중…" : "알림 켜기"}
                </button>
                <button type="button" onClick={later} className={`${BTN("ghost", "sm")} w-full !text-muted`} data-testid="push-prompt-later">
                  나중에
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 id="push-prompt-title" className="gg-display mt-3 text-[21px] leading-snug">
              홈 화면에 추가하면
              <br />
              알림을 받을 수 있어요
            </h2>
            <ol className="mt-4 list-decimal space-y-1 rounded-2xl bg-[var(--gg-sky-soft)] py-3 pr-4 pl-9 text-left text-[14px] leading-relaxed font-semibold text-[var(--gg-sky-ink)]">
              <li>사파리 아래쪽 공유 버튼(네모에 화살표)</li>
              <li>&lsquo;홈 화면에 추가&rsquo;</li>
              <li>홈 화면의 구구 아이콘으로 다시 열기</li>
            </ol>
            <button type="button" onClick={later} className={`${BTN("sky")} mt-5 w-full`} data-testid="push-prompt-later">
              알겠어요
            </button>
          </>
        )}
      </section>
    </div>
  );
}
