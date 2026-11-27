-- ===========================================================================
-- 옛 계정은 계정 권한에서 고치지 않는다 (2026-11-12)
--
-- 로그인 전체 초기화(2026-10-18 · 11-01)는 auth.users 를 지우고, 옛 사용자 행(public.users)은 지난 보고서의
-- 작성자 · 확인자 기록이라 남겼다 — status 'inactive', auth_user_id · 제공자 · 이메일은 비웠다.
-- 그 사람이 다시 로그인하면 새 행이 생기므로, 계정 권한 화면의 '잠긴 계정'에 같은 이름이 한 번 더 보였다.
-- 옛 행을 '잠금 풀기' 하면 로그인 없는 활성 리더 · 목사님이 하나 더 생긴다(같은 사람 두 줄).
--
-- 계정 = 로그인이 붙은 행(auth_user_id 있음). 로그인이 없는 행은 기록용이라 어떤 동작도 받지 않는다.
-- 화면도 로그인이 붙은 행만 보여 준다(admin/accounts).
-- ===========================================================================

create or replace function public.admin_update_account(p_user_id uuid, p_action text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  if not public.is_admin() then
    raise exception '운영자만 계정을 고칠 수 있습니다.' using errcode = '42501';
  end if;
  select * into v_user from public.users u where u.id = p_user_id for update;
  if not found then
    raise exception '계정을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  if v_user.id = public.current_user_id() or v_user.role = 'admin' then
    raise exception '운영자 계정은 여기서 고칠 수 없습니다.' using errcode = '42501';
  end if;
  -- 로그인 없는 옛 행(초기화로 남은 기록) — 풀면 같은 사람이 두 번 생긴다
  if v_user.auth_user_id is null then
    raise exception '로그인이 없는 옛 계정입니다.' using errcode = '22023';
  end if;

  if p_action = 'pastor_off' then
    if v_user.role <> 'pastor' then raise exception '목사님 계정이 아닙니다.' using errcode = '22023'; end if;
    update public.users set role = 'pending' where id = p_user_id;
  elsif p_action = 'officer_on' then
    -- 임원진은 목장 리더만 된다(2026-11-01)
    if v_user.role <> 'leader' then raise exception '목장 리더에게만 임원진을 맡길 수 있습니다.' using errcode = '22023'; end if;
    update public.users set is_officer = true where id = p_user_id;
  elsif p_action = 'officer_off' then
    if not (v_user.is_officer or v_user.role = 'officer') then raise exception '임원진이 아닙니다.' using errcode = '22023'; end if;
    update public.users
       set is_officer = false,
           role = case when role = 'officer' then 'pending'::public.user_role else role end
     where id = p_user_id;
  elsif p_action = 'lock' then
    update public.users set status = 'inactive' where id = p_user_id;
    -- 걸어 둔 신청도 닫는다(2026-11-06) — 잠긴 계정이 승인되는 길을 막는다
    update public.applications a
       set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
     where a.user_id = p_user_id and a.status = 'pending';
  elsif p_action = 'unlock' then
    update public.users set status = 'active' where id = p_user_id;
  else
    raise exception '알 수 없는 동작: %', p_action using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_update_account(uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_update_account(uuid, text) to authenticated;
