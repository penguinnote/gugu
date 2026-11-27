"use client";

import { useState } from "react";

import { IconCard } from "@/components/toss";
import { BTN, ICON, Icon } from "@/components/ui";
import { DownloadLink } from "@/components/download-link";
import { groupLabel } from "@/lib/labels";

type Group = { id: string; name: string };

/**
 * 명단 엑셀(2026-10-28) — 전체 명단 화면 위(2026-10-29 내보내기 화면에서 옮겼다). 교회가 쓰던 명단 엑셀과 같은 모양, 기준일은 오늘.
 *   · 전체 명단 — 목사님 · 운영자 · 임원진(canAll)
 *   · 목장 명단 — 같은 모양에 한 목장 사람만. 리더는 자기 목장(ownGroup), 목사님은 목장을 고른다(미리 골라 두지 않는다).
 *     고를 목장이 없으면(리더 아닌 임원진 — groups 빈 배열) 목장 명단 칸은 없다
 * 받을 때마다 /export/roster 가 로그를 먼저 남긴다.
 */
export function RosterExport({ canAll, ownGroup, groups }: { canAll: boolean; ownGroup: string | null; groups: Group[] }) {
  const [picked, setPicked] = useState("");
  const own = ownGroup ? groups.find((g) => g.id === ownGroup) : null;
  const groupId = ownGroup ?? (picked || null);

  return (
    <IconCard icon="/icons/tossface/u1F4E4.svg" title="명단 엑셀" testId="roster-export">
      <div className="space-y-3">
      {canAll ? (
        <div className="flex flex-col gap-3">
          <DownloadLink href="/export/roster" className={`${BTN("leaf")} w-full`} testId="roster-all">
            <Icon d={ICON.export} className="h-5 w-5" strokeWidth={2.4} />
            전체 명단
          </DownloadLink>
        </div>
      ) : null}
      {ownGroup || groups.length > 0 ? (
        <>
          {ownGroup ? null : (
            <select aria-label="목장" value={picked} onChange={(e) => setPicked(e.target.value)} className="gg-field">
              <option value="">목장 고르기</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupLabel(g.name)}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-col gap-3">
            <DownloadLink
              href={groupId ? `/export/roster?group=${groupId}` : null}
              className={`${BTN(canAll || !groupId ? "white" : "leaf")} w-full ${groupId ? "" : "!text-muted"}`}
              testId="roster-group"
            >
              <Icon d={ICON.export} className="h-5 w-5" strokeWidth={2.4} />
              {own ? `${groupLabel(own.name)} 명단` : "목장 명단"}
            </DownloadLink>
          </div>
        </>
      ) : null}
      </div>
    </IconCard>
  );
}
