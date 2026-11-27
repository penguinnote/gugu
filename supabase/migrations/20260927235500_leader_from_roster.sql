-- ===========================================================================
-- 리더는 역할이 아니라 명단에서 온다 (2026-09-27)
--
-- A. 겸임. users.role 은 값 하나라 admin 이 leader 를 대체한다. 그러면 운영자는
--    자기 목장 보고서를 못 쓴다. 운영자는 당분간 한 명이고 그 사람은 3목장 리더다.
--    → is_leader_of() 를 "role 이 leader 또는 admin" 이고 "연결된 사람이 그 목장의
--      활동 중 리더" 로 바꾼다. 운영자라도 명단에서 리더가 아니면 얻는 게 없다 —
--      "운영자는 본문을 못 본다" 는 그대로. 명단에서 리더를 내리면 앱 권한도 그
--      즉시 끝난다. 임명은 명단이 하고 앱은 명단을 따른다.
--
-- B. 승인 주체는 신청 유형이 정한다. 앱의 승인은 임명이 아니라 **신원 확인**이다 —
--    명단에 올라 있는 사람과 로그인한 계정이 같은 사람인지 확인하는 절차.
--      청년 신청  그 목장 리더(·목사님·운영자) → member
--      리더 신청  운영자만 → 곧바로 leader
--    목사님은 리더 신청을 승인하지 않는다. 보고서를 보러 들어오시지 계정을 승인하러
--    들어오시지 않는다 — 쓰지 않을 권한을 주면 실수 경로만 는다.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A. is_leader_of — 명단 기준
-- ---------------------------------------------------------------------------

create or replace function public.is_leader_of(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_group_id is not null
     and public.current_app_role() in ('leader', 'admin')
     and exists (
       select 1
       from public.persons p
       join public.users u on u.id = p.user_id
       where u.auth_user_id = (select auth.uid())
         and u.status = 'active'
         and p.status = 'active'
         and p.group_role = 'leader'
         and p.group_id = target_group_id
     )
$$;

comment on function public.is_leader_of(uuid) is
  '리더로서 그 목장에 접근할 수 있는가. role 이 leader 또는 admin 이고, 연결된 사람이 그 목장의 활동 중 리더여야 한다. 명단이 기준이다.';

-- ---------------------------------------------------------------------------
-- B-1. 승인 — 대상이 명단상 리더면 운영자만, 결과는 leader
-- ---------------------------------------------------------------------------

create or replace function public.approve_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_app         public.applications%rowtype;
  v_person_role public.group_role;
  v_new_role    public.user_role;
begin
  select * into v_app from public.applications a
  where a.id = p_application_id for update;

  if not found or v_app.status <> 'pending' then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;

  select p.group_role into v_person_role
  from public.persons p where p.id = v_app.person_id and p.status = 'active';
  if v_person_role is null then
    raise exception '신청 대상이 명단에 없습니다.' using errcode = '22023';
  end if;

  if v_person_role = 'leader' then
    -- 리더 신청: 운영자만. 승인 = 명단상 리더와 계정이 같은 사람임을 확인하는 것.
    if not public.is_admin() then
      raise exception '리더 신청은 운영자만 확인할 수 있습니다.' using errcode = '42501';
    end if;
    v_new_role := 'leader';
  else
    if not (public.is_leader_of(v_app.group_id) or public.is_pastor() or public.is_admin()) then
      raise exception '이 목장의 신청을 승인할 권한이 없습니다.' using errcode = '42501';
    end if;
    v_new_role := 'member';
  end if;

  -- 그 사이 다른 계정에 연결됐을 수 있다. 조건부 UPDATE 로 한 번에 확인·연결한다.
  update public.persons p
     set user_id = v_app.user_id
   where p.id = v_app.person_id and p.user_id is null and p.status = 'active';

  if not found then
    raise exception '이미 다른 계정에 연결된 사람입니다.' using errcode = '23505';
  end if;

  update public.users u set role = v_new_role
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

-- ---------------------------------------------------------------------------
-- B-2. 대기 목록 — 승인할 수 있는 것만 보인다
--   리더    자기 목장의 청년 신청
--   목사님  청년 신청 전체
--   운영자  전부 (유형 표시)
-- ---------------------------------------------------------------------------

drop function public.list_pending_applications();

create function public.list_pending_applications()
returns table (
  id                uuid,
  applicant_name    text,
  person_name       text,
  person_birth_date date,
  person_role       public.group_role,
  group_id          uuid,
  group_number      integer,
  requested_at      timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select a.id, u.name, p.name, p.birth_date, p.group_role, a.group_id, g.number, a.requested_at
  from public.applications a
  join public.users   u on u.id = a.user_id
  join public.persons p on p.id = a.person_id
  join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and (
      (p.group_role = 'member' and (public.is_leader_of(a.group_id) or public.is_pastor() or public.is_admin()))
      or (p.group_role = 'leader' and public.is_admin())
    )
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '승인 화면의 대기 목록 — 내가 승인할 수 있는 것만. 리더는 자기 목장 청년 신청, 목사님은 청년 신청 전체, 운영자는 전부.';

-- ---------------------------------------------------------------------------
-- B-3. current_user_context — 대기 중인 신청의 유형 (누가 확인하는지 알려주려고)
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
  pending_person_role  public.group_role,
  pending_group_number integer
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.person_role, la.group_number
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  left join lateral (
    select a.status, ap.name as person_name, ap.group_role as person_role, ag.number as group_number
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
  public.list_pending_applications(), public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.list_pending_applications(), public.current_user_context()
to authenticated;
