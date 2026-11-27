-- ===========================================================================
-- 실명단 도입 준비 (2026-09-27)
--
-- 명단(data/roster.xlsx, 저장소 밖)을 npm run roster:import 로 원격에 넣기 위한 컬럼과
-- 메타 테이블. 실명 자체는 마이그레이션·시드·저장소 어디에도 들어가지 않는다.
--
--   1) persons.training_stage — 훈련단계(목자·목동·예비목자반·제자반·새가족반·양). 돌봄 맥락.
--      '-' 와 빈칸은 null. 화면 노출 방식은 아직 정하지 않았다 — 컬럼만.
--   2) persons.birth_year — 명단에는 생년월일이 아니라 출생년도만 있다. 동명이인 구분용.
--      birth_date 는 남겨 두되 당분간 비어 있다.
--   3) persons.gender 는 결측 허용 — 지금 성별을 쓰는 곳이 없다.
--   4) groups.name 유일 — 목장 식별자는 이제 이름이다. number 는 정렬 전용(명단 등장 순서).
--   5) app_meta — roster_source('seed' | 'real') · demo_records. db:seed 가 real 위에 가명을
--      얹지 못하게 막고, 데모 기록을 안전하게 지우기 위한 표시.
--   6) 화면은 목장을 이름으로 부른다("새싹 목장"). current_user_context 에 pending_group_name,
--      list_pending_applications 에 group_name.
-- ===========================================================================

alter table public.persons
  add column training_stage text,
  add column birth_year     integer check (birth_year between 1900 and 2100),
  alter column gender drop not null;

comment on column public.persons.training_stage is
  '훈련단계 — 목자·목동·예비목자반·제자반·새가족반·양. 없음은 null (명단의 "-" 와 빈칸 모두). 화면 노출 방식 미정.';
comment on column public.persons.birth_year is
  '출생년도. 명단에 생년월일이 없어 년도만 둔다. 동명이인 구분용이며 화면에 기본 노출하지 않는다.';

alter table public.groups
  add constraint groups_name_key unique (name);

comment on column public.groups.number is
  '정렬 전용. 명단 등장 순서 — 목사님이 매주 훑는 순서. 식별자는 name 이다.';
comment on column public.groups.name is
  '목장 이름 ("새싹"). 화면에서는 "새싹 목장" 으로 붙여 부른다 — src/lib/labels.ts groupLabel().';

-- ---------------------------------------------------------------------------
-- app_meta
-- ---------------------------------------------------------------------------

create table public.app_meta (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_meta is
  '운영 표시. roster_source = seed | real (real 이면 db:seed 거부) · demo_records = true | false (demo:clear 의 안전장치). 앱은 읽지 않는다 — 스크립트가 postgres 로 읽는다.';

alter table public.app_meta enable row level security;
revoke all on public.app_meta from anon, authenticated;

insert into public.app_meta (key, value) values ('roster_source', 'seed'), ('demo_records', 'false');

-- ---------------------------------------------------------------------------
-- 신청 목록 — 출생년도도 함께 (생년월일이 비어 있을 때 동명이인 구분용)
-- ---------------------------------------------------------------------------

drop function public.list_claimable_persons(uuid);

create function public.list_claimable_persons(p_group_id uuid)
returns table (
  id               uuid,
  name             text,
  birth_date       date,
  birth_year       integer,
  group_role       public.group_role,
  claimed          boolean,
  claimed_provider public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.birth_date, p.birth_year, p.group_role,
         (p.user_id is not null) as claimed,
         u.provider as claimed_provider
  from public.persons p
  left join public.users u on u.id = p.user_id
  where p.group_id = p_group_id
    and p.status = 'active'
    and p.group_role = 'leader'
    and public.current_user_id() is not null
  order by p.name
$$;

-- ---------------------------------------------------------------------------
-- 대기 목록 — 목장 이름
-- ---------------------------------------------------------------------------

drop function public.list_pending_applications();

create function public.list_pending_applications()
returns table (
  id                uuid,
  applicant_name    text,
  person_name       text,
  person_birth_date date,
  person_birth_year integer,
  group_id          uuid,
  group_number      integer,
  group_name        text,
  requested_at      timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select a.id, u.name, p.name, p.birth_date, p.birth_year, a.group_id, g.number, g.name, a.requested_at
  from public.applications a
  join public.users   u on u.id = a.user_id
  join public.persons p on p.id = a.person_id
  join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and public.is_admin()
  order by a.requested_at
$$;

-- ---------------------------------------------------------------------------
-- current_user_context — pending_group_name
-- ---------------------------------------------------------------------------

drop function public.current_user_context();

create function public.current_user_context()
returns table (
  user_id              uuid,
  name                 text,
  person_name          text,
  role                 public.user_role,
  provider             public.auth_provider,
  person_id            uuid,
  group_id             uuid,
  group_number         integer,
  group_name           text,
  group_role           public.group_role,
  is_group_head        boolean,
  application_status   public.application_status,
  pending_person_name  text,
  pending_group_number integer,
  pending_group_name   text
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.group_number, la.group_name
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  left join lateral (
    select a.status, ap.name as person_name, ag.number as group_number, ag.name as group_name
    from public.applications a
    join public.persons ap on ap.id = a.person_id
    join public.groups  ag on ag.id = a.group_id
    where a.user_id = u.id
    order by a.requested_at desc
    limit 1
  ) la on true
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

revoke execute on function
  public.list_claimable_persons(uuid), public.list_pending_applications(), public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.list_claimable_persons(uuid), public.list_pending_applications(), public.current_user_context()
to authenticated;
