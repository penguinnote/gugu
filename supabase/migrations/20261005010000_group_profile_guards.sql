-- ===========================================================================
-- 목장 프로필 보호 (Step 8, 2026-10-05)
--
-- 프로필의 읽기·쓰기 범위는 Step 2 의 정책이 이미 정한다 — 승인된 전원이 읽고, 자기 목장 리더·목사님·
-- 운영자가 쓴다. 이번에 넣는 것은 "무엇을 쓸 수 있나" 다. 화면이 먼저 거르지만, 화면은 마지막 방어선이
-- 아니다(04 §4).
--
-- 1) updated_by 는 세션 사용자다. 지금은 클라이언트가 보낸 값이 그대로 들어간다 — 남의 id 를 넣으면
--    02 §4 의 '책임 추적' 이 무너진다. 트리거가 current_user_id() 로 덮어쓴다. 세션이 없는 쓰기(시드·
--    서버 키)는 보낸 값을 둔다.
--
-- 2) 길이·개수·원소 꼴. 소개 100자 · 자유 글 1000자 · 디데이 10개 {title, date} · 찬양 5개 {title, url}.
--    url 은 http(s) 만 — "javascript:" 링크가 다른 리더 41명의 화면에서 열리면 안 된다.
--    청년부 프로필(org_profile)에도 같은 꼴을 건다 — Step 9 의 운영자 편집이 같은 블록을 쓴다.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- updated_by — 세션 사용자로
-- ---------------------------------------------------------------------------

create function public.profile_stamp_updated_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_by := coalesce(public.current_user_id(), new.updated_by);
  return new;
end;
$$;

comment on function public.profile_stamp_updated_by() is
  'updated_by 를 세션 사용자(current_user_id)로 덮어쓴다. 세션이 없으면(시드·서버 키) 보낸 값을 둔다.';

create trigger group_profiles_stamp_updated_by
  before insert or update on public.group_profiles
  for each row execute function public.profile_stamp_updated_by();

create trigger org_profile_stamp_updated_by
  before insert or update on public.org_profile
  for each row execute function public.profile_stamp_updated_by();

-- ---------------------------------------------------------------------------
-- 블록 꼴
-- ---------------------------------------------------------------------------

-- 디데이 — [{ "title": "목장 MT", "date": "2026-11-07" }]. 제목 1~40자, 날짜 YYYY-MM-DD.
create function public.profile_ddays_valid(v jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(v) = 'array'
     and jsonb_array_length(v) <= 10
     and not exists (
       select 1 from jsonb_array_elements(v) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'title') is distinct from 'string'
          or btrim(e ->> 'title') = ''
          or char_length(e ->> 'title') > 40
          or jsonb_typeof(e -> 'date') is distinct from 'string'
          or (e ->> 'date') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
     )
$$;

-- 테마 찬양 — [{ "title": "주 안에", "url": "https://..." }]. 제목 1~60자, 링크는 http(s) 500자 이내.
create function public.profile_theme_songs_valid(v jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(v) = 'array'
     and jsonb_array_length(v) <= 5
     and not exists (
       select 1 from jsonb_array_elements(v) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'title') is distinct from 'string'
          or btrim(e ->> 'title') = ''
          or char_length(e ->> 'title') > 60
          or jsonb_typeof(e -> 'url') is distinct from 'string'
          or (e ->> 'url') !~ '^https?://[^[:space:]]+$'
          or char_length(e ->> 'url') > 500
     )
$$;

comment on function public.profile_ddays_valid(jsonb) is '디데이 블록 꼴 — 10개 이내, {title 1~40자, date YYYY-MM-DD}';
comment on function public.profile_theme_songs_valid(jsonb) is '테마 찬양 블록 꼴 — 5개 이내, {title 1~60자, url http(s) 500자 이내}';

-- check 제약은 쓰는 사람의 권한으로 돈다. 순수 검증 함수라 실행 권한을 거두지 않는다.

alter table public.group_profiles
  add constraint group_profiles_intro_len_ck     check (intro is null or char_length(intro) <= 100),
  add constraint group_profiles_free_text_len_ck check (free_text is null or char_length(free_text) <= 1000),
  add constraint group_profiles_ddays_ck         check (public.profile_ddays_valid(ddays)),
  add constraint group_profiles_theme_songs_ck   check (public.profile_theme_songs_valid(theme_songs));

alter table public.org_profile
  add constraint org_profile_intro_len_ck     check (intro is null or char_length(intro) <= 100),
  add constraint org_profile_free_text_len_ck check (free_text is null or char_length(free_text) <= 1000),
  add constraint org_profile_ddays_ck         check (public.profile_ddays_valid(ddays)),
  add constraint org_profile_theme_songs_ck   check (public.profile_theme_songs_valid(theme_songs));

comment on column public.group_profiles.intro is '목장 소개. 한두 줄, 100자.';
comment on column public.group_profiles.ddays is '디데이 [{title, date}]. 10개까지. 꼴은 profile_ddays_valid().';
comment on column public.group_profiles.theme_songs is '테마 찬양 [{title, url}]. 5개까지. 꼴은 profile_theme_songs_valid().';
comment on column public.group_profiles.updated_by is '최종 수정자 — 트리거가 세션 사용자로 채운다. 부적절한 내용의 책임 추적에 쓴다.';
