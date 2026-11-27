-- ===========================================================================
-- 계정 권한 관리(2026-11-05) — 운영자가 앱 안에서 계정의 역할을 고친다.
--
-- 예전엔 목사님 · 임원진 권한이 승인(approve_application) 때만 생기고 고칠 방법이 없었다. 목사님 신청을 잘못
-- 승인하면 그 계정은 모든 보고서를 계속 읽었고, 나중에 임원진이 된 리더에게 권한을 줄 길도 없었다.
--   admin_update_account(user, action)  pastor_off · officer_on · officer_off · lock · unlock
--   · 운영자만, 자기 자신과 다른 운영자 계정은 건드리지 않는다
--   · 권한을 거두면 pending — 다시 신청하면 승인 절차를 탄다
-- 명단 연결 해제(unlink_person_account)도 임원진을 함께 내리게 고친다.
-- ===========================================================================

create function public.admin_update_account(p_user_id uuid, p_action text)
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
  elsif p_action = 'unlock' then
    update public.users set status = 'active' where id = p_user_id;
  else
    raise exception '알 수 없는 동작: %', p_action using errcode = '22023';
  end if;
end;
$$;

comment on function public.admin_update_account(uuid, text) is
  '운영자의 계정 권한 고치기(2026-11-05) — pastor_off · officer_on · officer_off · lock · unlock. 자기 자신과 운영자 계정은 안 된다.';

revoke execute on function public.admin_update_account(uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_update_account(uuid, text) to authenticated;

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

  -- 임원진도 명단(리더)에 기대 있었다 — 연결을 떼면 함께 내린다(2026-11-05). 전엔 is_officer 가 남았다
  update public.users u set is_officer = false where u.id = v_person.user_id and u.role <> 'admin';

  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = v_admin
   where a.user_id = v_person.user_id and a.status = 'pending';

  insert into public.events (user_id, type, group_id, person_id)
  values (v_admin, 'account_unlinked', v_person.group_id, p_person_id);
end;
$$;

revoke execute on function public.unlink_person_account(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.unlink_person_account(uuid, boolean) to authenticated;
