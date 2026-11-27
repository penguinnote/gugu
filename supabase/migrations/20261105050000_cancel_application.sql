-- ===========================================================================
-- 신청 취소(2026-11-05) — 승인 대기 화면에는 로그아웃만 있어서, 이름을 잘못 골랐으면 운영자가 거절해 줄 때까지
-- 기다려야 했다. 본인의 대기 중인 신청을 지운다(거절이 아니다 — '승인되지 않았습니다' 안내가 뜨지 않게).
-- ===========================================================================

create function public.cancel_my_application()
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.applications a
  where a.user_id = public.current_user_id() and a.status = 'pending';
$$;

comment on function public.cancel_my_application() is '본인의 승인 대기 신청을 지운다(2026-11-05).';

revoke execute on function public.cancel_my_application() from public, anon, authenticated;
grant  execute on function public.cancel_my_application() to authenticated;
