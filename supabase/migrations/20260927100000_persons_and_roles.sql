-- Step 3.5 — 데이터 모델 통합과 권한 모델 재작업
--
-- 조직 구조에 대한 이해가 바뀌었다. 초안의 전제 세 가지가 틀렸다.
--
--   ① 규모   — 청년 150 / 리더 50 이 아니라 **전체 약 80명, 그중 리더 40명대**다.
--   ② 대상   — 리더도 목장 모임에서 기도제목을 나눈다. 주간기록 대상이다.
--              members 와 leaders 를 나눌 이유가 사라졌다 → persons 하나로 합친다.
--   ③ 사용자 — 청년도 앱을 쓴다. 역할이 3단계에서 5단계가 된다.
--              그리고 계정은 초대가 아니라 **신청 → 승인** 으로 연결된다.
--
-- 이 파일은 원격에 이미 적용된 스키마를 **전진 변환**한다. 되돌리기(rollback)
-- 마이그레이션은 두지 않는다 — 시드 외의 데이터가 아직 없고, 되돌릴 일이
-- 생기면 그때 새 마이그레이션을 쓴다.
--
-- 순서가 중요하다. 뷰 → 정책 → 함수 → 타입 → 테이블 순으로 걷어내고,
-- 반대 순서로 다시 세운다. 중간에 의존이 남아 있으면 DROP 이 실패한다.

-- ===========================================================================
-- 1. 걷어내기
-- ===========================================================================

drop view if exists public.members_public;
drop view if exists public.leaders_public;
drop view if exists public.weekly_records_visible;

-- 정책은 전부 다시 쓴다. 이름을 하나씩 적는 대신 카탈로그에서 걷어낸다 —
-- 빠뜨린 정책 하나가 옛 역할 기준으로 살아남는 사고를 막는다.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

drop trigger  if exists users_block_prelinked_insert on public.users;
drop function if exists public.users_block_prelinked_insert();
drop function if exists public.peek_invite(text);
drop function if exists public.accept_invite(text);
drop function if exists public.current_user_context();
drop function if exists public.is_leader_of(uuid);
drop function if exists public.current_leader_group_id();
drop function if exists public.is_pastor();
drop function if exists public.is_admin();
drop function if exists public.current_app_role();
drop function if exists public.current_user_id();

-- ===========================================================================
-- 2. 역할 5단계
-- ===========================================================================
--
-- enum 에 값을 추가하는 것(ALTER TYPE ... ADD VALUE)은 같은 트랜잭션 안에서
-- 새 값을 쓸 수 없다. 타입을 새로 만들어 바꿔 끼운다.
--
--   pending  미승인 — 로그인은 했지만 아직 누구인지 확인되지 않은 사람
--   member   청년   — 목장 리더가 승인한 사람
--   leader   리더   — 운영자가 부여
--   pastor   목사님
--   admin    운영자

alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('pending', 'member', 'leader', 'pastor', 'admin');

alter table public.users alter column role drop default;
alter table public.users
  alter column role type public.user_role using role::text::public.user_role;
alter table public.users alter column role set default 'pending';

drop type public.user_role_old;

-- 목장 안에서의 역할. 앱 권한(users.role)과는 다른 것이다 —
-- 이쪽은 "그 사람이 목장에서 무엇을 하는가", 저쪽은 "앱에서 무엇을 볼 수 있는가".
create type public.group_role as enum ('leader', 'member');

-- member_status 와 leader_status 를 하나로 합친다. 리더의 휴직은 dormant 로,
-- 사임은 group_role 을 member 로 내리는 것으로 표현한다.
create type public.person_status as enum ('active', 'dormant', 'left');

create type public.application_status as enum ('pending', 'approved', 'rejected');

-- ===========================================================================
-- 3. persons — 청년부 명단 (리더 포함) ★
-- ===========================================================================

