-- ===========================================================================
-- 시작 화면에서 역할 고르기 · 임원진 (2026-10-30)
--
-- 로그인한 뒤 처음에 목사님 · 임원진 · 리더 중 하나를 고르고, 운영자가 승인한다. 신청은 모두 applications 한 표에 쌓인다.
--   리더     명단에서 내 이름(리더)을 고른다 — 지금과 같다. 승인하면 이름이 이어지고 role = leader
--   목사님   이름을 고르지 않는다. 승인하면 role = pastor
--   임원진   목장 리더도 맡고 있으면 이름(리더)을 고르고, 아니면 고르지 않는다. 승인하면 users.is_officer = true 와
--            이름을 골랐으면 이어서 role = leader(리더 기능 — 알림 · 열매 · 보고서가 그대로), 안 골랐으면 role = officer
--
-- 임원진이 할 수 있는 것 — 전체 명단을 보고(persons 읽기) 전체 명단 엑셀을 받는다. 보고서 · 기도제목은 볼 수 없다
-- (weekly_records_visible 은 목사님 · 그 목장 리더뿐 — 바꾸지 않는다). 명단을 고치는 권한도 없다(리더면 자기 목장만, 지금처럼).
--
-- is_officer 는 본인이 고칠 수 없다 — users 의 update 권한은 name · push 칸뿐이다(20260923045800). 승인 함수만 켠다.
-- ===========================================================================

alter table public.users add column is_officer boolean not null default false;

comment on column public.users.is_officer is
  '임원진. 전체 명단을 보고 내보낸다. 리더이면서 임원진이면 role = leader 에 이것만 켜진다. 승인(approve_application)으로만 켜진다.';

create function public.is_officer()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select u.is_officer from public.users u
     where u.auth_user_id = (select auth.uid()) and u.status = 'active' and u.role <> 'pending'
  ), false)
$$;

comment on function public.is_officer() is '임원진인가 — 승인된 계정의 is_officer.';
revoke execute on function public.is_officer() from public, anon;
grant execute on function public.is_officer() to authenticated;

create or replace function public.is_app_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() in ('leader', 'pastor', 'admin', 'officer')
$$;

-- persons 읽기 — 임원진은 전체(전체 명단 엑셀이 이 경로로 읽는다). 섬김 부서(person_ministries)는 persons 를 따라간다
drop policy persons_select on public.persons;
create policy persons_select on public.persons for select to authenticated
  using (
    public.is_leader_of(group_id)
    or public.is_pastor()
    or public.is_admin()
    or public.is_officer()
    or user_id = public.current_user_id()
  );

-- 전체 명단 엑셀 — 목사님 · 운영자 · 임원진. 목장 하나는 그대로
create or replace function public.log_roster_export(p_group_id uuid default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if p_group_id is null then
    if not (public.is_pastor() or public.is_admin() or public.is_officer()) then
      raise exception '전체 명단은 목사님 · 운영자 · 임원진만 내보냅니다.' using errcode = '42501';
    end if;
  else
    if not (public.is_leader_of(p_group_id) or public.is_pastor() or public.is_admin()) then
      raise exception '목장 명단은 그 목장 리더 · 목사님 · 운영자만 내보냅니다.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.groups g where g.id = p_group_id and g.status = 'active') then
      raise exception '운영 중인 목장이 아닙니다.' using errcode = '22023';
    end if;
  end if;
  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), 'roster', null, null, case when p_group_id is null then null else array[p_group_id] end)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.log_roster_export(uuid) is
  '명단 엑셀 로그 — null = 전체 명단(목사님 · 운영자 · 임원진), 목장 하나 = 그 목장 리더 · 목사님 · 운영자. 내보내기는 이것이 성공해야 나간다.';

-- ---------------------------------------------------------------------------
-- applications — 어느 역할을 신청했나. 리더 신청만 이름이 반드시 있다
-- ---------------------------------------------------------------------------

alter table public.applications
  add column requested_role public.user_role not null default 'leader',
  alter column person_id drop not null,
  alter column group_id drop not null,
  add constraint applications_role_ck check (
    (requested_role = 'leader'  and person_id is not null and group_id is not null)
    or (requested_role = 'pastor'  and person_id is null and group_id is null)
    or (requested_role = 'officer' and (person_id is null) = (group_id is null))
  );

comment on column public.applications.requested_role is
  '신청한 역할 — leader(이름 필수) · pastor(이름 없음) · officer(리더도 맡고 있으면 이름). 2026-10-30 전 신청은 전부 leader.';

