import Link from "next/link";

import { CARD_LIST, CARD_ROW, IconCard, ROW_TAG } from "@/components/toss";
import { ICON, Icon } from "@/components/ui";
import { CONTACT_LABEL, type WeekContacts } from "@/lib/care-contacts";
import { formatWeekLabel } from "@/lib/week";

/**
 * 돌봄 화면 맨 위(2026-11-15) — 지난 예배에 결석했거나 온라인으로 드린 사람. 주중에 연락하라고 보여 준다.
 * 돌봄 사각지대 목록(components/blind-spots)과 같은 줄 모양. 사람을 누르면 그 사람 기록.
 * 낸 보고서가 없으면(contacts = null) 칸을 그리지 않는다.
 */
export function ContactSection({ contacts }: { contacts: WeekContacts | null }) {
  if (!contacts) return null;
  return (
    <IconCard
      id="care-contacts-title"
      icon="/icons/tossface/u1F4EC.svg"
      title={`결석 · 온라인 ${contacts.people.length}명`}
      sub={`${formatWeekLabel(contacts.weekKey)} 예배`}
      testId="care-contacts"
    >
      {contacts.people.length === 0 ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--gg-sky-ink)]">
          <Icon d={ICON.check} className="h-4 w-4 shrink-0" strokeWidth={2.8} />
          모두 현장에서 예배드렸어요.
        </p>
      ) : (
        <ul className={CARD_LIST}>
          {contacts.people.map((p) => (
            <li key={p.id} data-testid="care-contact-person">
              <Link href={`/groups/people/${p.id}`} className={CARD_ROW}>
                <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
                <span className={ROW_TAG}>{CONTACT_LABEL[p.kind]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </IconCard>
  );
}
