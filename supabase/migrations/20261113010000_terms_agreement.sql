-- ===========================================================================
-- 첫 접속 동의(2026-11-13) — 앱을 쓰는 사람(리더 · 목사님 · 임원진 · 운영자, 신청 전 계정 포함)이
-- 처음 들어올 때 한 번: ① 내 정보(로그인 계정 이름 · 이메일 · 알림 기기) 처리 동의
-- ② 비밀 유지 약속(청년들의 기도제목 · 출석 · 연락처를 돌봄에만, 캡처해 돌리지 않는다).
--
-- 기록되는 청년의 동의가 아니다 — 청년은 로그인하지 않는다(07 §0). 그건 앱 밖 동의서로 받는다.
--
-- 문구 버전(날짜 'YYYY-MM-DD')과 시각을 users 에 남긴다. 앱의 현재 버전과 다르면 다시 묻는다.
-- 쓰기는 agree_terms() 로만 — 본인 행, 활성 계정만.
-- ===========================================================================

alter table public.users
  add column terms_version   text,
  add column terms_agreed_at timestamptz;

comment on column public.users.terms_version is
  '첫 접속 동의(내 정보 처리 · 비밀 유지 약속)의 문구 버전(YYYY-MM-DD). null = 아직 동의 전. agree_terms() 로만 쓴다.';
comment on column public.users.terms_agreed_at is
  '첫 접속 동의 시각. terms_version 과 같이 바뀐다.';

create function public.agree_terms(p_version text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '동의 문구 버전이 올바르지 않습니다.' using errcode = '22023';
  end if;
  update public.users
     set terms_version = p_version, terms_agreed_at = now()
   where auth_user_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception '로그인한 계정이 없습니다.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.agree_terms(text) from public, anon;
grant  execute on function public.agree_terms(text) to authenticated;

-- 화면이 한 번에 읽도록 current_user_context 에 terms_version 을 더한다(본문은 20261030030000 과 같다)
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
  is_officer           boolean,
  terms_version        text
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.group_number, la.group_name, la.requested_role,
    u.is_officer, u.terms_version
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

revoke execute on function public.current_user_context() from public, anon, authenticated;
grant  execute on function public.current_user_context() to authenticated;
