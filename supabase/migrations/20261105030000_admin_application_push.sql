-- ===========================================================================
-- 새 신청 알림(2026-11-05) — 운영자 겸 리더 계정은 홈에 리더 카드만 나와 승인 대기를 못 봤고,
-- 새 신청이 와도 알림이 없어 신청자는 운영자가 우연히 운영 화면을 열 때까지 기다렸다.
-- 신청(apply_for_person · request_role)이 들어오면 운영자 전원에게 알림을 보낸다(src/app/apply/actions.ts).
-- ===========================================================================

create function public.push_admin_targets()
returns table (user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select u.id from public.users u
  where u.role = 'admin' and u.status = 'active'
  order by u.id;
$$;

comment on function public.push_admin_targets() is '새 신청 알림을 받을 운영자 계정. 서버(service_role) 전용(2026-11-05).';

revoke execute on function public.push_admin_targets() from public, anon, authenticated;
grant  execute on function public.push_admin_targets() to service_role;
