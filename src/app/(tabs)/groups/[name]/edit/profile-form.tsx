"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useLeaveGuard } from "@/lib/use-leave-guard";
import { CARD, Pill } from "@/components/ui";
import { PROFILE_LIMITS, ddayState, normalizeProfileInput, type ProfileInput } from "@/lib/group-profile";
import { finishTo } from "@/lib/nav-history";

export type SaveProfileResult = { ok: true; updatedAt: string } | { ok: false; message: string; conflict?: boolean };
export type SaveProfile = (input: ProfileInput & { expectedUpdatedAt: string | null }) => Promise<SaveProfileResult>;

const INPUT = "gg-field";
// 카드 머리 — 둥근 글씨 제목, 곁말은 본문 글씨로 작게
const HEAD = "gg-display block text-[17px]";
const HEAD_SUB = "font-[family-name:var(--font-sans)] text-[13px] text-muted";
// 줄 지우기 — 입력 칸 높이에 맞춘 작은 흰 단추
const REMOVE = "gg-btn gg-btn-white gg-btn-sm shrink-0 !h-auto self-stretch !px-3 !text-[14px] !text-muted";
// 줄 더하기 — 카드 폭 그대로 점선 단추
const ADD = "gg-btn gg-btn-white gg-btn-sm w-full border-dashed !text-[15px] !text-[var(--gg-sky-ink)]";

/**
 * L-5b 프로필 편집 — 블록 다섯이 한 화면, 저장은 맨 밑 버튼 하나(보고서와 같은 자리).
 * 빈 줄은 저장 때 버리고, 반쯤 채운 줄은 막는다(normalizeProfileInput — 서버와 같은 함수).
 * 지난 디데이는 여기서만 '지남' 으로 보인다 — 지울 수 있게. 저장이 되면 doneHref 로 돌아간다.
 * 목장 프로필(L-5b)과 청년부 프로필(L-5c, 운영자)이 같은 폼을 쓴다 — 저장 액션만 다르다.
 * 구구 테마 — 블록마다 카드 한 장, 저장은 초록 통통 단추.
 */
