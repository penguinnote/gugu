import { savePushSubscription } from "@/app/(tabs)/me/push-actions";

import { currentDisplayMode, isHomeScreenApp } from "@/lib/display-mode";

import { detectIOS, pushSupport, urlBase64ToUint8Array, type PushSupport } from "./platform";

/**
 * 이 기기의 알림 — 살피기 · 켜기(브라우저에서만). 내 정보의 알림 칸(components/push-settings)과
 * 홈의 '알림 켜기' 팝업(app/(tabs)/home/push-prompt)이 같이 쓴다.
 * 서비스 워커는 뿌리 레이아웃(components/sw-register)이 모든 기기에 걸고, 여기서도 살필 때 한 번 더 등록한다(같은 것이라 괜찮다).
 */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** 이 기기에서 켤 수 있는가, 이미 켜져 있으면 그 구독 주소 */
export async function detectPush(): Promise<{ support: PushSupport; endpoint: string | null }> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const nav = navigator as Navigator & { standalone?: boolean };
  const support = pushSupport({
    supported,
    isIOS: detectIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    // 홈 화면 앱 — 안드로이드 전체 화면(display-mode fullscreen, 2026-11-25)도 앱으로 본다(lib/display-mode)
    standalone: isHomeScreenApp(currentDisplayMode()) || nav.standalone === true,
    permission: "Notification" in window ? Notification.permission : "unknown",
    hasKey: VAPID !== "",
  });
  let endpoint: string | null = null;
  if (support === "ready" || support === "denied") {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await reg.pushManager.getSubscription();
      endpoint = sub?.endpoint ?? null;
      // 이 기기가 켜져 있으면 서버에도 다시 적어 둔다(2026-11-05) — 서버 기록이 지워졌거나(로그인 초기화) 다른 계정 것으로
      // 남아 있으면 '켜져 있습니다' 인데 알림이 안 오거나 남에게 갔다. 같은 값을 다시 적는 것이라 몇 번이고 괜찮다
      if (sub && support === "ready") {
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        void savePushSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }).catch(() => undefined);
      }
    } catch {
      // 등록 실패는 '꺼짐' 으로 보인다
    }
  }
  return { support, endpoint };
}

export type TurnOn = { ok: true; endpoint: string } | { ok: false; denied: boolean; message: string | null };

/** 켜기 — 허용을 묻고(누른 손길 안에서 불러야 한다) 구독해 서버에 저장한다 */
export async function turnOnPush(): Promise<TurnOn> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, denied: permission === "denied", message: null };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const res = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
    if (!res.ok) {
      await sub.unsubscribe();
      return { ok: false, denied: false, message: "저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
    }
    return { ok: true, endpoint: json.endpoint };
  } catch {
    return { ok: false, denied: false, message: "켜지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  }
}
