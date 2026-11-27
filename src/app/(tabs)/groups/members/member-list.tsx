import Link from "next/link";

import { CARD, Chevron, Pill } from "@/components/ui";

export type MemberRow = {
  id: string;
  name: string;
  group_role: "leader" | "member";
  is_group_head: boolean;
  training_stage: string | null;
  birth_year: number | null;
  gender: "male" | "female" | null;
  occupation: string | null;
  affiliation: string | null;
  youth_member: boolean;
  assembly_member: boolean;
  /** 휴면이면 '휴면' 알약(2026-11-05) — 보고서 명단에는 없는 사람이라 왜 안 보이는지 여기서 보인다. 기록 제외는 표시하지 않는다(낙인) */
  status?: "active" | "dormant" | "opted_out" | "left";
};

/** 목장 명단 한 장 — 사람마다 한 줄(이름 · 리더 · 훈련단계 · 출생년도 · 성별 / 직업 · 소속 / 섬김 부서). 누르면 고치는 화면 */
export function MemberList({ people, serves }: { people: MemberRow[]; serves: Map<string, string[]> }) {
  return (
    <ul className={`${CARD} divide-y divide-[var(--gg-line)] overflow-hidden`} data-testid="member-list">
      {people.map((p) => {
        const facts = [p.training_stage, p.birth_year ? String(p.birth_year) : null, p.gender === "male" ? "남" : p.gender === "female" ? "여" : null].filter(Boolean);
        const work = [p.occupation, p.affiliation].filter(Boolean);
        const serve = serves.get(p.id) ?? [];
        return (
          <li key={p.id}>
            <Link href={`/groups/members/${p.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[16px] ${p.is_group_head ? "font-extrabold" : "font-bold"}`}>{p.name}</span>
                  {p.group_role === "leader" ? (
                    <Pill tint="sky" className="!h-5 !px-1.5 !text-[11px]">
                      {p.is_group_head ? "목자" : "목동"}
                    </Pill>
                  ) : null}
                  {p.status === "dormant" ? (
                    <Pill tint="stone" className="!h-5 !px-1.5 !text-[11px]">
                      휴면
                    </Pill>
                  ) : null}
                  {facts.length ? <span className="text-[12.5px] text-muted">{facts.join(" · ")}</span> : null}
                </span>
                {work.length ? <span className="block truncate text-[13px] text-muted">{work.join(" · ")}</span> : null}
                {serve.length ? <span className="block truncate text-[12.5px] font-semibold text-[var(--gg-sky-ink)]">{serve.join(" · ")}</span> : null}
              </span>
              <Chevron className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
