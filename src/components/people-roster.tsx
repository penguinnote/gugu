import Link from "next/link";

import { CARD, Chevron, GuguSays, Pill, type Tint } from "@/components/ui";
import { CARE_STATUS_LABELS, GROUP_ROLE_LABELS, PERSON_STATUS_LABELS, groupLabel } from "@/lib/labels";
import { PEOPLE_FILTERS, groupSections, personFlags, type GroupRef, type PeopleFilter, type PersonAdminRow } from "@/lib/people-admin";

// 표시 알약 빛 — 목장장은 잎, 계정은 하늘, 나머지(활동 외 상태 · 태그)는 돌. '확인 필요' 는 뺐다(2026-11-11 사용자 요청)
const FLAG_TINT: Record<string, Tint> = { 목자: "leaf", 계정: "sky" };
const BRIEF_FLAGS = new Set(["목자"]);

/**
 * 명단 목록 — 운영자 명단(A-1)과 리더 · 목사님의 전체 명단(/groups/roster, 2026-10-14)이 같이 쓴다.
 * 필터 알약 · 사람 수 · 목장별 카드(이름 · 역할 · 표시). 사람을 누르는 곳은 화면이 정한다(hrefFor — null 이면 누를 수 없는 줄).
 * filters 로 보일 필터를, brief 로 표시를 목장장 · 확인 필요만 남긴다(전체 명단 — 2026-10-29, 계정 · 상태 · 태그는 운영자 화면 몫).
 */
export function PeopleRoster({
  people,
  groups,
  filter,
  filterHref,
  hrefFor,
  filters = Object.keys(PEOPLE_FILTERS) as PeopleFilter[],
  brief = false,
}: {
  people: PersonAdminRow[];
  groups: GroupRef[];
  filter: PeopleFilter;
  filterHref: (f: PeopleFilter) => string;
  hrefFor: (p: PersonAdminRow) => string | null;
  filters?: PeopleFilter[];
  brief?: boolean;
}) {
  const sections = groupSections(people, groups, filter);
  const shown = sections.reduce((n, s) => n + s.people.length, 0);
  const labels = { status: PERSON_STATUS_LABELS, care: CARE_STATUS_LABELS };

  return (
    <>
      <nav className="flex flex-wrap gap-2" aria-label="필터">
        {filters.map((f) => (
          <Link
            key={f}
            href={filterHref(f)}
            replace // 필터를 바꿔도 뒤로가기 기록이 쌓이지 않게 — 들어올 때는 늘 '전체'(2026-11-06)
            scroll={false}
            aria-current={f === filter ? "true" : undefined}
            className={`gg-pill !h-8 !px-3 !text-[13px] ${
              f === filter ? "bg-[var(--gg-sky)] text-[var(--gg-on-sky)]" : "bg-[var(--gg-btn2)] text-muted"
            }`}
          >
            {PEOPLE_FILTERS[f]}
          </Link>
        ))}
      </nav>
      <p className="-mt-2 text-[12.5px] font-semibold text-[var(--gg-section)] tabular-nums">
        {filter === "all" ? `${people.filter((p) => p.status !== "left").length}명` : `${shown}명`}
      </p>

      {sections.length === 0 ? <GuguSays mood="sleepy" size={72} lines={["해당하는 사람이 없어요."]} /> : null}

      {sections.map((s) => (
        <section key={s.group.id} className={`${CARD} space-y-1 px-4 pt-3.5 pb-1.5`} data-testid="group-section">
          <h2 className="flex items-center justify-between gap-2">
            <span className="gg-display text-[17px]">{groupLabel(s.group.name)}</span>
            <Pill tint="stone" className="!h-6 !px-2 !text-[11px] tabular-nums">
              리더 {s.leaders} · 양 {s.members}
            </Pill>
          </h2>
          <ul className="divide-y divide-[var(--gg-line)]">
            {s.people.map((p) => {
              const flags = personFlags(p, labels).filter((f) => !brief || BRIEF_FLAGS.has(f));
              const href = hrefFor(p);
              const body = (
                <>
                  <span className={`min-w-0 font-semibold ${p.status === "left" ? "text-muted line-through" : ""}`}>
                    {p.name}
                    <span className="ml-1.5 text-xs font-normal text-muted">{GROUP_ROLE_LABELS[p.group_role]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {flags.length > 0 ? (
                      <span className="flex max-w-[11rem] flex-wrap justify-end gap-1">
                        {flags.map((f) => (
                          <Pill key={f} tint={FLAG_TINT[f] ?? "stone"} className="!h-5 !px-1.5 !text-[10.5px]">
                            {f}
                          </Pill>
                        ))}
                      </span>
                    ) : null}
                    {href ? <Chevron className="h-3.5 w-3.5 text-muted" /> : null}
                  </span>
                </>
              );
              return (
                <li key={p.id}>
                  {href ? (
                    <Link href={href} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-2.5 text-[15px]">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
