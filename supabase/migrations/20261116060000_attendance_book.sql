-- ===========================================================================
-- 출석부 · 캠퍼스 모임(2026-11-16 사용자 요청)
--
-- 1. 출석부 — 목장 보고서가 제출되면 그 주 예배 출석(현장 · 온라인)이 출석부에 저절로 나온다. 따로 적는 표는 없다.
--    보는 사람: 운영자 · 목사님 · 임원진(회원 관리 — 사용자 결정). weekly_records 는 그 목장 리더 · 목사님만 읽으므로(RLS)
--    출석부에 필요한 것만 돌려주는 함수를 둔다: 사람 · 주 · 현장 · 온라인. 사유 · 기도제목 · 특이사항 · 목장 모임 참석은 주지 않는다.
--    제출된 보고서의 줄만(임시 저장은 아니다), 휴주는 뺀다, 기록 제외(opted_out)한 사람은 뺀다.
--    시작 주: app_meta 'attendance_start'(일요일) — 없으면 연속 제출 시작 주(streak_start), 그것도 없으면 처음부터.
--
-- 2. 캠퍼스 모임 — 사람마다 캠퍼스 이름 하나(없으면 캠퍼스 모임을 하지 않는 사람). 구조만 먼저 — 명단은 나중에 채운다.
-- ===========================================================================

create function public.attendance_start()
returns date language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.value::date from public.app_meta m where m.key = 'attendance_start'),
    (select m.value::date from public.app_meta m where m.key = 'streak_start'),
    date '2000-01-02');
$$;
comment on function public.attendance_start() is '출석부를 세기 시작하는 주(app_meta attendance_start → streak_start → 처음부터). 2026-11-16.';
revoke execute on function public.attendance_start() from public, anon;
grant  execute on function public.attendance_start() to authenticated;

create function public.attendance_book(p_from date default null, p_to date default null)
returns table (person_id uuid, week_key date, onsite boolean, online boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_weeks() then
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
  '출석부(2026-11-16) — 제출된 보고서의 예배 출석만(사람 · 주 · 현장 · 온라인). 운영자 · 목사님 · 임원진. 사유 · 기도제목은 주지 않는다.';
revoke execute on function public.attendance_book(date, date) from public, anon;
grant  execute on function public.attendance_book(date, date) to authenticated;

alter table public.persons
  add column campus text
    constraint persons_campus_ck check (campus is null or (char_length(campus) between 1 and 30 and campus = btrim(campus)));
comment on column public.persons.campus is '캠퍼스 모임 이름(2026-11-16). 없으면 캠퍼스 모임을 하지 않는다. 그 목장 리더 · 목사님 · 운영자가 고친다.';
grant update (campus) on public.persons to authenticated;

-- 출석부 · 캠퍼스 명단에 나올 사람(떠난 사람 · 기록 제외한 사람 빼고) — 임원진을 겸한 리더는 persons 를 자기 목장만 읽으므로(RLS) 함수로.
-- 연락처 · 생년 · 비고는 주지 않는다.
create function public.attendance_people()
returns table (id uuid, name text, group_id uuid, group_role public.group_role, is_group_head boolean, care_status public.care_status,
               assembly_member boolean, training_stage text, campus text, joined_at date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_weeks() then
    raise exception '출석부를 볼 수 없습니다.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.group_id, p.group_role, p.is_group_head, p.care_status, p.assembly_member, p.training_stage, p.campus, p.joined_at::date
      from public.persons p
     where p.status in ('active', 'dormant') and p.group_id is not null;
end;
$$;
comment on function public.attendance_people() is '출석부 · 캠퍼스 명단의 사람들(2026-11-16). 운영자 · 목사님 · 임원진. 연락처 · 생년 · 비고 없음.';
revoke execute on function public.attendance_people() from public, anon;
grant  execute on function public.attendance_people() to authenticated;

-- 출석부 엑셀을 받을 때 먼저 남기는 기록(내보내기 기록 화면에 나온다)
alter type public.export_format add value if not exists 'attendance';

create function public.log_attendance_export(p_from date, p_to date)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.can_manage_weeks() then
    raise exception '출석부는 운영자 · 목사님 · 임원진만 내보냅니다.' using errcode = '42501';
  end if;
  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), 'attendance', p_from, p_to, null)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.log_attendance_export(date, date) is '출석부 엑셀 내보내기 기록(2026-11-16). 운영자 · 목사님 · 임원진.';
revoke execute on function public.log_attendance_export(date, date) from public, anon;
grant  execute on function public.log_attendance_export(date, date) to authenticated;
