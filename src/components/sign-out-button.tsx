"use client";

import { removePushSubscription } from "@/app/(tabs)/me/push-actions";

/**
 * 로그아웃(2026-11-05) — 나가기 전에 이 기기의 알림 구독을 지운다. 예전엔 기기 등록이 계정에 남아,
 * 한 폰을 둘이 쓰면 로그아웃한 사람의 알림(목장 이름 · 제출한 리더)이 다음 사람 폰에 계속 갔다.
 * 지우기가 실패해도 로그아웃은 한다.
 */
export function SignOutButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={async (e) => {
        const form = e.currentTarget;
        if (form.dataset.cleaned) return;
        e.preventDefault();
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            await removePushSubscription(sub.endpoint).catch(() => undefined);
            await sub.unsubscribe().catch(() => undefined);
          }
        } catch {
          /* 알림이 없는 브라우저 */
        }
        form.dataset.cleaned = "1";
        form.requestSubmit();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