export function ProfileForm({
  initial,
  expectedUpdatedAt,
  today,
  save,
  doneHref,
  introLabel = "목장 소개",
  introPlaceholder = "예: 매주 금요일 저녁 8시에 모여 한 주를 나누고 함께 기도해요.",
  freeTextLabel = "우리 목장 이야기",
  freeTextPlaceholder = "목장 소개, 모임 분위기, 이번 학기 바라는 것",
  showVerse = false,
}: {
  initial: ProfileInput;
  expectedUpdatedAt: string | null;
  today: string;
  save: SaveProfile;
  doneHref: string;
  introPlaceholder?: string;
  /** 소개 칸 이름 — 목장 프로필은 '목장 소개'(2026-11-18), 청년부 프로필은 '소개' */
  introLabel?: string;
  freeTextLabel?: string;
  freeTextPlaceholder?: string;
  /** 요절 말씀 칸(2026-11-14) — 목장 프로필만 */
  showVerse?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [verse, setVerse] = useState(initial.verse ?? "");
  const [intro, setIntro] = useState(initial.intro);
  const [freeText, setFreeText] = useState(initial.freeText);
  const [ddays, setDDays] = useState(initial.ddays.length > 0 ? initial.ddays : [{ title: "", date: "" }]);
  const [songs, setSongs] = useState(initial.themeSongs.length > 0 ? initial.themeSongs : [{ title: "", url: "" }]);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // 손댄 것이 있으면 나가기 전에 묻는다(2026-11-05)
  const startSongs = initial.themeSongs.length > 0 ? initial.themeSongs : [{ title: "", url: "" }];
  const startDDays = initial.ddays.length > 0 ? initial.ddays : [{ title: "", date: "" }];
  const changed =
    verse !== (initial.verse ?? "") ||
    intro !== initial.intro ||
    freeText !== initial.freeText ||
    JSON.stringify(ddays) !== JSON.stringify(startDDays) ||
    JSON.stringify(songs) !== JSON.stringify(startSongs);
  // 저장이 끝나면 지킴 칸을 다시 얹지 않는다(2026-11-10) — 저장 중(pending)이 풀리는 순간 '고친 것 있음' 이라 다시 얹었고,
  // finishTo 는 그 칸이 걷히기를 기다리다 1.5초를 다 채운 뒤에야 떠났다
  const [saved, setSaved] = useState(false);
  useLeaveGuard(changed, pending || saved);

  function onSave() {
    if (pending || conflict) return;
    const n = normalizeProfileInput({ verse, intro, freeText, ddays, themeSongs: songs });
    if (!n.ok) {
      setNotice(n.message);
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const r = await save({ expectedUpdatedAt, ...(showVerse ? { verse } : {}), intro, freeText, ddays, themeSongs: songs });
      if (r.ok) {
        setSaved(true);
        finishTo(doneHref, router); // 프로필에서 왔으면 뒤로 가서 새로 읽는다 — 고치기 화면은 기록에서 빠진다
        return;
      }
      setNotice(r.message);
      if (r.conflict) setConflict(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {showVerse ? (
        <section className={`${CARD} space-y-2.5 p-4`}>
          <label htmlFor="verse" className={HEAD}>
            요절 말씀 <span className={HEAD_SUB}>본문과 장절</span>
          </label>
          <textarea
            id="verse"
            value={verse}
            onChange={(e) => {
              setVerse(e.target.value);
              setNotice(null);
            }}
            rows={3}
            maxLength={PROFILE_LIMITS.verse}
            placeholder="예: 서로 사랑하라 (요한복음 13:34)"
            className={`${INPUT} resize-none`}
          />
        </section>
      ) : null}
      <section className={`${CARD} space-y-2.5 p-4`}>
        <label htmlFor="intro" className={HEAD}>
          {introLabel} <span className={HEAD_SUB}>한두 줄</span>
        </label>
        <textarea
          id="intro"
          value={intro}
          onChange={(e) => {
            setIntro(e.target.value);
            setNotice(null);
          }}
          rows={2}
          maxLength={PROFILE_LIMITS.intro}
          placeholder={introPlaceholder}
          className={`${INPUT} resize-none`}
        />
      </section>

      <section className={`${CARD} space-y-3 p-4`}>
        <h2 className={HEAD}>
          디데이 <span className={HEAD_SUB}>{PROFILE_LIMITS.ddays}개까지</span>
        </h2>
        <ul className="space-y-3">
          {ddays.map((d, i) => {
            const past = d.date ? ddayState(d.date, today).kind === "past" : false;
            return (
              <li key={i} className="space-y-1.5" data-testid="dday-row">
                <div className="flex gap-2">
                  <input
                    value={d.title}
                    onChange={(e) => {
                      setDDays(ddays.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)));
                      setNotice(null);
                    }}
                    maxLength={PROFILE_LIMITS.ddayTitle}
                    placeholder="제목 (예: 목장 MT)"
                    aria-label={`디데이 ${i + 1} 제목`}
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => setDDays(ddays.filter((_, j) => j !== i))}
                    aria-label={`디데이 ${i + 1} 삭제`}
                    className={REMOVE}
                  >
                    삭제
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={d.date}
                    onChange={(e) => {
                      setDDays(ddays.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)));
                      setNotice(null);
                    }}
                    aria-label={`디데이 ${i + 1} 날짜`}
                    className={INPUT}
                  />
                  {past ? (
                    <Pill tint="stone" className="shrink-0">
                      지남
                    </Pill>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {ddays.length < PROFILE_LIMITS.ddays ? (
          <button
            type="button"
            onClick={() => setDDays([...ddays, { title: "", date: "" }])}
            className={ADD}
          >
            + 디데이 추가
          </button>
        ) : null}
      </section>

      <section className={`${CARD} space-y-3 p-4`}>
        <h2 className={HEAD}>
          테마 찬양 <span className={HEAD_SUB}>{PROFILE_LIMITS.themeSongs}개까지 · 제목과 링크</span>
        </h2>
        <ul className="space-y-3">
          {songs.map((s, i) => (
            <li key={i} className="space-y-1.5" data-testid="song-row">
              <div className="flex gap-2">
                <input
                  value={s.title}
                  onChange={(e) => {
                    setSongs(songs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)));
                    setNotice(null);
                  }}
                  maxLength={PROFILE_LIMITS.songTitle}
                  placeholder="찬양 제목"
                  aria-label={`찬양 ${i + 1} 제목`}
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={() => setSongs(songs.filter((_, j) => j !== i))}
                  aria-label={`찬양 ${i + 1} 삭제`}
                  className={REMOVE}
                >
                  삭제
                </button>
              </div>
              <input
                type="url"
                inputMode="url"
                value={s.url}
                onChange={(e) => {
                  setSongs(songs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)));
                  setNotice(null);
                }}
                maxLength={PROFILE_LIMITS.url}
                placeholder="https://"
                aria-label={`찬양 ${i + 1} 링크`}
                className={INPUT}
              />
            </li>
          ))}
        </ul>
        {songs.length < PROFILE_LIMITS.themeSongs ? (
          <button
            type="button"
            onClick={() => setSongs([...songs, { title: "", url: "" }])}
            className={ADD}
          >
            + 찬양 추가
          </button>
        ) : null}
      </section>

      <section className={`${CARD} space-y-2.5 p-4`}>
        <label htmlFor="free-text" className={HEAD}>
          {freeTextLabel} <span className={HEAD_SUB}>{PROFILE_LIMITS.freeText}자까지</span>
        </label>
        <textarea
          id="free-text"
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value);
            setNotice(null);
          }}
          rows={6}
          maxLength={PROFILE_LIMITS.freeText}
          placeholder={freeTextPlaceholder}
          className={`${INPUT} resize-y`}
        />
      </section>

      {/* 맨 밑 저장 — 보고서와 같은 모양, 화면에 고정하지 않는다 */}
      <div className="mt-2 pt-2">
        {notice ? (
          <p role="alert" className="mb-2.5 text-center text-[13px] leading-relaxed font-semibold text-[var(--gg-berry-ink)]">
            {notice}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          aria-disabled={pending || conflict}
          className="gg-btn gg-btn-sky w-full"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
