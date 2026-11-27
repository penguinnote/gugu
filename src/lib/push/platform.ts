/**
 * 이 기기에서 알림을 켤 수 있는가 — 화면이 고를 안내 하나(02 C-2a).
 *
 *   ios-install  아이폰·아이패드인데 홈 화면 앱으로 열지 않았다 — iOS 는 홈 화면에 추가해야만 웹 푸시가 온다.
 *                막지 않고 안내만 한다(2026-10-03 결정: 배너로 안내, 운영자가 미등록자 개별 안내)
 *   unsupported  브라우저가 서비스 워커·푸시를 지원하지 않는다
 *   no-key       서버 공개 키(NEXT_PUBLIC_VAPID_PUBLIC_KEY)가 없다 — 배포 설정 문제
 *   denied       사용자가 알림을 차단했다 — 브라우저 설정에서만 풀 수 있다
 *   ready        켜고 끌 수 있다
 */

export type PushSupport = "ios-install" | "unsupported" | "no-key" | "denied" | "ready";

export function pushSupport(env: {
  supported: boolean;
  isIOS: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unknown";
  hasKey: boolean;
}): PushSupport {
  if (env.isIOS && !env.standalone) return "ios-install";
  if (!env.supported) return "unsupported";
  if (!env.hasKey) return "no-key";
  if (env.permission === "denied") return "denied";
  return "ready";
}

/** iPadOS 13+ 는 데스크톱 사파리처럼 보고한다 — 터치 지점 수로 구분한다 */
export function detectIOS(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** VAPID 공개 키(base64url) → applicationServerKey */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