create table public.persons (
  id               uuid primary key default gen_random_uuid(),

  group_id         uuid references public.groups (id) on delete restrict,

  name             text not null,
  gender           public.gender not null,

  -- 목장 안에서의 역할과 목장장 여부. 목장장은 호칭일 뿐 앱 권한과 무관하다.
  group_role       public.group_role not null default 'member',
  is_group_head    boolean not null default false,

  status           public.person_status not null default 'active',
  dormancy_request public.dormancy_request_status not null default 'none',
  joined_at        date not null,

  -- 생일 알림 + 신청 시 동명이인 구분.
  birth_date       date,
  -- 지금은 넣지 않는다. 컬럼만 남겨 나중에 채울 수 있게 한다.
  phone            text,

  -- 앱 계정 연결. 신청이 승인될 때 채워진다. 한 계정은 한 사람에게만.
  user_id          uuid unique references public.users (id) on delete set null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- 목장장은 리더여야 한다.
  constraint persons_head_is_leader_ck
    check (not is_group_head or group_role = 'leader')
);

comment on table public.persons is
  '청년부 명단. 리더와 청년을 한 테이블에 둔다 — 리더도 주간기록 대상이기 때문이다.';
comment on column public.persons.group_role is
  '목장 안에서의 역할. 앱 권한(users.role)과 별개다.';
comment on column public.persons.user_id is
  '앱 계정 연결. 신청→승인으로만 채워진다. null 이면 아직 앱을 쓰지 않는 사람.';
comment on column public.persons.phone is
  '지금은 비워둔다. 필요해지면 채우기만 하면 된다.';

-- 기존 데이터를 옮긴다. members 의 id 는 그대로 persons 의 id 가 되어
-- weekly_records 의 참조가 끊기지 않는다.
insert into public.persons (
  id, group_id, name, gender, group_role, is_group_head, status,
  dormancy_request, joined_at, birth_date, phone, user_id, created_at, updated_at
)
select
  m.id, m.group_id, m.name, m.gender, 'member', false,
  m.status::text::public.person_status,
  m.dormancy_request, m.joined_at, m.birth_date, null, null, m.created_at, m.updated_at
from public.members m;

insert into public.persons (
  group_id, name, gender, group_role, is_group_head, status,
  dormancy_request, joined_at, birth_date, phone, user_id, created_at, updated_at
)
select
  l.group_id, u.name, l.gender, 'leader', (l.title is not null),
  case l.status::text when 'active' then 'active' when 'on_leave' then 'dormant' else 'left' end::public.person_status,
  'none', coalesce(u.created_at::date, current_date), null, null, l.user_id, l.created_at, l.updated_at
from public.leaders l
join public.users u on u.id = l.user_id;

create index persons_group_id_idx on public.persons (group_id);
create index persons_status_idx   on public.persons (status);
create index persons_user_id_idx  on public.persons (user_id) where user_id is not null;
create index persons_birthday_idx
  on public.persons ((extract(month from birth_date)), (extract(day from birth_date)))
  where birth_date is not null;

create trigger persons_set_updated_at
  before update on public.persons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- weekly_records.member_id → person_id
-- ---------------------------------------------------------------------------

alter table public.weekly_records
  drop constraint weekly_records_member_id_fkey,
  drop constraint weekly_records_report_member_key;
drop index if exists public.weekly_records_member_week_idx;

alter table public.weekly_records rename column member_id to person_id;

alter table public.weekly_records
  add constraint weekly_records_person_id_fkey
    foreign key (person_id) references public.persons (id) on delete restrict,
  add constraint weekly_records_report_person_key unique (report_id, person_id);

create index weekly_records_person_week_idx
  on public.weekly_records (person_id, week_key);

comment on column public.weekly_records.person_id is
  '기록 대상. 리더 자신도 대상이 된다.';

-- ---------------------------------------------------------------------------
-- 옛 테이블·컬럼·타입 제거
-- ---------------------------------------------------------------------------

drop table public.leaders;
drop table public.members;
drop type public.member_status;
drop type public.leader_status;

