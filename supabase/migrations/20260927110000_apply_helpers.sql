-- 신청·승인 화면용 보조 함수
--
-- pending 사용자는 테이블을 하나도 읽지 못한다(org_profile 제외). 그런데 신청
-- 화면은 목장 목록이 필요하다. 정책을 느슨하게 푸는 대신 **번호와 이름만**
-- 돌려주는 함수를 둔다 — "N목장" 열두 개는 비밀이 아니지만, 정책의 원칙
-- ("pending 은 테이블을 읽지 않는다")은 그대로 지킨다.
--
-- 승인 화면도 마찬가지다. 리더는 users 를 읽을 수 없으므로 신청자 이름을
-- 조인으로 얻을 수 없다. 자기 목장 대기 건만 이름을 붙여 돌려주는 함수를 둔다.

create or replace function public.list_application_groups()
returns table (id uuid, number integer, name text)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.number, g.name
  from public.groups g
  where g.status = 'active'
    and public.current_user_id() is not null
  order by g.number
$$;

comment on function public.list_application_groups() is
  '신청 화면의 목장 선택지. 로그인만 했으면(pending 포함) 번호·이름만 볼 수 있다.';

create or replace function public.list_pending_applications()
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
    and (public.is_leader_of(a.group_id) or public.is_pastor() or public.is_admin())
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '승인 화면의 대기 목록. 리더는 자기 목장, 목사님·운영자는 전체.';

-- current_user_context 에 대기 중인 신청의 대상 이름을 붙인다.
-- 반환 컬럼이 바뀌므로 create or replace 로는 안 되고 지우고 다시 만든다.
drop function public.current_user_context();

create function public.current_user_context()
returns table (
  user_id             uuid,
  name                text,
  role                public.user_role,
  provider            public.auth_provider,
  person_id           uuid,
  group_id            uuid,
  group_number        integer,
  group_name          text,
  group_role          public.group_role,
  is_group_head       boolean,
  application_status  public.application_status,
  pending_person_name text,
  pending_group_number integer
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, u.role, u.provider,
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
  public.list_application_groups(), public.list_pending_applications(),
  public.current_user_context()
from public, anon, authenticated;

grant execute on function
  public.list_application_groups(), public.list_pending_applications(),
  public.current_user_context()
to authenticated;
