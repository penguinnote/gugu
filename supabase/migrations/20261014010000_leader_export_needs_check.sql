-- ===========================================================================
-- 리더 내보내기 · 리더도 보는 '확인 필요' (2026-10-14)
--
-- 1) log_export — 리더도 남긴다. 단 **자기 목장 하나만**: group_ids 가 정확히 [자기 목장] 일 때.
--    전체 목장(null) · 다른 목장 · 여러 목장은 42501. 목사님은 그대로(전체 · 여러 목장).
--    읽기는 원래 RLS 그대로 — 리더는 weekly_records_visible · reports 에서 자기 목장만 보인다.
--    로그를 보는 사람(운영자 · 목사님)도 그대로다 — 누가 언제 어느 범위를 받았는지 남는다.
--
-- 2) needs_check_people() — 명단 도입 때 '확인 필요' 로 표시된 사람(활동 중)을 전체 목장에서.
--    persons 는 RLS 로 리더에게 자기 목장만 보이므로, 이 목록만 함수(security definer)로 연다.
--    돌려주는 것은 이름 · 목장 · 리더/양 뿐 — 연락처 · 생년 · 기록은 없다. 앱 사용자(리더 · 목사님 · 운영자)만.
--    보기만 — 표시를 지우는 것은 지금처럼 운영자(사람 관리 화면).
-- ===========================================================================

create or replace function public.log_export(
  p_format    public.export_format,
  p_start     date,
  p_end       date,
  p_group_ids uuid[]
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not (
    public.is_pastor()
    or (p_group_ids is not null and cardinality(p_group_ids) = 1 and public.is_leader_of(p_group_ids[1]))
  ) then
    raise exception '내보내기는 목사님, 그리고 자기 목장 리더만 할 수 있습니다.' using errcode = '42501';
  end if;

  if p_start is null or p_end is null
     or extract(dow from p_start) <> 0 or extract(dow from p_end) <> 0 then
    raise exception '기간은 주차(주일)로 고릅니다.' using errcode = '22023';
  end if;
  if p_start > p_end then
    raise exception '시작이 끝보다 늦습니다.' using errcode = '22023';
  end if;
  if (p_end - p_start) / 7 + 1 > 52 then
    raise exception '한 번에 52주까지 내보냅니다.' using errcode = '22023';
  end if;

  if p_group_ids is not null then
    if cardinality(p_group_ids) = 0 then
      raise exception '목장을 하나 이상 고릅니다.' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_group_ids) g(id)
      where not exists (select 1 from public.groups x where x.id = g.id and x.status = 'active')
    ) then
      raise exception '운영 중이 아닌 목장이 섞여 있습니다.' using errcode = '22023';
    end if;
  end if;

  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), p_format, p_start, p_end, p_group_ids)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.log_export(public.export_format, date, date, uuid[]) is
  '내보내기 로그 — 목사님(전체 · 여러 목장) 또는 자기 목장 리더(자기 목장 하나만). 범위 검증(주차·최대 52주·운영 목장). 내보내기는 이것이 성공해야 나간다. group_ids null = 전체 목장.';

create function public.needs_check_people()
returns table (person_id uuid, name text, group_role public.group_role, group_id uuid, group_name text, group_number int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_user() then
    raise exception '승인된 사용자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.group_role, g.id, g.name, g.number
      from public.persons p
      join public.groups g on g.id = p.group_id
     where p.needs_check and p.status = 'active' and g.status = 'active'
     order by g.number, p.group_role, p.name;
end;
$$;

comment on function public.needs_check_people() is
  '명단 도입 때 확인 필요로 표시된 활동 중인 사람 — 전체 목장, 이름 · 목장 · 리더/양만. 앱 사용자(리더 · 목사님 · 운영자)가 본다. 보기만.';

revoke execute on function public.needs_check_people() from public, anon;
grant execute on function public.needs_check_people() to authenticated;