alter table public.users
  drop column invite_token,
  drop column invite_status;
drop type public.invite_status;

-- ===========================================================================
-- 4. applications — 신청·승인
-- ===========================================================================
--
-- 계정은 초대가 아니라 신청으로 연결된다.
--   1) 누구나 로그인한다 (pending)
--   2) 목장을 고르고 그 목장의 미연결 인원 중 자기 이름을 고른다
--   3) 그 목장의 리더가 승인한다 → member
--
-- group_id 는 persons 에서 파생되지만 여기에도 둔다. 정책이 "이 신청이 어느
-- 목장 것인가" 를 조인 없이 판정하기 위해서다.

create table public.applications (
  id           uuid primary key default gen_random_uuid(),

  user_id      uuid not null references public.users (id) on delete cascade,
  person_id    uuid not null references public.persons (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,

  status       public.application_status not null default 'pending',

  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.users (id) on delete set null,

  constraint applications_decision_pair_ck
    check ((status = 'pending') = (decided_at is null))
);

comment on table public.applications is
  '계정 연결 신청. 해당 목장 리더가 승인하면 persons.user_id 가 채워지고 users.role 이 member 가 된다.';

-- 한 사람이 동시에 두 건을 걸어둘 수 없다.
create unique index applications_one_pending_per_user
  on public.applications (user_id) where status = 'pending';

create index applications_group_pending_idx
  on public.applications (group_id) where status = 'pending';
create index applications_person_idx on public.applications (person_id);

-- ===========================================================================
-- 5. 자기 자신에 대한 1대1 접촉은 무효
-- ===========================================================================
--
-- 리더도 기록 대상이 되면서 "작성자 = 대상" 인 행이 생긴다. 자기 자신과
-- 1대1 접촉했다는 체크는 지표를 오염시키므로 저장 시점에 false 로 바꾼다.
-- 집계 쿼리마다 예외를 두는 것보다 데이터 자체가 깨끗한 편이 낫다.

create or replace function public.weekly_records_void_self_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.one_on_one_contacted
     and exists (
       select 1 from public.persons p
       where p.id = new.person_id and p.user_id = new.author_id
     )
  then
    new.one_on_one_contacted := false;
  end if;
  return new;
end;
$$;

create trigger weekly_records_void_self_contact
  before insert or update of one_on_one_contacted, person_id, author_id
  on public.weekly_records
  for each row execute function public.weekly_records_void_self_contact();

comment on function public.weekly_records_void_self_contact() is
  '작성자와 대상이 같은 사람이면 1대1 접촉 체크를 false 로 바꾼다.';

-- ===========================================================================
-- 6. 헬퍼 함수
-- ===========================================================================
--
-- 전부 SECURITY DEFINER + search_path = '' 다. 이유는 Step 2 와 같다 —
-- 정책이 users·persons 를 읽어야 하는데 그 테이블에도 정책이 걸려 있어
-- 재귀가 생긴다. 반환값은 식별자와 불리언뿐이다.

create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.users u
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

create or replace function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

-- 현재 사용자에게 연결된 명단상의 사람.
create or replace function public.current_person_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.persons p
  join public.users u on u.id = p.user_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active' and p.status = 'active'
$$;

create or replace function public.current_group_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.group_id from public.persons p
  join public.users u on u.id = p.user_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active' and p.status = 'active'
$$;

create or replace function public.is_pastor()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() = 'pastor'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() = 'admin'
$$;

-- 승인을 받은 사람인가. pending 만 걸러낸다.
create or replace function public.is_app_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() in ('member', 'leader', 'pastor', 'admin')
$$;

-- 리더 권한으로 그 목장에 접근할 수 있는가.
-- users.role 이 leader 이고, 연결된 사람이 그 목장에 활동 중이어야 한다.
create or replace function public.is_leader_of(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_group_id is not null
     and public.current_app_role() = 'leader'
     and public.current_group_id() = target_group_id
$$;

comment on function public.is_leader_of(uuid) is
  '리더 권한 판정. 주간기록·보고서·승인의 접근 기준이다.';

revoke execute on function
  public.current_user_id(), public.current_app_role(), public.current_person_id(),
  public.current_group_id(), public.is_pastor(), public.is_admin(),
  public.is_app_user(), public.is_leader_of(uuid)
from public, anon;

grant execute on function
  public.current_user_id(), public.current_app_role(), public.current_person_id(),
  public.current_group_id(), public.is_pastor(), public.is_admin(),
  public.is_app_user(), public.is_leader_of(uuid)
to authenticated;

-- ===========================================================================
-- 7. RLS 와 권한
-- ===========================================================================

alter table public.persons      enable row level security;
alter table public.applications enable row level security;

grant select, insert, update, delete on public.persons to authenticated;
-- applications 는 읽기만 직접 한다. 쓰기는 §9 의 함수로만.
grant select on public.applications to authenticated;

revoke all on public.persons      from anon;
revoke all on public.applications from anon;

-- 역할 5단계의 열람 범위
--
--   pending  org_profile
--   member   + groups · group_profiles · persons_public (전체 명단)
--   leader   + 자기 목장의 reports · weekly_records · comments(읽기) · applications(승인)
--   pastor   전체 (민감 포함)
--   admin    관리 — users · persons · groups · applications. 보고서 본문은 못 본다
--
-- 청년(member)에게는 출석·보고서의 존재 자체가 드러나면 안 된다. 그래서
-- reports·weekly_records·comments 에는 member 를 위한 정책이 하나도 없다 —
-- 권한 오류가 아니라 **빈 결과**가 나온다. 42501 은 "거기 뭔가 있다" 를
-- 알려주는 셈이라, 테이블 권한은 authenticated 전체에 주고 행만 정책으로
-- 거른다.

-- groups
create policy groups_select on public.groups for select to authenticated
  using (public.is_app_user());
create policy groups_insert on public.groups for insert to authenticated
  with check (public.is_admin());
create policy groups_update on public.groups for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_admin());

-- users — 본인 / 목사님 / 운영자. 리더가 다른 사람의 이름을 봐야 할 때는
-- persons_public 을 쓴다.
create policy users_select on public.users for select to authenticated
  using (id = public.current_user_id() or public.is_pastor() or public.is_admin());
create policy users_insert on public.users for insert to authenticated
  with check (public.is_admin());
create policy users_update on public.users for update to authenticated
  using (id = public.current_user_id() or public.is_admin())
  with check (id = public.current_user_id() or public.is_admin());
create policy users_delete on public.users for delete to authenticated
  using (public.is_admin());

-- persons 원본 — 소속 목장 리더 · 목사님 · 운영자 · 본인
create policy persons_select on public.persons for select to authenticated
  using (
    public.is_leader_of(group_id)
    or public.is_pastor()
    or public.is_admin()
    or user_id = public.current_user_id()
  );
create policy persons_insert on public.persons for insert to authenticated
  with check (public.is_admin());
create policy persons_update on public.persons for update to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin())
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());
create policy persons_delete on public.persons for delete to authenticated
  using (public.is_pastor() or public.is_admin());

