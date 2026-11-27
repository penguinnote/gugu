-- ===========================================================================
-- 목장장 정하기(2026-11-06 사용자 요청) — 명단 고치기에서 리더 · 목사님도 목장장을 정한다.
-- 어제(20261106010000) 목장장 바꾸기를 운영자만으로 막았다(리더가 API 로 공동 리더의 목장장을 마음대로 바꾸는 것을 막으려고).
-- 이제 이 함수로만 연다: 그 목장 리더 · 목사님 · 운영자, 리더에게만, 한 목장에 한 명(새로 정하면 전 목장장은 풀린다).
-- persons_staff_only 는 이 함수 안의 쓰기만 지나가게 한다(거래 안에서만 켜지는 표시 gg.staff_rpc).
-- ===========================================================================

create or replace function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.joined_at := (now() at time zone 'Asia/Seoul')::date;
    new.care_status := 'active';
    if new.status = 'opted_out' then
      raise exception '기록 제외는 운영자만 정합니다.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and (new.status = 'opted_out' or old.status = 'opted_out') then
    raise exception '기록 제외는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception '들어온 날은 운영자만 고칩니다.' using errcode = '42501';
  end if;
  if old.group_role = 'leader' and new.status is distinct from old.status then
    raise exception '리더의 상태는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  if new.is_group_head is distinct from old.is_group_head then
    raise exception '목장장은 명단 고치기의 목장장 칸으로 정합니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.set_group_head(p_person_id uuid, p_on boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
begin
  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found or v_person.group_id is null then
    raise exception '명단에 없는 사람입니다.' using errcode = '22023';
  end if;
  if not (public.is_admin() or public.is_pastor() or public.is_leader_of(v_person.group_id)) then
    raise exception '이 목장의 목장장을 정할 수 없습니다.' using errcode = '42501';
  end if;
  if p_on and (v_person.group_role <> 'leader' or v_person.status <> 'active') then
    raise exception '목장장은 활동 중인 리더만 될 수 있습니다.' using errcode = '22023';
  end if;

  perform set_config('gg.staff_rpc', '1', true);
  if p_on then
    update public.persons set is_group_head = false
     where group_id = v_person.group_id and is_group_head and id <> p_person_id;
  end if;
  update public.persons set is_group_head = p_on where id = p_person_id and is_group_head is distinct from p_on;
  perform set_config('gg.staff_rpc', '', true);
end;
$$;

comment on function public.set_group_head(uuid, boolean) is
  '목장장 정하기 · 풀기 — 그 목장 리더 · 목사님 · 운영자. 리더에게만, 한 목장에 한 명(2026-11-06).';

revoke execute on function public.set_group_head(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.set_group_head(uuid, boolean) to authenticated;
