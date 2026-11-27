-- ===========================================================================
-- 감사 2차(2026-11-04)
--
-- 1. 지난주 끝없이 거슬러 쓰기 막기 — '← 지난주' 를 계속 눌러 몇 달 전 주를 열고 제출하면 열매(report_late)를
--    받고 목사님 자료에 가짜 주가 생겼다. 열어 보기만 해도 빈 보고서 행이 생겼다.
--    이제 새 보고서 행 만들기와 처음 제출은 이번 주와 그 앞 3주(kst_current_week() - 21 이후)만.
--    그보다 앞 주라도 이미 있는 보고서는 열고, 이미 낸 보고서는 고친다. 나머지는 20261104010000 그대로.
-- 2. 신청 화면의 리더 목록에서 생년월일을 뺀다 — 로그인만 하면(미승인 포함) 누구나 리더들의 생년월일을
--    볼 수 있었다. 동명이인 구분은 출생년도로 한다(생년월일만 있으면 그 해를 쓴다).
-- ===========================================================================

create or replace function public.open_report(p_group_id uuid, p_week_key date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.current_user_id() is null or not public.is_leader_of(p_group_id) then
    raise exception '이 목장의 보고서를 열 권한이 없습니다.' using errcode = '42501';
  end if;
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;
  if p_week_key > public.kst_current_week() then
    raise exception '아직 오지 않은 주차입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.skipped_weeks s where s.week_key = p_week_key) then
    raise exception '휴주입니다. 이 주는 작성 대상이 아닙니다.' using errcode = '22023';
  end if;

  select r.id into v_id from public.reports r
   where r.group_id = p_group_id and r.week_key = p_week_key;

  -- 쓸 수 있는 주는 이번 주와 그 앞 3주(2026-11-04). 그보다 앞 주는 이미 있는 보고서만 연다 — 새로 만들지 않는다
  if v_id is null and p_week_key < public.kst_current_week() - 21 then
    raise exception '지난 주차는 새로 쓸 수 없습니다.' using errcode = '22023';
  end if;

  if v_id is null then
    begin
      insert into public.reports (group_id, week_key)
      values (p_group_id, p_week_key)
      returning id into v_id;
    exception when unique_violation then
      -- 두 리더가 동시에 열었다. 먼저 만든 쪽의 행을 쓴다.
      select r.id into v_id from public.reports r
       where r.group_id = p_group_id and r.week_key = p_week_key;
    end;
  end if;

  insert into public.events (user_id, type, group_id, report_id, week_key)
  values (public.current_user_id(), 'report_opened', p_group_id, v_id, p_week_key);

  return v_id;
end;
$$;

create or replace function public.submit_report(
  p_report_id  uuid,
  p_rows       jsonb,
  p_note       text    default null,
  p_note_dirty boolean default false
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_report   public.reports%rowtype;
  v_me       uuid := public.current_user_id();
  v_row      jsonb;
  v_fields   jsonb;
  v_person   uuid;
  v_expected timestamptz;
  v_set      text;
  v_key      text;
  v_n        integer;
  v_exists   boolean;
  v_prev     uuid;
  v_prayer   text;
  v_conflicts uuid[] := '{}';
  v_missing_attendance text[];
  v_missing_prayer     text[];
  v_deadline timestamptz;
  v_is_late  boolean;
  v_allowed  text[] := array['worship_attended','group_meeting_attended',
                             'one_on_one_contacted','prayer_request',
                             'worship_online','online_reason','meeting_absent_reason','absent_reason'];
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_report from public.reports r where r.id = p_report_id for update;
  -- 소유자 권한으로 돈다 — 예전엔 RLS 가 막던 것을 여기서 직접 본다. 다른 목장 보고서는 '없는 것' 으로 답한다
  if not found or not public.is_leader_of(v_report.group_id) then
    raise exception '보고서를 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if v_report.week_key > public.kst_current_week() then
    raise exception '아직 오지 않은 주차입니다.' using errcode = '22023';
  end if;
  -- 처음 제출은 이번 주와 그 앞 3주만(2026-11-04) — 몇 달 전 주를 거슬러 제출해 열매 · 기록을 만들지 못하게.
  -- 이미 낸 보고서를 고치는 건 막지 않는다
  if v_report.submitted_at is null and v_report.week_key < public.kst_current_week() - 21 then
    raise exception '너무 지난 주차는 제출할 수 없습니다.' using errcode = '22023';
  end if;

  v_deadline := ((v_report.week_key + 3)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_prayer := null;
    v_prev   := null;

    v_person   := (v_row ->> 'person_id')::uuid;
    v_fields   := coalesce(v_row -> 'fields', '{}'::jsonb);
    v_expected := nullif(v_row ->> 'expected_updated_at', '')::timestamptz;

    for v_key in select jsonb_object_keys(v_fields) loop
      if not (v_key = any (v_allowed)) then
        raise exception '허용되지 않은 필드: %', v_key using errcode = '22023';
      end if;
    end loop;

    if not exists (
      select 1 from public.persons p
      where p.id = v_person and p.group_id = v_report.group_id and p.status = 'active'
    ) then
      raise exception '이 목장의 명단에 없는 사람입니다.' using errcode = '22023';
    end if;

    select exists (
      select 1 from public.weekly_records w
      where w.report_id = p_report_id and w.person_id = v_person
    ) into v_exists;

    if v_fields ? 'prayer_request' then
      v_prayer := nullif(btrim(v_fields ->> 'prayer_request'), '');
      if v_prayer is not null then
        select v.id into v_prev
        from public.weekly_records_visible v
        where v.person_id = v_person and v.week_key < v_report.week_key
          and v.prayer_request is not null
        order by v.week_key desc limit 1;
      end if;
    end if;

    if v_exists then
      if v_fields = '{}'::jsonb then continue; end if;

      v_set := format('author_id = %L', v_me);
      for v_key in select jsonb_object_keys(v_fields) loop
        if v_key = 'prayer_request' then
          v_set := v_set || format(', prayer_request = %L, prayer_status = %L, prev_record_id = %L',
            v_prayer,
            case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end,
            v_prev);
        elsif v_key in ('online_reason', 'meeting_absent_reason', 'absent_reason') then
          v_set := v_set || format(', %I = %L', v_key, nullif(btrim(v_fields ->> v_key), ''));
        else
          v_set := v_set || format(', %I = %L', v_key, v_fields ->> v_key);
        end if;
      end loop;

      execute format(
        'update public.weekly_records set %s
          where report_id = $1 and person_id = $2 and updated_at = $3',
        v_set
      ) using p_report_id, v_person, v_expected;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        v_conflicts := v_conflicts || v_person;
      end if;
    else
      if not (v_fields ? 'worship_attended' and v_fields ? 'group_meeting_attended') then
        raise exception '출석 상태 없이 기록을 만들 수 없습니다.' using errcode = '22023';
      end if;

      begin
        insert into public.weekly_records (
          report_id, person_id, author_id, week_key, group_id_at_write,
          worship_attended, group_meeting_attended, one_on_one_contacted,
          prayer_request, prayer_status, prev_record_id,
          worship_online, online_reason, meeting_absent_reason, absent_reason
        ) values (
          p_report_id, v_person, v_me, v_report.week_key, v_report.group_id,
          (v_fields ->> 'worship_attended')::boolean,
          (v_fields ->> 'group_meeting_attended')::boolean,
          coalesce((v_fields ->> 'one_on_one_contacted')::boolean, false),
          v_prayer,
          (case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end)::public.prayer_status,
          v_prev,
          coalesce((v_fields ->> 'worship_online')::boolean, false),
          nullif(btrim(v_fields ->> 'online_reason'), ''),
          nullif(btrim(v_fields ->> 'meeting_absent_reason'), ''),
          nullif(btrim(v_fields ->> 'absent_reason'), '')
        );
      exception when unique_violation then
        v_conflicts := v_conflicts || v_person;
      end;
    end if;
  end loop;

  if p_note_dirty then
    update public.reports set note = p_note where id = p_report_id;
  end if;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object(
      'submitted', false,
      'conflicts', to_jsonb(v_conflicts),
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
  end if;

  select array_agg(p.name order by p.name) into v_missing_attendance
  from public.persons p
  where p.group_id = v_report.group_id and p.status = 'active'
    and not exists (
      select 1 from public.weekly_records w
      where w.report_id = p_report_id and w.person_id = p.id
    );

  select array_agg(p.name order by p.name) into v_missing_prayer
  from public.weekly_records_visible v
  join public.persons p on p.id = v.person_id
  where v.report_id = p_report_id
    and v.group_meeting_attended
    and coalesce(btrim(v.prayer_request), '') = '';

  if v_missing_attendance is not null or v_missing_prayer is not null then
    raise exception using
      errcode = '23514',
      message = '제출 조건을 만족하지 않습니다.',
      detail  = jsonb_build_object(
        'missing_attendance', coalesce(to_jsonb(v_missing_attendance), '[]'::jsonb),
        'missing_prayer',     coalesce(to_jsonb(v_missing_prayer), '[]'::jsonb)
      )::text;
  end if;

  if v_report.submitted_at is null then
    v_is_late := now() >= v_deadline;
    update public.reports
       set submitted_at = now(), submitted_by = v_me, is_late = v_is_late
     where id = p_report_id;
    insert into public.events (user_id, type, group_id, report_id, week_key, is_late)
    values (v_me, 'report_submitted', v_report.group_id, p_report_id, v_report.week_key, v_is_late);
  else
    v_is_late := v_report.is_late;
    update public.reports set submitted_by = v_me where id = p_report_id;
  end if;

  return jsonb_build_object(
    'submitted', true,
    'conflicts', '[]'::jsonb,
    'is_late', v_is_late,
    'late_now', now() >= v_deadline,
    'deadline', v_deadline,
    'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
               from public.weekly_records_visible v where v.report_id = p_report_id)
  );
end;
$$;

-- 신청 화면 리더 목록 — 생년월일 없이 출생년도만
drop function public.list_claimable_persons(uuid);

create function public.list_claimable_persons(p_group_id uuid)
returns table (
  id               uuid,
  name             text,
  birth_year       integer,
  group_role       public.group_role,
  claimed          boolean,
  claimed_provider public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, coalesce(p.birth_year, extract(year from p.birth_date)::integer), p.group_role,
         (p.user_id is not null) as claimed,
         u.provider as claimed_provider
  from public.persons p
  left join public.users u on u.id = p.user_id
  where p.group_id = p_group_id
    and p.status = 'active'
    and p.group_role = 'leader'
    and public.current_user_id() is not null
  order by p.name
$$;

comment on function public.list_claimable_persons(uuid) is
  '신청 화면의 리더 이름 목록. 로그인만 하면 부를 수 있어서 생년월일은 주지 않는다 — 출생년도만(2026-11-04).';

revoke execute on function public.list_claimable_persons(uuid) from public, anon, authenticated;
grant  execute on function public.list_claimable_persons(uuid) to authenticated;

revoke execute on function public.open_report(uuid, date), public.submit_report(uuid, jsonb, text, boolean) from public, anon, authenticated;
grant  execute on function public.open_report(uuid, date), public.submit_report(uuid, jsonb, text, boolean) to authenticated;
