-- ===========================================================================
-- 잠긴 계정 안내(2026-11-05) — 운영자가 잠근 계정으로 로그인하면 "지원하지 않는 로그인 방식이거나 일시적인 오류"
-- 가 떠서 다시 시도만 되풀이했다. 로그인 직후 콜백이 이것으로 잠긴 계정인지 보고 맞는 안내로 보낸다.
-- 본인 것만 본다(auth.uid()) — current_user_id() 는 잠긴 계정이면 null 이라 쓸 수 없다.
-- ===========================================================================

create function public.my_account_locked()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid()) and u.status = 'inactive'
  );
$$;

comment on function public.my_account_locked() is '로그인한 본인 계정이 잠겼는가(2026-11-05). 로그인 콜백이 안내를 고를 때만 쓴다.';

revoke execute on function public.my_account_locked() from public, anon, authenticated;
grant  execute on function public.my_account_locked() to authenticated;