-- group_profiles — 승인된 전원 읽기. 편집은 자기 목장 리더.
-- 자유 글에 민감한 내용이 들어가지 않기로 정리됐으므로 청년도 읽는다.
create policy group_profiles_select on public.group_profiles for select to authenticated
  using (public.is_app_user());
create policy group_profiles_insert on public.group_profiles for insert to authenticated
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());
create policy group_profiles_update on public.group_profiles for update to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin())
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());
create policy group_profiles_delete on public.group_profiles for delete to authenticated
  using (public.is_pastor() or public.is_admin());

-- org_profile — pending 을 포함한 로그인 전원. 미승인자에게 보이는 유일한 것.
create policy org_profile_select on public.org_profile for select to authenticated
  using (public.current_user_id() is not null);
create policy org_profile_insert on public.org_profile for insert to authenticated
  with check (public.is_admin());
create policy org_profile_update on public.org_profile for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy org_profile_delete on public.org_profile for delete to authenticated
  using (public.is_admin());

-- reports — 리더 자기 목장, 목사님 전체. member·admin 은 정책 없음(빈 결과).
create policy reports_select on public.reports for select to authenticated
  using (public.is_pastor() or public.is_leader_of(group_id));
create policy reports_insert on public.reports for insert to authenticated
  with check (public.is_leader_of(group_id));
