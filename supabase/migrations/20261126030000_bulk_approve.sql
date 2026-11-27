-- 승인 화면 '모두 승인'(2026-11-26 사용자 결정) — 한꺼번에 승인할 수 있는지 화면이 미리 알게 신청 목록에 세 칸을 더한다.
--   person_id       고른 명단의 사람(같은 사람을 두 신청이 골랐는지)
--   person_linked   그 사람이 이미 다른 계정에 연결됐는지
--   applicant_active  신청한 계정이 잠기지 않았는지
-- 승인 자체는 그대로 approve_application() 을 한 건씩 부른다(권한 · 빈 자리 확인이 거기 있다).
drop function public.list_pending_applications();

create function public.list_pending_applications()
returns table (
  id uuid, applicant_name text, applicant_email text, person_name text, person_birth_date date, person_birth_year integer,
  group_id uuid, group_number integer, group_name text, requested_at timestamptz, requested_role public.user_role,
  provider public.auth_provider, person_id uuid, person_linked boolean, applicant_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, u.name, u.email, p.name, p.birth_date, p.birth_year, a.group_id, g.number, g.name, a.requested_at, a.requested_role, u.provider,
         a.person_id, (p.user_id is not null and p.user_id <> a.user_id), u.status = 'active'
  from public.applications a
  join public.users        u on u.id = a.user_id
  left join public.persons p on p.id = a.person_id
  left join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and public.is_admin()
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '운영자 승인 화면의 대기 신청. 2026-11-26 — 모두 승인을 위해 고른 사람 · 이미 연결됨 · 계정 활성 칸을 더했다.';

revoke execute on function public.list_pending_applications() from public, anon, authenticated;
grant  execute on function public.list_pending_applications() to authenticated;
