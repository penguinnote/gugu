-- ===========================================================================
-- Step 10 내보내기 — 로그는 함수로만 (2026-10-06)
--
-- 내보내기는 데이터가 앱 밖으로 나가는 유일한 경로다(PRD §6.5, 02 §3.3). Excel 은 워터마크를 새길 수 없어
-- **다운로드 로그가 통제의 중심**이다. 지금까지 export_logs 는 아무 로그인 사용자나 자기 이름으로 행을 넣을
-- 수 있었다 — 리더가 가짜 로그를 쌓으면 운영자가 보는 기록이 흐려진다.
--
--   log_export(format, start, end, group_ids)  목사님만(42501). 범위를 검증하고(22023) 로그 id 를 돌려준다.
--     · 시작·끝은 주차 키(일요일), 시작 ≤ 끝, 최대 52주 (2026-10-06 결정)
--     · group_ids 는 null(= 전체 목장을 명시적으로 고름) 또는 운영 중인 목장 1개 이상
--   직접 insert 는 닫는다 — 정책을 지우고 권한을 거둔다. 읽기(목사님·운영자)는 그대로.
--   고치기·지우기 정책은 원래 없다 — 영구 보존.
-- ===========================================================================

drop policy if exists export_logs_insert on public.export_logs;
revoke insert on public.export_logs from authenticated;

create function public.log_export(
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
  if not public.is_pastor() then
    raise exception '내보내기는 목사님만 할 수 있습니다.' using errcode = '42501';
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
  '내보내기 로그 — 목사님만, 범위 검증(주차·최대 52주·운영 목장). 내보내기는 이것이 성공해야 나간다. group_ids null = 전체 목장.';

revoke execute on function public.log_export(public.export_format, date, date, uuid[]) from public, anon;
grant execute on function public.log_export(public.export_format, date, date, uuid[]) to authenticated;

comment on table public.export_logs is
  '내보내기 로그. 쓰기는 log_export() 로만, 읽기는 목사님·운영자. 영구 보존 — 삭제하지 않는다(demo:clear 도 비우지 않는다).';