-- 목사님 · 임원진 신청. 리더 신청은 apply_for_person 그대로다
create function public.request_role(p_role public.user_role, p_person_id uuid default null)
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
  if p_role not in ('pastor', 'officer') then
    raise exception '목사님 · 임원진 신청만 받습니다.' using errcode = '22023';
  end if;
  if p_role = 'pastor' and p_person_id is not null then
    raise exception '목사님 신청에는 이름을 고르지 않습니다.' using errcode = '22023';
  end if;

  if p_person_id is not null then
    select p.group_id into v_group_id
    from public.persons p
    where p.id = p_person_id and p.status = 'active' and p.group_role = 'leader' and p.user_id is null;
    if v_group_id is null then
      raise exception '신청할 수 없는 대상입니다.' using errcode = '22023';
    end if;
  end if;

  if exists (select 1 from public.applications a where a.user_id = v_user_id and a.status = 'pending') then
    raise exception '이미 승인 대기 중인 신청이 있습니다.' using errcode = '23505';
  end if;

  insert into public.applications (user_id, person_id, group_id, requested_role)
  values (v_user_id, p_person_id, v_group_id, p_role)
  returning id into v_app_id;
  return v_app_id;
end;
$$;

comment on function public.request_role(public.user_role, uuid) is
  '목사님 · 임원진 신청. 임원진이 목장 리더도 맡고 있으면 그 이름(명단상 리더, 아직 연결 안 된)을 같이 건다.';

-- 승인 — 신청한 역할대로. 운영자만
create or replace function public.approve_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception '신청은 운영자만 확인할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_app from public.applications a
  where a.id = p_application_id for update;

  if not found or v_app.status <> 'pending' then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;

  -- 이름을 건 신청(리더 · 리더 겸 임원진) — 빈 자리에만, 리더에게만
  if v_app.person_id is not null then
    update public.persons p
       set user_id = v_app.user_id
     where p.id = v_app.person_id and p.user_id is null and p.status = 'active' and p.group_role = 'leader';
    if not found then
      raise exception '이미 다른 계정에 연결됐거나 명단에서 리더가 아닌 사람입니다.' using errcode = '23505';
    end if;
  end if;

  v_role := case
    when v_app.requested_role = 'pastor' then 'pastor'
    when v_app.requested_role = 'officer' and v_app.person_id is null then 'officer'
    else 'leader'
  end::public.user_role;

  update public.users u
     set role = v_role,
         is_officer = u.is_officer or v_app.requested_role = 'officer'
   where u.id = v_app.user_id and u.role = 'pending';

  update public.applications a
     set status = 'approved', decided_at = now(), decided_by = public.current_user_id()
   where a.id = p_application_id;

  -- 같은 사람을 노린 다른 대기 건은 자동으로 닫힌다.
  if v_app.person_id is not null then
    update public.applications a
       set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
     where a.person_id = v_app.person_id and a.status = 'pending' and a.id <> p_application_id;
  end if;
end;
$$;

-- 대기 목록 — 역할이 붙고, 이름 없는 신청(목사님 · 리더 아닌 임원진)도 나온다
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
  requested_at      timestamptz,
  requested_role    public.user_role,
  provider          public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select a.id, u.name, p.name, p.birth_date, p.birth_year, a.group_id, g.number, g.name, a.requested_at, a.requested_role, u.provider
  from public.applications a
  join public.users        u on u.id = a.user_id
  left join public.persons p on p.id = a.person_id
  left join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and public.is_admin()
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '승인 화면의 대기 목록. 운영자만 본다 — 승인·거절도 운영자만 한다. 역할 · 로그인 방법이 붙는다(2026-10-30).';

-- 내 정보 — 임원진 표시와 대기 중인 신청의 역할
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
  pending_group_name   text,
  pending_role         public.user_role,
  is_officer           boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.group_number, la.group_name, la.requested_role,
    u.is_officer
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  left join lateral (
    select a.status, ap.name as person_name, ag.number as group_number, ag.name as group_name, a.requested_role
    from public.applications a
    left join public.persons ap on ap.id = a.person_id
    left join public.groups  ag on ag.id = a.group_id
    where a.user_id = u.id
    order by a.requested_at desc
    limit 1
  ) la on true
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

revoke execute on function
  public.request_role(public.user_role, uuid), public.list_pending_applications(), public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.request_role(public.user_role, uuid), public.list_pending_applications(), public.current_user_context()
to authenticated;
