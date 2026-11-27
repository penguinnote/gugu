-- ===========================================================================
-- 앱 사용자는 리더·목사님·운영자뿐이다 (2026-09-27)
--
-- 청년(양)에게는 앱을 공유하지 않기로 했다. 구분을 분명히:
--   남는다   persons 의 청년 39명 (group_role = 'member') — 출석·기도제목·1대1 대상.
--            이 마이그레이션은 persons 의 청년 행·group_role·weekly_records 를 건드리지 않는다.
--   없어진다 앱 사용자로서의 청년 — users.role = 'member', 청년 로그인·신청·화면.
--
-- 이 마이그레이션
--   1) 데이터 정리: 청년 person 의 계정 연결을 풀고, member 계정은 pending 으로
--   2) user_role 에서 'member' 를 실제로 제거 (타입 교체)
--   3) 청년 person 에는 계정을 붙일 수 없다 — 트리거 (연결된 리더를 청년으로 내리려면 먼저 뗀다)
--   4) 신청 대상은 명단상 리더뿐
--   5) 승인·거절은 운영자만 — 신청 유형 분기(어제 것)를 걷어낸다. 목사님은 승인하지 않는다
--   6) set_user_role 삭제 — 리더는 승인으로만 생기고, 내리는 건 unlink 다
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 데이터 정리 (트리거·타입 교체보다 먼저)
-- ---------------------------------------------------------------------------

update public.persons p set user_id = null
 where p.group_role = 'member' and p.user_id is not null;

update public.users u set role = 'pending' where u.role = 'member';

-- ---------------------------------------------------------------------------
-- 2. user_role 타입 교체 — 'member' 제거
--
-- Postgres 는 enum 값을 지우지 못한다. 새 타입을 만들어 컬럼을 옮기고 옛 타입을 지운다.
-- 시그니처에 user_role 이 들어간 함수는 타입에 묶여 있으므로 먼저 지우고 다시 만든다.
-- ---------------------------------------------------------------------------

drop function public.set_user_role(uuid, public.user_role);   -- 6) 삭제. 다시 만들지 않는다
drop function public.current_user_context();                  -- 아래에서 다시 만든다
drop function public.current_app_role();                      -- 아래에서 다시 만든다
drop function public.ensure_user();                           -- 아래에서 다시 만든다 (본문 동일)
drop function if exists public.accept_invite(text);           -- 초대 방식의 잔재. 이미 쓰지 않는다

alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('pending', 'leader', 'pastor', 'admin');

alter table public.users
  alter column role drop default,
  alter column role type public.user_role using role::text::public.user_role,
  alter column role set default 'pending';

drop type public.user_role_old;

comment on type public.user_role is
  '앱 계정의 역할. pending 미승인(신청 전·대기) · leader 리더 · pastor 목사님 · admin 운영자. 청년은 앱을 쓰지 않는다 — persons.group_role 로만 존재한다.';

create function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

-- ensure_user — 본문은 20260927190000 과 같다. 반환 타입 때문에 다시 만든다.
create function public.ensure_user()
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

  v_provider := (select auth.jwt()) -> 'app_metadata' ->> 'provider';

  select i.provider_id into v_uid
  from auth.identities i
  where i.user_id = v_auth_id and (v_provider is null or i.provider = v_provider)
  order by i.last_sign_in_at desc nulls last limit 1;

  if v_provider is null then
    select i.provider into v_provider
    from auth.identities i where i.user_id = v_auth_id
    order by i.last_sign_in_at desc nulls last limit 1;
  end if;

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
  select v_auth_id, v_name, 'pending', v_provider::public.auth_provider, v_uid, au.email
  from auth.users au where au.id = v_auth_id;

  return 'pending';
end;
$$;

-- 승인을 받은 사람인가. pending 만 걸러낸다.
create or replace function public.is_app_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() in ('leader', 'pastor', 'admin')
$$;

-- is_pastor · is_admin · is_leader_of 는 본문에서 current_app_role() 을 이름으로 부르므로 그대로다.

-- ---------------------------------------------------------------------------
-- 3. 청년 person 에는 계정이 붙지 않는다 — 트리거 제약
--
-- 허용: 리더에 붙이기·떼기. 거부: 청년에 붙이기, 계정이 붙은 리더를 청년으로 내리기.
-- 내리려면 unlink_person_account 로 먼저 뗀다 — "옮기려면 먼저 뗀다" 와 같은 규칙.
-- ---------------------------------------------------------------------------

create or replace function public.persons_member_has_no_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_role = 'member' and new.user_id is not null then
    raise exception '청년에게는 앱 계정을 붙일 수 없습니다. 계정이 있는 리더를 청년으로 내리려면 먼저 연결을 해제하세요.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger persons_member_has_no_account
  before insert or update of user_id, group_role on public.persons
  for each row execute function public.persons_member_has_no_account();

-- ---------------------------------------------------------------------------
-- 4. 신청 — 대상은 명단상 리더뿐
-- ---------------------------------------------------------------------------

drop function public.list_claimable_persons(uuid);

