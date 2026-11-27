"use client";

import { useEffect, useState } from "react";

import { removePushSubscription } from "@/app/(tabs)/me/push-actions";
import { IconCard } from "@/components/toss";
import { detectPush, turnOnPush } from "@/lib/push/client";
import type { PushSupport } from "@/lib/push/platform";

/**
 * 알림(전체 → 알림, 2026-11-11 다시 그림) — 토스 결 카드 둘.
 *   🔔 이 기기   '알림 받기' 켜고 끄는 스위치. 기기마다 따로다(폰 · PC). 아이폰 사파리는 홈 화면 앱으로 열어야만 켤 수 있어 그 순서를,
 *               차단 · 미지원은 한 줄로. 살피기 · 켜기는 lib/push/client.ts(홈의 알림 켜기 팝업과 같이 쓴다)
 *   📬 받는 알림 역할마다 오는 알림과 때
 * 시험 알림 단추는 뺐다(2026-11-11 사용자 요청 — 개발용이었다).
 */

type State = { support: PushSupport | "checking"; endpoint: string | null; busy: boolean; note: string | null };
export type PushAudience = { role: "leader" | "pastor" | "admin" | "officer" | "pending"; leadsGroup: boolean };

/** 역할마다 오는 알림 — [무엇, 언제] */
export function pushKinds(a: PushAudience): [string, string][] {
  const out: [string, string][] = [];
  if (a.leadsGroup) {
    out.push(["목장보고서를 아직 안 냈을 때", "월요일 저녁 8시"], ["목장 리더가 목장보고서를 냈을 때", "바로"], ["목사님이 확인하거나 한마디를 남겼을 때", "바로"], ["목장 이동 신청이 오거나 처리됐을 때", "바로"], ["우리 목장에 새가족이 들어왔을 때", "바로"]);
  }
  if (a.role === "pastor") out.push(["지난주 목장보고서 정리", "수요일 아침 7시"], ["목장이 목장보고서를 냈을 때", "바로"], ["앱 쓰는 리더가 없는 목장의 목장 이동 신청", "바로"], ["목장에 새가족이 들어왔을 때", "바로"]);
  if (a.role === "admin") out.push(["새 신청이 왔을 때", "바로"], ["'제 이름이 아니에요' 가 왔을 때", "바로"]);
  return out;
}

export function PushSettings({ audience }: { audience?: PushAudience }) {
  const [s, setS] = useState<State>({ support: "checking", endpoint: null, busy: false, note: null });

  useEffect(() => {
    let alive = true;
    void detectPush().then(({ support, endpoint }) => {
      if (alive) setS((cur) => ({ ...cur, support, endpoint }));
    });
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setS((c) => ({ ...c, busy: true, note: null }));
    const r = await turnOnPush();
    if (r.ok) setS((c) => ({ ...c, busy: false, endpoint: r.endpoint }));
    else setS((c) => ({ ...c, busy: false, support: r.denied ? "denied" : c.support, note: r.message }));
  };

  const turnOff = async () => {
    setS((c) => ({ ...c, busy: true, note: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setS((c) => ({ ...c, busy: false, endpoint: null }));
    } catch {
      setS((c) => ({ ...c, busy: false, note: "끄지 못했어요. 다시 눌러 주세요." }));
    }
  };

  const kinds = audience ? pushKinds(audience) : [];
  const on = s.support === "ready" && !!s.endpoint;
  return (
    <div className="flex flex-col gap-4" id="push">
      <IconCard icon="/icons/tossface/u1F514.svg" title="이 기기" aside={s.support === "ready" ? (on ? "켜짐" : "꺼짐") : undefined} testId="push-device">
        <Body s={s} on={on} onToggle={() => (on ? turnOff() : turnOn())} />
        {s.note ? (
          <p role="status" className="mt-2 text-[13px] font-semibold text-[var(--gg-berry-ink)]">
            {s.note}
          </p>
        ) : null}
      </IconCard>
      {kinds.length ? (
        <IconCard icon="/icons/tossface/u1F4EC.svg" title="받는 알림" testId="push-kinds">
          <ul className="-mx-4 -mb-2 divide-y divide-[var(--gg-line)]">
            {kinds.map(([what, when]) => (
              <li key={what} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-[15px] font-medium">{what}</span>
                <span className="shrink-0 text-[13px] text-[var(--gg-hint)]">{when}</span>
              </li>
            ))}
          </ul>
        </IconCard>
      ) : null}
    </div>
  );
}

function Body({ s, on, onToggle }: { s: State; on: boolean; onToggle: () => void }) {
  const line = "text-[14.5px] leading-relaxed text-[var(--gg-section)]";
  switch (s.support) {
    case "checking":
      return <div className="h-11" />;
    case "ios-install":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-[14.5px] leading-relaxed font-medium" data-testid="ios-guide">
          <li>사파리 아래쪽의 공유 버튼(네모에 화살표)을 누릅니다</li>
          <li>&lsquo;홈 화면에 추가&rsquo;를 누릅니다</li>
          <li>홈 화면의 구구 아이콘으로 다시 열고, 여기서 알림을 켭니다</li>
        </ol>
      );
    case "unsupported":
      return <p className={line}>이 브라우저에서는 알림을 받을 수 없습니다. 크롬이나 사파리에서 열어 주세요.</p>;
    case "no-key":
      return <p className={line}>알림 설정이 아직 준비되지 않았습니다. 운영자에게 알려 주세요.</p>;
    case "denied":
      return <p className={line}>이 기기에서 알림이 차단되어 있습니다. 휴대폰 설정에서 구구 알림을 허용해 주세요.</p>;
    case "ready":
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          disabled={s.busy}
          className="flex w-full items-center justify-between gap-3 py-1 text-left"
          data-testid="push-switch"
        >
          <span className="text-[16px] font-semibold">알림 받기</span>
          <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? "bg-[var(--gg-sky)]" : "bg-[var(--gg-line)]"} ${s.busy ? "opacity-60" : ""}`}>
            <span className={`absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.2)] transition-transform ${on ? "translate-x-5" : ""}`} />
          </span>
        </button>
      );
  }
}