create policy reports_update on public.reports for update to authenticated
  using (public.is_leader_of(group_id)) with check (public.is_leader_of(group_id));
create policy reports_delete on public.reports for delete to authenticated
  using (public.is_pastor());

-- weekly_records — 판정은 작성 시점 목장. 본문 컬럼은 컬럼 권한으로 막혀 있다.
create policy weekly_records_select on public.weekly_records for select to authenticated
  using (public.is_pastor() or public.is_leader_of(group_id_at_write));
create policy weekly_records_insert on public.weekly_records for insert to authenticated
  with check (public.is_leader_of(group_id_at_write));
create policy weekly_records_update on public.weekly_records for update to authenticated
  using (public.is_leader_of(group_id_at_write)) with check (public.is_leader_of(group_id_at_write));
create policy weekly_records_delete on public.weekly_records for delete to authenticated
  using (public.is_leader_of(group_id_at_write) or public.is_pastor());

-- comments — 읽기는 해당 목장 리더 + 목사님, 쓰기는 목사님.
create policy comments_select on public.comments for select to authenticated
  using (
    public.is_pastor()
    or exists (select 1 from public.reports r
               where r.id = comments.report_id and public.is_leader_of(r.group_id))
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_pastor() and author_id = public.current_user_id());
create policy comments_update on public.comments for update to authenticated
  using (public.is_pastor() and author_id = public.current_user_id())
  with check (public.is_pastor() and author_id = public.current_user_id());
create policy comments_delete on public.comments for delete to authenticated
  using (public.is_pastor() and author_id = public.current_user_id());

-- events / export_logs — 본인 삽입, 읽기는 목사님·운영자.
create policy events_insert on public.events for insert to authenticated
  with check (user_id = public.current_user_id());
create policy events_select on public.events for select to authenticated
  using (public.is_pastor() or public.is_admin());
create policy export_logs_insert on public.export_logs for insert to authenticated
  with check (user_id = public.current_user_id());
create policy export_logs_select on public.export_logs for select to authenticated
  using (public.is_pastor() or public.is_admin());

-- applications — 본인 것, 자기 목장 리더, 목사님, 운영자.
create policy applications_select on public.applications for select to authenticated
  using (
    user_id = public.current_user_id()
    or public.is_leader_of(group_id)
    or public.is_pastor()
    or public.is_admin()
  );

-- ===========================================================================
-- 8. 뷰
-- ===========================================================================

-- 전체 명단·목장 프로필용. 승인된 전원이 읽는다. 이름·성별·소속·목장 내 역할까지.
create view public.persons_public
with (security_invoker = false) as
select p.id, p.name, p.gender, p.group_id, p.group_role, p.is_group_head
from public.persons p
where p.status <> 'left'
  and public.is_app_user();

comment on view public.persons_public is
  '전체 명단용. 이름·성별·소속·목장 내 역할까지만. 승인된 사용자 전원이 읽는다.';

-- 주간기록 읽기 경로. 민감 항목 가리기는 Step 2 와 같다.
create view public.weekly_records_visible
with (security_invoker = false) as
select
  wr.id, wr.report_id, wr.person_id, wr.author_id, wr.week_key, wr.group_id_at_write,
  wr.worship_attended, wr.group_meeting_attended, wr.one_on_one_contacted,
  case when v.may_read_body then wr.prayer_request end as prayer_request,
  case when v.may_read_body then wr.prayer_status  end as prayer_status,
  case when v.may_read_body then wr.note           end as note,
  case when v.may_read_body then wr.is_sensitive else false end as is_sensitive,
  wr.prev_record_id, wr.created_at, wr.updated_at
