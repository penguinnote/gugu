-- 프로필 — group_profiles, org_profile
--
-- 문서 04-schema.md §3.7 기준.
--
-- group_profiles 는 목장 격리의 유일한 예외다. 모든 리더가 12개 목장의 프로필을
-- 읽을 수 있고, 쓰기는 자기 목장만 가능하다. 그 강제는 Step 2 의 RLS 가 한다.

-- ---------------------------------------------------------------------------
-- group_profiles — 목장 프로필
-- ---------------------------------------------------------------------------

create table public.group_profiles (
  -- 목장당 1행. group_id 자체가 기본키다.
  group_id     uuid primary key references public.groups (id) on delete cascade,

  intro        text,

  -- 모든 리더에게 공개된다. 화면에 경고 문구가 함께 가야 한다.
  free_text    text,

  -- [{ "title": "...", "date": "2026-10-01" }]
  ddays        jsonb not null default '[]'::jsonb,
  -- [{ "title": "...", "url": "https://..." }]
  theme_songs  jsonb not null default '[]'::jsonb,
  -- 배경·글씨체·스티커 배치. Phase 3 에서 채운다.
  theme        jsonb not null default '{}'::jsonb,

  -- 부적절한 내용의 책임 추적용.
  updated_by   uuid references public.users (id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint group_profiles_ddays_is_array_ck
    check (jsonb_typeof(ddays) = 'array'),
  constraint group_profiles_theme_songs_is_array_ck
    check (jsonb_typeof(theme_songs) = 'array'),
  constraint group_profiles_theme_is_object_ck
    check (jsonb_typeof(theme) = 'object')
);

comment on table public.group_profiles is
  '목장 프로필. 목장 격리의 예외 — 모든 리더가 읽고, 자기 목장만 쓴다.';
comment on column public.group_profiles.free_text is
  '자유 글. 모든 리더에게 공개되므로 화면에 경고 문구가 필요하다.';
comment on column public.group_profiles.updated_by is
  '최종 수정자. 부적절한 내용의 책임 추적에 쓴다.';

create trigger group_profiles_set_updated_at
  before update on public.group_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- org_profile — 청년부 전체 프로필
-- ---------------------------------------------------------------------------

create table public.org_profile (
  -- 단일 행 테이블. id 를 1 로 고정해 두 번째 행이 들어오지 못하게 막는다.
  id           integer primary key default 1,

  intro        text,
  free_text    text,
  ddays        jsonb not null default '[]'::jsonb,
  theme_songs  jsonb not null default '[]'::jsonb,
  theme        jsonb not null default '{}'::jsonb,

  updated_by   uuid references public.users (id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint org_profile_single_row_ck check (id = 1),
  constraint org_profile_ddays_is_array_ck
    check (jsonb_typeof(ddays) = 'array'),
  constraint org_profile_theme_songs_is_array_ck
    check (jsonb_typeof(theme_songs) = 'array'),
  constraint org_profile_theme_is_object_ck
    check (jsonb_typeof(theme) = 'object')
);

comment on table public.org_profile is
  '청년부 전체 프로필. 단일 행. 쓰기는 운영자만 가능하다(Step 2).';

create trigger org_profile_set_updated_at
  before update on public.org_profile
  for each row execute function public.set_updated_at();
