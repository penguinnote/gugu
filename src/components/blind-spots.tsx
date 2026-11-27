import Link from "next/link";

import { CARD_LIST, CARD_ROW, IconCard, ROW_TAG } from "@/components/toss";
import { ICON, Icon } from "@/components/ui";

import { CARE_STATUS_LABELS, groupLabel } from "@/lib/labels";
import { blindSpotTag, lastSeenLine, shortWeek, type BlindSpotPerson, type BlindSpotSummary } from "@/lib/blind-spots";
import type { BlindSpotChange } from "@/lib/pastor-digest-data";

/**
 * 챙김이 필요한 양 목록 — 목사님 홈(P-1, 전체)과 리더 목장 탭(자기 목장)이 같이 쓴다.
 *
 *   집계 중   한 줄 설명 + needs_check 사람들(명단 도입 때의 출발점). 판정처럼 보이지 않게 쓴다
 *   판정      "N명" + 기간 · 최우선 수, 사람마다 어느 공백인지와 마지막 기록. 그 아래 단독 연결
 *
 * 붉은색·경고 아이콘을 쓰지 않는다. 사실을 적고, 누구에게 먼저 연락할지는 순서가 말한다.
 * `showGroup` — 전체를 보는 목사님 화면에서만 목장 이름을 붙인다.
 * 사람을 누르면 상세(/groups/people/[id], L-4a·P-4a)로 간다.
 * 구구 테마 — 카드 안 옅은 돌빛 목록, 공백 꼬리표는 흰 알약. 사각지대가 없으면 잎빛 한 줄.
 * 목사님 홈에도 같이 쓰여 구구는 넣지 않는다(화면마다 구구는 하나).
 */
export function BlindSpotSection({
  summary,
  showGroup,
  change,
}: {
  summary: BlindSpotSummary;
  showGroup: boolean;
  /** 지난주 판정과 견준 변화(목사님 화면, 2026-11-05) — 새로 든 사람에 '새로', 제목 옆에 들고 난 수 */
  change?: BlindSpotChange | null;
}) {
  if (summary.state === "collecting") {
    return (
      <IconCard id="blind-spots-title" icon="/icons/tossface/u1F440.svg" title="챙김이 필요한 양 · 집계 중">
        {summary.needsCheck.length > 0 ? <PersonList people={summary.needsCheck} showGroup={showGroup} detail={() => null} /> : null}
      </IconCard>
    );
  }

  // 판정한 사람이 없으면 0명도 '없습니다' 도 거짓이다 — 전원 등록 4주 미만일 수 있다.
  if (summary.judged === 0) {
    return (
      <IconCard id="blind-spots-title" icon="/icons/tossface/u1F440.svg" title="챙김이 필요한 양 · 아직 판정 전" />
    );
  }

  const range =
    summary.windowStart && summary.windowEnd ? `${shortWeek(summary.windowStart)} ~ ${shortWeek(summary.windowEnd)}` : "최근 4주";

  return (
    <IconCard
      id="blind-spots-title"
      icon="/icons/tossface/u1F440.svg"
      title={`챙김이 필요한 양 ${summary.spots.length}명`}
      sub={
          change ? (
            <>
              {range}
              <span className="block" data-testid="blind-spot-change">
                {changeLine(change)}
              </span>
            </>
          ) : (
            range
          )
        }
    >
      {summary.spots.length === 0 ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--gg-sky-ink)]">
          <Icon d={ICON.check} className="h-4 w-4 shrink-0" strokeWidth={2.8} />
          최근 4주에는 없습니다.
        </p>
      ) : (
        <PersonList
          people={summary.spots}
          showGroup={showGroup}
          detail={(p) => lastSeenLine(p)}
          tag={blindSpotTag}
          isNew={change ? (p) => change.added.has(p.person_id) : undefined}
        />
      )}

      {summary.singleLinks.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-[13px] text-[var(--gg-hint)]">
            개별 연락으로 교제를 한 리더만 기록한 분 {summary.singleLinks.length}명
          </summary>
          <div className="pt-2">
            <PersonList people={summary.singleLinks} showGroup={showGroup} detail={() => null} />
          </div>
        </details>
      ) : null}
    </IconCard>
  );
}

/** "지난주보다 새로 2 · 벗어남 1" — 변화가 없으면 "지난주와 같음" */
function changeLine(c: BlindSpotChange): string {
  const parts = [c.added.size > 0 ? `새로 ${c.added.size}` : null, c.left > 0 ? `벗어남 ${c.left}` : null].filter(Boolean);
  return parts.length > 0 ? `지난주보다 ${parts.join(" · ")}` : "지난주와 같음";
}

function PersonList({
  people,
  showGroup,
  detail,
  tag,
  isNew,
}: {
  people: BlindSpotPerson[];
  showGroup: boolean;
  detail: (p: BlindSpotPerson) => string | null;
  tag?: (p: BlindSpotPerson) => string;
  isNew?: (p: BlindSpotPerson) => boolean;
}) {
  return (
    <ul className={CARD_LIST}>
      {people.map((p) => {
        const sub = [showGroup ? groupLabel(p.groupName) : null, detail(p)].filter(Boolean).join(" · ");
        return (
          <li key={p.person_id} data-testid="blind-spot-person">
            <Link
              href={`/groups/people/${p.person_id}`}
              className={CARD_ROW}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  {p.name}
                  {isNew?.(p) ? (
                    <span className="ml-1.5 gg-pill !h-5 bg-[var(--gg-sun-soft)] !px-1.5 align-middle !text-[10.5px] text-[var(--gg-sun-ink)]" data-testid="blind-spot-new">
                      새로
                    </span>
                  ) : null}
                  {p.group_role === "leader" ? <span className="ml-1.5 text-xs font-normal text-muted">리더</span> : null}
                  {p.care_status !== "active" ? (
                    <span className="ml-1.5 text-xs font-normal text-muted">{CARE_STATUS_LABELS[p.care_status]}</span>
                  ) : null}
                </p>
                {sub ? <p className="text-[12.5px] text-[var(--gg-hint)]">{sub}</p> : null}
              </div>
              {tag ? <span className={ROW_TAG}>{tag(p)}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