from public.weekly_records wr
cross join lateral (
  select (not wr.is_sensitive
          or wr.author_id = public.current_user_id()
          or public.is_pastor()) as may_read_body
) v
where public.is_pastor() or public.is_leader_of(wr.group_id_at_write);

grant select on public.persons_public         to authenticated;
grant select on public.weekly_records_visible to authenticated;
revoke all on public.persons_public         from anon;
revoke all on public.weekly_records_visible from anon;

-- ===========================================================================
-- 9. 신청·승인 함수 ★
-- ===========================================================================

-- 첫 로그인에 앱 계정을 만든다. 이미 있으면 그대로 돌려준다.
-- 가입 자체는 막지 않는다 — pending 은 청년부 프로필밖에 못 보므로 무해하다.
create or replace function public.ensure_user()
returns public.user_role
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_auth_id  uuid := (select auth.uid());
  v_role     public.user_role;
  v_name     text;
  v_provider text;
  v_uid      text;
begin
  if v_auth_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select u.role into v_role from public.users u where u.auth_user_id = v_auth_id;
  if found then return v_role; end if;

  -- 제공자 정보는 auth 스키마에서 읽는다. 클라이언트의 주장이 아니다.
  select i.provider, i.provider_id into v_provider, v_uid
  from auth.identities i where i.user_id = v_auth_id
  order by i.last_sign_in_at desc nulls last limit 1;

  if v_provider is null or v_provider not in ('kakao', 'google') then
    raise exception '지원하지 않는 로그인 제공자입니다.' using errcode = '28000';
  end if;

  select coalesce(
           au.raw_user_meta_data ->> 'full_name',
           au.raw_user_meta_data ->> 'name',
           au.raw_user_meta_data ->> 'preferred_username',
           '이름 없음')
  into v_name
  from auth.users au where au.id = v_auth_id;

  insert into public.users (auth_user_id, name, role, provider, provider_uid, email)
  select v_auth_id, v_name, 'pending', v_provider::public.auth_provider, v_uid,
         au.email
  from auth.users au where au.id = v_auth_id;

  return 'pending';
end;
$$;

-- 신청 화면의 목록. 그 목장에서 아직 계정이 연결되지 않은 활동 인원.
-- 생년월일은 동명이인 구분용이다.
create or replace function public.list_claimable_persons(p_group_id uuid)
returns table (id uuid, name text, birth_date date, group_role public.group_role)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.birth_date, p.group_role
  from public.persons p
  where p.group_id = p_group_id
    and p.status = 'active'
    and p.user_id is null
    and public.current_user_id() is not null      -- 로그인은 해야 한다
  order by p.name
$$;

