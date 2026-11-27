-- ===========================================================================
-- 목장 명단 엑셀 (2026-10-28)
--
-- 명단 엑셀을 목장 하나만으로도 받는다 — 모양은 전체 명단과 같고 그 목장 사람만 있다.
--   log_roster_export(p_group_id)
--     · null(전체 명단) — 목사님 · 운영자만(지금과 같다)
--     · 목장 하나     — 그 목장 리더 · 목사님 · 운영자. 운영 중인 목장만(22023). group_ids 에 그 목장이 남는다
--   읽기는 원래 RLS 그대로 — 리더는 persons · person_ministries 에서 자기 목장만 보인다.
--   인자 없는 부르기(전체 명단)는 기본값 null 로 그대로 된다.
-- ===========================================================================

drop function public.log_roster_export();

create function public.log_roster_export(p_group_id uuid default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if p_group_id is null then
    if not (public.is_pastor() or public.is_admin()) then
      raise exception '전체 명단은 목사님 · 운영자만 내보냅니다.' using errcode = '42501';
    end if;
  else
    if not (public.is_leader_of(p_group_id) or public.is_pastor() or public.is_admin()) then
      raise exception '목장 명단은 그 목장 리더 · 목사님 · 운영자만 내보냅니다.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.groups g where g.id = p_group_id and g.status = 'active') then
      raise exception '운영 중인 목장이 아닙니다.' using errcode = '22023';
    end if;
  end if;
  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), 'roster', null, null, case when p_group_id is null then null else array[p_group_id] end)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.log_roster_export(uuid) is
  '명단 엑셀 로그 — null = 전체 명단(목사님 · 운영자), 목장 하나 = 그 목장 리더 · 목사님 · 운영자. 내보내기는 이것이 성공해야 나간다.';

revoke execute on function public.log_roster_export(uuid) from public, anon;
grant execute on function public.log_roster_export(uuid) to authenticated;