create function public.list_claimable_persons(p_group_id uuid)
returns table (
  id               uuid,
  name             text,
  birth_date       date,
  group_role       public.group_role,
  claimed          boolean,
  claimed_provider public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.birth_date, p.group_role,
         (p.user_id is not null) as claimed,
         u.provider as claimed_provider
  from public.persons p
  left join public.users u on u.id = p.user_id
  where p.group_id = p_group_id
    and p.status = 'active'
    and p.group_role = 'leader'                    -- 청년 이름은 나오지 않는다
    and public.current_user_id() is not null       -- 로그인은 해야 한다
  order by p.name
$$;

comment on function public.list_claimable_persons(uuid) is
  '신청 화면의 목록 — 그 목장의 활동 중 리더 전원. 점유됐으면 어느 로그인 방법이 잡고 있는지 같이 준다. 청년은 앱을 쓰지 않으므로 나오지 않는다.';

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
  where p.id = p_person_id and p.status = 'active' and p.group_role = 'leader' and p.user_id is null;

  if v_group_id is null then
    raise exception '신청할 수 없는 대상입니다.' using errcode = '22023';
  end if;

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

-- ---------------------------------------------------------------------------
-- 5. 승인·거절 — 운영자만. 결과는 언제나 leader
--
-- 승인은 임명이 아니라 신원 확인이다. 임명은 명단이 한다. 목사님은 보고서를 보러
-- 들어오시지 계정을 승인하러 들어오시지 않는다 — 쓰지 않을 권한은 주지 않는다.
-- ---------------------------------------------------------------------------

create or replace function public.approve_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
begin
  if not public.is_admin() then
    raise exception '신청은 운영자만 확인할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_app from public.applications a
  where a.id = p_application_id for update;

  if not found or v_app.status <> 'pending' then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;

  -- 빈 자리에만, 리더에게만. 그 사이 다른 계정에 연결됐거나 명단이 바뀌었으면 여기서 멈춘다.
  update public.persons p
     set user_id = v_app.user_id
   where p.id = v_app.person_id and p.user_id is null and p.status = 'active' and p.group_role = 'leader';

  if not found then
    raise exception '이미 다른 계정에 연결됐거나 명단에서 리더가 아닌 사람입니다.' using errcode = '23505';
  end if;

  update public.users u set role = 'leader'
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
begin
  if not public.is_admin() then
    raise exception '신청은 운영자만 처리할 수 있습니다.' using errcode = '42501';
  end if;

  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
   where a.id = p_application_id and a.status = 'pending';

  if not found then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;
end;
$$;

drop function public.list_pending_applications();

create function public.list_pending_applications()
returns table (
  id                uuid,
  applicant_name    text,
  person_name       text,
  person_birth_date date,
  group_id          uuid,
  group_number      integer,
  requested_at      timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select a.id, u.name, p.name, p.birth_date, a.group_id, g.number, a.requested_at
  from public.applications a
  join public.users   u on u.id = a.user_id
  join public.persons p on p.id = a.person_id
  join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and public.is_admin()
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '승인 화면의 대기 목록. 운영자만 본다 — 승인·거절도 운영자만 한다.';

comment on table public.applications is
  '계정 연결 신청. 명단상 리더만 대상이고, 운영자가 승인하면 persons.user_id 가 채워지고 users.role 이 leader 가 된다.';

-- unlink: member 값이 사라졌다
create or replace function public.unlink_person_account(p_person_id uuid, p_disable boolean default false)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin  uuid := public.current_user_id();
  v_person public.persons%rowtype;
begin
  if not public.is_admin() then
    raise exception '운영자만 연결을 해제할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found then
    raise exception '명단에 없는 사람입니다.' using errcode = '22023';
  end if;
  if v_person.user_id is null then
    raise exception '연결된 계정이 없습니다.' using errcode = '22023';
  end if;

  update public.persons p set user_id = null where p.id = p_person_id;

  update public.users u
     set role   = 'pending',
         status = case when p_disable then 'inactive'::public.user_status else u.status end
   where u.id = v_person.user_id and u.role in ('pending', 'leader');

  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = v_admin
   where a.user_id = v_person.user_id and a.status = 'pending';

  insert into public.events (user_id, type, group_id, person_id)
  values (v_admin, 'account_unlinked', v_person.group_id, p_person_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- current_user_context — pending_person_role 제거 (신청은 언제나 리더)
-- ---------------------------------------------------------------------------

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
  pending_group_number integer
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.group_number
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  left join lateral (
    select a.status, ap.name as person_name, ag.number as group_number
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
  public.current_app_role(), public.is_app_user(), public.ensure_user(),
  public.list_claimable_persons(uuid), public.apply_for_person(uuid),
  public.approve_application(uuid), public.reject_application(uuid),
  public.list_pending_applications(), public.unlink_person_account(uuid, boolean),
  public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.current_app_role(), public.is_app_user(), public.ensure_user(),
  public.list_claimable_persons(uuid), public.apply_for_person(uuid),
  public.approve_application(uuid), public.reject_application(uuid),
  public.list_pending_applications(), public.unlink_person_account(uuid, boolean),
  public.current_user_context()
to authenticated;
