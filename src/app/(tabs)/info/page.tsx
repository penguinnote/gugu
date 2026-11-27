import { redirect } from "next/navigation";

/**
 * 정보 탭은 2026-11-10 에 뺐다 — 내 정보 · 알림 · 운영 · 내보내기는 '전체' 로 옮기고, 탭 자리는 '기록' 이 됐다.
 * 예전 주소(홈 화면에 남은 링크 · 북마크)로 오면 '전체' 로 보낸다. 아바타 사진(/info/avatar-shot)은 월드가 계속 찍어 둔다.
 */
export default function Page() {
  redirect("/all");
}
