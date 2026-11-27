import { redirect } from "next/navigation";

/** 확인 필요(2026-10-14 첫 판) — '확인 필요' 는 뺐다(2026-11-11). 예전 주소는 전체 명단으로 보낸다 */
export default function NeedsCheckPage() {
  redirect("/groups/roster");
}
