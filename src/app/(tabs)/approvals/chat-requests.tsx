import { CARD_LIST, IconCard } from "@/components/toss";
import { BTN } from "@/components/ui";
import { groupLabel } from "@/lib/labels";
import type { Database } from "@/lib/supabase/database.types";

// 생성된 타입은 함수가 돌려주는 칸을 늘 값이 있다고 적는다 — 사유 · 목장은 비어 있을 수 있다
export type ChatRequest = Omit<Database["public"]["Functions"]["list_chat_quota_requests"]["Returns"][number], "reason" | "group_name"> & {
  reason: string | null;
  group_name: string | null;
};

/** "11월 12일 14:05"(한국 시간) — toLocale* 은 쓰지 않는다(06 §4.5) */
function kstDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 승인 화면의 '✨ 구구 챗봇 추가 신청' 카드(2026-11-12) — 가입 신청과 따로. 줄마다 이름 · 목장 · 쓴 횟수/한도 · 사유 · 신청 시각,
 * 단추 +5 · +10 · +20 · 거절. 대화 내용은 없다(원래 폰에만 있다). 운영자 본인 신청은 단추 없이 '본인 신청'.
 */
export function ChatRequestsCard({ chats, action }: { chats: ChatRequest[]; action: (formData: FormData) => void | Promise<void> }) {
  return (
    <IconCard icon="/icons/tossface/u2728.svg" title="구구 챗봇 추가 신청" aside={chats.length > 0 ? `${chats.length}건` : undefined} testId="chat-requests">
      {chats.length === 0 ? (
        <p className="pb-1 text-[14px] text-muted">대기 중인 추가 신청이 없어요.</p>
      ) : (
        <ul className={CARD_LIST}>
          {chats.map((c) => (
            <li key={c.id} className="space-y-2.5 px-4 py-3.5" data-testid="chat-request">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[16px] font-bold">
                  {c.name}
                  <span className="ml-1.5 text-[13px] font-normal text-muted">{groupLabel(c.group_name)}</span>
                </p>
                <span className="shrink-0 text-[13px] text-muted tabular-nums">
                  {c.used}/{c.quota}
                </span>
              </div>
              {c.reason ? <p className="gg-text text-[14px] leading-relaxed break-keep">{c.reason}</p> : null}
              <p className="text-[12.5px] text-muted tabular-nums">{kstDateTime(c.created_at)} 신청</p>
              {c.mine ? (
                <p className="text-[13px] font-semibold text-[var(--gg-section)]" data-testid="chat-request-mine">
                  본인 신청
                </p>
              ) : (
                <form action={action} className="grid grid-cols-4 gap-1.5">
                  <input type="hidden" name="id" value={c.id} />
                  {[5, 10, 20].map((n) => (
                    <button key={n} type="submit" name="amount" value={n} className={`${BTN("sky", "sm")} !h-10 !px-0 !text-[15px]`}>
                      +{n}
                    </button>
                  ))}
                  <button type="submit" name="amount" value="reject" className={`${BTN("white", "sm")} !h-10 !px-0 !text-[15px]`}>
                    거절
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </IconCard>
  );
}
