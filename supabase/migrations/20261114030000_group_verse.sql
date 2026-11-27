-- ===========================================================================
-- 목장 요절 말씀(2026-11-14 사용자 요청) — 목장 페이지 맨 위에. 목장 프로필을 고치는 사람(그 목장 리더 · 목사님 · 운영자)이 쓴다.
--   쓰기 권한 · 정책은 group_profiles 그대로(표 단위). 길이만 막는다.
-- ===========================================================================

alter table public.group_profiles add column verse text;
alter table public.group_profiles
  add constraint group_profiles_verse_len_ck check (verse is null or char_length(verse) <= 200);

comment on column public.group_profiles.verse is '목장 요절 말씀(본문과 장절을 한 칸에, 200자까지, 2026-11-14). 목장 페이지 맨 위.';
