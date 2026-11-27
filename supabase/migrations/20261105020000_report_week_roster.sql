-- ===========================================================================
-- 감사 3차(2026-11-05) — 보고서는 그 주 명단으로
--
-- 예전엔 지난 보고서도 '지금' 명단으로 그렸다. 제출한 뒤 새 사람을 넣으면 지난 보고서를 고칠 때
-- "출석 미입력 1명" 이 떠서 그때 없던 사람의 출석을 지어내야 했고, 떠난 사람의 기록은 화면에서 사라졌다.
-- 이제 submit_report 는
--   · 이 보고서에 이미 기록이 있는 사람은 그 뒤 떠났거나 옮겼어도 고칠 수 있게 하고
--   · 출석 빈칸은 처음 제출할 때만, 그 주가 끝나기 전(joined_at <= 주차 + 6일)에 들어온 활동 중인 사람만 본다.
-- 나머지는 20261104020000 그대로다. 화면도 같은 규칙으로 명단을 만든다(reports-screen · pastor 보고서 상세).
-- ===========================================================================

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

    -- 그 주 명단(2026-11-05) — 이 보고서에 이미 기록이 있는 사람(그 뒤 떠났거나 옮겼어도 고칠 수 있다),
    -- 또는 지금 이 목장에서 활동 중이고 그 주가 끝나기 전에 들어온 사람
    if not exists (
      select 1 from public.weekly_records w where w.report_id = p_report_id and w.person_id = v_person
    ) and not exists (
      select 1 from public.persons p
      where p.id = v_person and p.group_id = v_report.group_id and p.status = 'active'
        and p.joined_at <= v_report.week_key + 6
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

  -- 출석 빈칸 — 처음 제출할 때만 본다. 이미 낸 보고서를 고칠 때 그 뒤에 들어온 사람을 채우라고 하지 않는다(2026-11-05).
  -- 그 주가 끝난 뒤 들어온 사람도 그 주 명단이 아니다
  select array_agg(p.name order by p.name) into v_missing_attendance
  from public.persons p
  where v_report.submitted_at is null
    and p.group_id = v_report.group_id and p.status = 'active'
    and p.joined_at <= v_report.week_key + 6
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

revoke execute on function public.submit_report(uuid, jsonb, text, boolean) from public, anon, authenticated;
grant  execute on function public.submit_report(uuid, jsonb, text, boolean) to authenticated;
