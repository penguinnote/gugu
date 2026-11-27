"use client";

import { useEffect, useState } from "react";

/**
 * 메신저 안 브라우저 안내(2026-11-06) — 단톡방 링크를 카카오톡 · 인스타그램 등 안에서 열면 구글이 로그인을 막고,
 * 아이폰 설치 안내(사파리 공유 단추)도 맞지 않는다. 알아채면 로그인 단추 위에서 바깥 브라우저로 여는 길을 먼저 준다.
 *   카카오톡   kakaotalk://web/openExternal — 아이폰 · 안드로이드 모두 기본 브라우저로 연다
 *   안드로이드 그 밖  intent:// 로 크롬
 *   아이폰 그 밖    오른쪽 위 메뉴에서 'Safari로 열기'
 */
type Kind = "kakao" | "android" | "ios" | null;

function detect(ua: string): Kind {
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (!/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp|BAND\//i.test(ua)) return null;
  return /Android/i.test(ua) ? "android" : "ios";
}

export function InAppBrowserNotice() {
  const [kind, setKind] = useState<Kind>(null);
  useEffect(() => {
    // 브라우저 이름은 붙은 뒤에만 안다 — 서버 그림에는 없다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(detect(navigator.userAgent));
  }, []);
  if (!kind) return null;

  const open = () => {
    const url = window.location.href;
    if (kind === "kakao") window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    else if (kind === "android") {
      const u = new URL(url);
      window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-[var(--gg-sun-soft)] px-4 py-3.5 text-[var(--gg-sun-ink)]" data-testid="in-app-browser">
      <p className="text-sm leading-relaxed font-semibold">
        {kind === "kakao" ? "카카오톡 안에서는 로그인이 막힐 수 있어요." : "이 앱 안에서는 로그인이 막힐 수 있어요."}
        {kind === "ios" ? " 오른쪽 위 메뉴에서 'Safari로 열기'를 눌러 주세요." : null}
      </p>
      {kind !== "ios" ? (
        <button type="button" onClick={open} className="gg-btn gg-btn-sky w-full">
          {kind === "kakao" ? "다른 브라우저로 열기" : "크롬으로 열기"}
        </button>
      ) : null}
    </div>
  );
}
