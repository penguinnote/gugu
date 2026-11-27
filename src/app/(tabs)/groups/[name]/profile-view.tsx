import Link from "next/link";

import { IconCard } from "@/components/toss";
import { roleDotColor } from "@/lib/profile-photo";
import { BTN, GuguSays, ICON, Icon } from "@/components/ui";
import {
  ddayState,
  formatDDayDate,
  isEmptyProfile,
  sortMembers,
  upcomingDDays,
  type MemberRow,
  type ProfileBlocks,
} from "@/lib/group-profile";

/**
 * L-5a 목장 프로필 — 순서: 목장 소개 · 함께하는 사람 · 디데이 · 찬양 · 자유 글. 요절 말씀 칸은 화면에서 뺐다(2026-11-18 사용자 — DB 값은 그대로).
 * 찬양은 비어 있어도 칸을 둔다(사용자 요청). 디데이 · 자유 글은 있을 때만.
 * 빈 블록은 통째로 숨긴다. 다섯 개 다 비면 한 줄과, 고칠 수 있으면 '채우기'.
 * 소개는 구구가 말풍선으로 건네고(비었으면 조는 구구), 나머지는 토스 결 카드 하나에 묶음으로(2026-11-11 UI 통일 — 예전엔 블록마다 색칠한 카드).
 *
 * 멤버 목록은 이름만이다 — 출석·기도제목·상태(휴면·기록 제외)는 어떤 식으로도 드러내지 않는다.
 * 자유 글에 열람 범위 경고는 넣지 않는다(2026-09-27 결정).
 */