-- 신청. pending 사용자만, 동시에 한 건만.
create or replace function public.apply_for_person(p_person_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id  uuid := public.current_user_id();
  v_group_id uuid;
  v_app_id   uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if public.current_app_role() <> 'pending' then
    raise exception '이미 승인된 계정입니다.' using errcode = '23505';
  end if;

  select p.group_id into v_group_id
  from public.persons p
  where p.id = p_person_id and p.status = 'active' and p.user_id is null;

  if v_group_id is null then
    raise exception '신청할 수 없는 대상입니다.' using errcode = '22023';
  end if;

  -- 이미 걸어둔 신청이 있으면 그것을 돌려준다(부분 유일 인덱스와 같은 규칙).
  select a.id into v_app_id from public.applications a
  where a.user_id = v_user_id and a.status = 'pending';
  if found then
    raise exception '이미 승인 대기 중인 신청이 있습니다.' using errcode = '23505';
  end if;

  insert into public.applications (user_id, person_id, group_id)
  values (v_user_id, p_person_id, v_group_id)
  returning id into v_app_id;

  return v_app_id;
end;
$$;

-- 승인. 해당 목장의 리더, 목사님, 운영자.
-- 청년·리더 구분 없이 승인 결과는 member 다. 리더 권한은 운영자가 따로 준다.
create or replace function public.approve_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
begin
  select * into v_app from public.applications a
  where a.id = p_application_id for update;

  if not found or v_app.status <> 'pending' then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;

  if not (public.is_leader_of(v_app.group_id) or public.is_pastor() or public.is_admin()) then
    raise exception '이 목장의 신청을 승인할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 그 사이 다른 계정에 연결됐을 수 있다. 조건부 UPDATE 로 한 번에 확인·연결한다.
  update public.persons p
     set user_id = v_app.user_id
   where p.id = v_app.person_id and p.user_id is null and p.status = 'active';

  if not found then
    raise exception '이미 다른 계정에 연결된 사람입니다.' using errcode = '23505';
  end if;

  update public.users u set role = 'member'
   where u.id = v_app.user_id and u.role = 'pending';

  update public.applications a
     set status = 'approved', decided_at = now(), decided_by = public.current_user_id()
   where a.id = p_application_id;

  -- 같은 사람을 노린 다른 대기 건은 자동으로 닫힌다.
  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
   where a.person_id = v_app.person_id and a.status = 'pending' and a.id <> p_application_id;
end;
$$;

create or replace function public.reject_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select a.group_id into v_group_id from public.applications a
  where a.id = p_application_id and a.status = 'pending' for update;

  if v_group_id is null then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;
  if not (public.is_leader_of(v_group_id) or public.is_pastor() or public.is_admin()) then
    raise exception '이 목장의 신청을 처리할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
   where a.id = p_application_id;
end;
$$;

-- 앱 역할 변경. 운영자만. member ↔ leader 만 다룬다 — pastor·admin 은 SQL 로.
-- leader 를 주려면 그 사람이 명단에서 리더여야 한다.
create or replace function public.set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '운영자만 역할을 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('member', 'leader') then
    raise exception 'member 또는 leader 만 지정할 수 있습니다.' using errcode = '22023';
  end if;
  if p_role = 'leader' and not exists (
       select 1 from public.persons p
       where p.user_id = p_user_id and p.group_role = 'leader' and p.status = 'active')
  then
    raise exception '명단에서 리더인 사람에게만 리더 권한을 줄 수 있습니다.' using errcode = '22023';
  end if;

  update public.users u set role = p_role
   where u.id = p_user_id and u.role in ('member', 'leader', 'pending');
  if not found then
    raise exception '대상 사용자를 찾을 수 없습니다.' using errcode = '22023';
  end if;
end;
$$;

-- 본인 정보. 화면이 한 번에 받는다.
create or replace function public.current_user_context()
returns table (
  user_id            uuid,
  name               text,
  role               public.user_role,
  provider           public.auth_provider,
  person_id          uuid,
  group_id           uuid,
  group_number       integer,
  group_name         text,
  group_role         public.group_role,
  is_group_head      boolean,
  application_status public.application_status
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    (select a.status from public.applications a
      where a.user_id = u.id order by a.requested_at desc limit 1)
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

revoke execute on function
  public.ensure_user(), public.list_claimable_persons(uuid), public.apply_for_person(uuid),
  public.approve_application(uuid), public.reject_application(uuid),
  public.set_user_role(uuid, public.user_role), public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.ensure_user(), public.list_claimable_persons(uuid), public.apply_for_person(uuid),
  public.approve_application(uuid), public.reject_application(uuid),
  public.set_user_role(uuid, public.user_role), public.current_user_context()
to authenticated;

-- ===========================================================================
-- 10. 정리
-- ===========================================================================

-- 자유 글에 민감한 내용이 들어가지 않기로 정리됐다. 경고 문구 요구를 지운다.
comment on column public.group_profiles.free_text is
  '자유 글. 승인된 전원(청년 포함)에게 공개된다.';
