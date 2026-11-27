"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BTN } from "@/components/ui";
import { finishTo } from "@/lib/nav-history";

import { saveMyProfile } from "./actions";

const BIO_MAX = 150, VERSE_MAX = 100, TAG_MAX = 12, TAGS = 5;

/** 소개 · 좋아하는 말씀 · 관심사(2026-11-11 인스타처럼) — 관심사는 쓰고 엔터(또는 쉼표)로 알약을 더한다. 저장하면 내 정보로 */
export function ProfileForm({ bio: bio0, verse: verse0, interests: tags0 }: { bio: string; verse: string; interests: string[] }) {
  const router = useRouter();
  const [bio, setBio] = useState(bio0);
  const [verse, setVerse] = useState(verse0);
  const [tags, setTags] = useState(tags0);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const addTag = () => {
    const t = draft.replace(/[#,]/g, "").trim().slice(0, TAG_MAX);
    if (t && !tags.includes(t) && tags.length < TAGS) setTags([...tags, t]);
    setDraft("");
  };
  const save = () =>
    start(async () => {
      const all = draft.trim() && tags.length < TAGS ? [...tags, draft.replace(/[#,]/g, "").trim().slice(0, TAG_MAX)] : tags;
      const r = await saveMyProfile(bio, verse, all);
      if (r.ok) finishTo("/me", router);
      else setMsg(r.message ?? "저장하지 못했어요.");
    });

  const FIELD = "gg-field";
  const LABEL = "flex items-baseline justify-between text-[14px] font-semibold text-[var(--gg-section)]";
  return (
    <div className="flex flex-col gap-5">
      <label className="space-y-2">
        <span className={LABEL}>
          소개 <span className="text-[12px] font-normal text-[var(--gg-hint)] tabular-nums">{bio.length}/{BIO_MAX}</span>
        </span>
        <textarea value={bio} maxLength={BIO_MAX} rows={4} onChange={(e) => setBio(e.target.value)} className={`${FIELD} resize-none`} data-testid="bio" />
      </label>
      <label className="space-y-2">
        <span className={LABEL}>
          좋아하는 말씀 <span className="text-[12px] font-normal text-[var(--gg-hint)] tabular-nums">{verse.length}/{VERSE_MAX}</span>
        </span>
        <input value={verse} maxLength={VERSE_MAX} onChange={(e) => setVerse(e.target.value)} className={FIELD} data-testid="verse" />
      </label>
      <div className="space-y-2">
        <span className={LABEL}>
          관심사 <span className="text-[12px] font-normal text-[var(--gg-hint)] tabular-nums">{tags.length}/{TAGS}</span>
        </span>
        {tags.length ? (
          <p className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded-full bg-[var(--gg-tile)] px-2.5 py-1 text-[13px] font-semibold text-[var(--gg-section)]" aria-label={`${t} 빼기`}>
                #{t} ✕
              </button>
            ))}
          </p>
        ) : null}
        {tags.length < TAGS ? (
          <input
            value={draft}
            maxLength={TAG_MAX + 1}
            onChange={(e) => (e.target.value.endsWith(",") ? (setDraft(e.target.value.slice(0, -1)), setTimeout(addTag, 0)) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            enterKeyHint="done"
            className={FIELD}
            data-testid="interest-input"
          />
        ) : null}
      </div>
      {msg ? <p className="text-[13px] text-[var(--gg-berry-ink)]">{msg}</p> : null}
      <button type="button" onClick={save} aria-disabled={pending} className={`${BTN("sky")} w-full`} data-testid="profile-save">
        {pending ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