export function ProfileView({
  blocks,
  members,
  today,
  editHref,
  photos,
}: {
  blocks: ProfileBlocks;
  members: MemberRow[];
  today: string;
  editHref: string | null;
  /** 프로필 사진이 있는 사람 → 저장 시각(2026-11-11). 없으면 이름 둘째 글자 동그라미 */
  photos?: Map<string, number>;
}) {
  const sorted = sortMembers(members);
  const leaders = sorted.filter((m) => m.group_role === "leader");
  const youths = sorted.filter((m) => m.group_role === "member");
  const ddays = upcomingDDays(blocks.ddays, today);
  const empty = isEmptyProfile(blocks);

  return (
    <div className="flex flex-col gap-4">
      {blocks.intro ? (
        <GuguSays mood="smile" size={72}>
          <p className="gg-text text-[15px] leading-relaxed font-semibold" data-testid="intro">
            {blocks.intro}
          </p>
        </GuguSays>
      ) : null}

      {empty ? (
        <GuguSays mood="sleepy" size={72}>
          <p className="text-[14px] font-semibold" data-testid="empty">
            아직 목장 소개가 없습니다.
          </p>
          {editHref ? (
            <Link href={editHref} className={`${BTN("sky", "sm")} mt-2.5 !h-9 !text-[14px]`}>
              채우기
            </Link>
          ) : null}
        </GuguSays>
      ) : null}

      {/* 묶음마다 카드(2026-11-11 사용자 선택 A안) — 머리에 토스페이스 아이콘. 사람은 동그라미(프로필 사진, 없으면 이름 둘째 글자) + 이름 알약 */}
      <IconCard id="members-title" icon="/icons/tossface/u1F465.svg" title="함께하는 사람" aside={`리더 ${leaders.length} · 양 ${youths.length}`}>
        {sorted.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="contents" data-testid="leaders">
              {leaders.map((m, i) => (
                <Person key={m.id} m={m} photoAt={photos?.get(m.id) ?? null} sep={i > 0} leader />
              ))}
            </span>
            <span className="contents" data-testid="youths">
              {youths.map((m, i) => (
                <Person key={m.id} m={m} photoAt={photos?.get(m.id) ?? null} sep={i > 0} />
              ))}
            </span>
          </div>
        ) : (
          <p className="text-[15px] text-[var(--gg-hint)]">아직 명단이 없습니다.</p>
        )}
      </IconCard>

      {ddays.length > 0 ? (
        <IconCard id="ddays-title" icon="/icons/dday.svg" title="디데이">
          <ul className="flex flex-col gap-2" data-testid="ddays">
            {ddays.map((d, i) => {
              const st = ddayState(d.date, today);
              return (
                <li key={`${d.date}-${i}`} className="flex items-center gap-3">
                  <span className="min-w-[58px] shrink-0 rounded-xl bg-[var(--gg-sun-soft)] px-2 py-1.5 text-center text-[15px] font-bold text-[var(--gg-sun-ink)] tabular-nums">{st.label}</span>
                  <span className={`min-w-0 flex-1 text-[16px] ${st.kind === "today" ? "font-bold" : "font-semibold"}`}>{d.title}</span>
                  <span className="shrink-0 text-[13px] text-[var(--gg-hint)]">{formatDDayDate(d.date, today)}</span>
                </li>
              );
            })}
          </ul>
        </IconCard>
      ) : null}

      {/* 찬양 — 비어 있어도 칸은 둔다(2026-11-14) */}
      <IconCard id="songs-title" icon="/icons/tossface/u1F3B5.svg" title="찬양">
        {blocks.themeSongs.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="songs">
            {blocks.themeSongs.map((sg, i) => (
              <li key={`${sg.url}-${i}`}>
                <a href={sg.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[16px] font-semibold">{sg.title}</span>
                  <span className="shrink-0 text-[13px] text-[var(--gg-hint)]">듣기 ›</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-[var(--gg-hint)]" data-testid="songs-empty">
            아직 찬양이 없어요.
          </p>
        )}
      </IconCard>

      {blocks.freeText ? (
        <IconCard id="free-title" icon="/icons/tossface/u1F4AC.svg" title="우리 목장 이야기">
          <p className="gg-text text-[15px] leading-relaxed whitespace-pre-wrap" data-testid="free-text">
            {blocks.freeText}
          </p>
        </IconCard>
      ) : null}

      {editHref && !empty ? (
        <Link href={editHref} className={`${BTN("white")} w-full`}>
          <Icon d={ICON.write} className="h-5 w-5" strokeWidth={2.4} />
          프로필 고치기
        </Link>
      ) : null}
    </div>
  );
}

/**
 * 사람 알약 — 동그라미(프로필 사진, 없으면 사람마다 정해진 색에 성 — 2026-11-18 사용자, 예전엔 이름 둘째 글자) + 이름. 바탕색으로만 나눈다(2026-11-11 사용자 요청 —
 * '목장장' 글씨는 빼고): 목장장은 연한 갈색, 리더는 연한 연두, 양은 옅은 회색. 화면 읽기에는 '(목장장)' 이 들린다.
 * 누르면 그 사람 프로필(/profile/[id], 2026-11-11 인스타처럼). sep — 글자로 읽을 때(시험 · 화면 읽기) 이름 사이 ' · '(보이지 않는다)
 */
function Person({ m, photoAt, leader = false, sep }: { m: MemberRow; photoAt: number | null; leader?: boolean; sep: boolean }) {
  return (
    <Link
      href={`/profile/${m.id}`}
      className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[14.5px] font-semibold ${m.is_group_head ? "bg-[var(--gg-head-soft)]" : leader ? "bg-[var(--gg-sky-soft)]" : "bg-[var(--gg-tile)]"}`}
      data-head={m.is_group_head ? "" : undefined}
    >
      {sep ? <span className="sr-only"> · </span> : null}
      {photoAt ? (
        // eslint-disable-next-line @next/next/no-img-element -- 프로필 사진(/groups/photo — 작은 정사각 WebP · JPEG)
        <img src={`/groups/photo/${m.id}/${photoAt}`} alt="" className="size-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold text-white" style={{ background: roleDotColor({ id: m.id, groupRole: m.group_role, isHead: m.is_group_head }) }}>
          {m.name.trim().slice(0, 1)}
        </span>
      )}
      <span data-testid="person-name">{m.name}</span>
      {m.is_group_head ? <span className="sr-only">(목자)</span> : null}
    </Link>
  );
}
