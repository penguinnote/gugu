-- ===========================================================================
-- 출석부는 앱을 쓰는 사람 모두에게(2026-11-16 사용자 결정)
--   예전: 운영자 · 목사님 · 임원진(can_manage_weeks). 이제 리더 · 목사님 · 운영자 · 임원진(is_app_user).
--   보이는 것은 그대로 예배 출석 여부(현장 · 온라인)뿐 — 빠진 사유 · 기도제목 · 특이사항 · 목장 모임 참석은 그 목장 리더 · 목사님만.
--   승인 대기(pending) 계정은 여전히 못 본다.
-- ===========================================================================

create or replace function public.attendance_book(p_from date default null, p_to date default null)
returns table (person_id uuid, week_key date, onsite boolean, online boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_user() then
    raise exception '출석부를 볼 수 없습니다.' using errcode = '42501';
  end if;
  return query
    select w.person_id, w.week_key,
           w.worship_attended and not w.worship_online,
           w.worship_online
      from public.weekly_records w
      join public.reports r on r.id = w.report_id and r.submitted_at is not null
      join public.persons p on p.id = w.person_id and p.status <> 'opted_out'
     where w.week_key >= greatest(coalesce(p_from, date '2000-01-02'), public.attendance_start())
       and (p_to is null or w.week_key <= p_to)
       and not exists (select 1 from public.skipped_weeks s where s.week_key = w.week_key);
end;
$$;
comment on function public.attendance_book(date, date) is
  '출석부 — 제출된 보고서의 예배 출석만(사람 · 주 · 현장 · 온라인). 앱을 쓰는 사람 모두(2026-11-16). 사유 · 기도제목은 주지 않는다.';

create or replace function public.attendance_people()
returns table (id uuid, name text, group_id uuid, group_role public.group_role, is_group_head boolean, care_status public.care_status,
               assembly_member boolean, training_stage text, campus text, joined_at date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_user() then
    raise exception '출석부를 볼 수 없습니다.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.group_id, p.group_role, p.is_group_head, p.care_status, p.assembly_member, p.training_stage, p.campus, p.joined_at::date
      from public.persons p
     where p.status in ('active', 'dormant') and p.group_id is not null;
end;
$$;
comment on function public.attendance_people() is '출석부 · 캠퍼스 명단의 사람들. 앱을 쓰는 사람 모두(2026-11-16). 연락처 · 생년 · 비고 없음.';

create or replace function public.log_attendance_export(p_from date, p_to date)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.is_app_user() then
    raise exception '출석부를 내보낼 수 없습니다.' using errcode = '42501';
  end if;
  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), 'attendance', p_from, p_to, null)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.log_attendance_export(date, date) is '출석부 엑셀 내보내기 기록. 앱을 쓰는 사람 모두(2026-11-16).';
