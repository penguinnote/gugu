-- 기준 정보 — groups, users, members, leaders
--
-- 문서 04-schema.md §3.1·3.3·3.4·3.5 기준. 단, 아래 설계 변경을 반영했다.
--
-- 설계 변경 (2026-09-22)
--   · seasons(학기) 테이블 제거 — 목장 구성이 거의 바뀌지 않아 학기 경계가 무의미하다.
--     Phase 3에서 시즌 리더보드를 만들 때 다시 검토한다.
--   · member_assignments / leader_assignments(배치 이력) 제거 — 리더는 한 목장에
--     몇 년씩 있고 변동은 학기당 1~2명 수준이다. 과거 맥락은
--     weekly_records.group_id_at_write 가 이미 스냅샷으로 보존한다.
--   · 대신 members.group_id / leaders.group_id 로 현재 소속을 직접 둔다.
--
-- 상태값은 영문 소문자 코드로 저장한다. 한국어 라벨은 src/lib/labels.ts 에 있다.

-- ---------------------------------------------------------------------------
-- 공통
-- ---------------------------------------------------------------------------

-- updated_at 을 손으로 갱신하면 언젠가 빠뜨린다. 트리거로 강제한다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'updated_at 자동 갱신 트리거 함수. 모든 updated_at 보유 테이블이 공유한다.';

-- ---------------------------------------------------------------------------
-- 열거형
-- ---------------------------------------------------------------------------

create type public.auth_provider as enum ('kakao', 'google');
create type public.invite_status as enum ('sent', 'accepted', 'expired');
create type public.user_role as enum ('leader', 'pastor', 'admin');
create type public.user_status as enum ('active', 'inactive');
create type public.group_status as enum ('active', 'disbanded');
create type public.gender as enum ('male', 'female');
create type public.member_status as enum ('active', 'dormant', 'left');
create type public.dormancy_request_status as enum ('none', 'pending', 'approved');
create type public.leader_status as enum ('active', 'on_leave', 'resigned');

-- ---------------------------------------------------------------------------
-- groups — 목장
-- ---------------------------------------------------------------------------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null unique,
  name        text not null,
  status      public.group_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.groups is '목장. 12개 규모.';
comment on column public.groups.number is '목장 번호. 화면에서 부르는 이름이자 정렬 기준.';

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- users — 인증 주체
-- ---------------------------------------------------------------------------

create table public.users (
  id                 uuid primary key default gen_random_uuid(),

  -- Supabase Auth 계정과의 연결. 초대를 수락하기 전까지는 null 이다.
  -- 계정 생성 경로가 초대 하나뿐이므로(04-schema §3.1) 여기가 비어 있는 행은
  -- '초대했으나 아직 들어오지 않은 사람' 을 뜻한다.
  auth_user_id       uuid unique references auth.users (id) on delete set null,

  name               text not null,

  -- 초대 수락 시 연결(bind)된다. 이후 로그인은 이 제공자로만 가능하다.
  provider           public.auth_provider,
  provider_uid       text,
  -- 카카오는 이메일 제공이 선택 동의라 없을 수 있다.
  email              text,

  invite_token       text unique,
  invite_status      public.invite_status not null default 'sent',

  -- 비어 있으면 알림이 닿지 않는다. iOS 는 홈 화면 추가를 해야만 생성된다.
  push_subscription  jsonb,
  push_registered_at timestamptz,

  role               public.user_role not null,
  status             public.user_status not null default 'active',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- 제공자를 연결했다면 식별자도 함께 있어야 한다. 한쪽만 있는 상태를 막는다.
  constraint users_provider_pair_ck
    check ((provider is null) = (provider_uid is null))
);

comment on table public.users is
  '인증 주체. 역할은 leader / pastor / admin 셋. 운영자(admin)는 관리 화면만 보고 보고서 본문은 읽지 않는다.';
comment on column public.users.auth_user_id is
  'auth.users 연결. 초대 수락 전에는 null. 실제 연결은 로드맵 Step 3 에서 붙는다.';
comment on column public.users.push_subscription is
  '웹 푸시 구독 정보. null 이면 운영자 화면(A-1c)에서 미등록자로 식별해 개별 안내한다.';

create unique index users_provider_uid_key
  on public.users (provider, provider_uid)
  where provider is not null;

create index users_role_idx on public.users (role) where status = 'active';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- members — 청년(양)
-- ---------------------------------------------------------------------------

create table public.members (
  id                uuid primary key default gen_random_uuid(),

  -- 설계 변경: 배치 이력 테이블 대신 현재 소속을 직접 둔다.
  -- 과거 맥락은 weekly_records.group_id_at_write 가 보존한다.
  group_id          uuid references public.groups (id) on delete restrict,

  name              text not null,
  gender            public.gender not null,
  status            public.member_status not null default 'active',

  -- 휴면 전환은 리더 신청 → 목사님 승인 2단계다.
  -- 승인 전까지 status 는 'active' 로 유지되어 지표 분모에 남는다.
  dormancy_request  public.dormancy_request_status not null default 'none',

  joined_at         date not null,

  -- 개인정보 범위를 넓히는 두 항목. 도입 공지에 명시된 범위 안에서만 쓴다.
  phone             text,
  birth_date        date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.members is
  '청년(양). 앱을 사용하지 않고 데이터 객체로만 존재한다.';
comment on column public.members.group_id is
  '현재 소속 목장. 과거 소속은 weekly_records.group_id_at_write 로 추적한다.';
comment on column public.members.dormancy_request is
  '휴면 신청 상태. pending 이면 목사님 승인 대기 중이며 status 는 아직 active 다.';
comment on column public.members.birth_date is
  '생일 알림용. "이번 주 생일인 양" 목록으로 쓰여 접촉 공백을 줄이는 계기가 된다.';

create index members_group_id_idx on public.members (group_id);
create index members_status_idx on public.members (status);
-- "이번 주 생일" 조회는 연도를 무시하고 월·일로만 찾는다.
create index members_birthday_idx
  on public.members ((extract(month from birth_date)), (extract(day from birth_date)))
  where birth_date is not null;

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- leaders — 리더
-- ---------------------------------------------------------------------------

create table public.leaders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.users (id) on delete cascade,

  -- 설계 변경: 배치 이력 테이블 대신 현재 소속을 직접 둔다.
  group_id    uuid references public.groups (id) on delete restrict,

  gender      public.gender not null,

  -- 목장장 등 조직상 호칭. 앱 내 추가 권한은 없다.
  -- 배치 이력 테이블을 없애면서 여기로 옮겼다(04-schema §3.6).
  title       text,

  status      public.leader_status not null default 'active',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.leaders is
  '리더. 목장당 2~4명이며 목장 내 전원 동일 권한이다.';
comment on column public.leaders.title is
  '조직상 호칭(예: 목장장). 권한과 무관하다.';

create index leaders_group_id_idx on public.leaders (group_id);
create index leaders_status_idx on public.leaders (status);

create trigger leaders_set_updated_at
  before update on public.leaders
  for each row execute function public.set_updated_at();
