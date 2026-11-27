-- ===========================================================================
-- 보고서 쓰기 막기(2026-11-04) — 보고서 · 출석 기록은 open_report · submit_report 로만 쓴다
--
-- 왜: reports · weekly_records 에 리더가 직접 insert/update 할 수 있었다(20260922144200 의 grant).
-- 화면은 그렇게 쓰지 않지만, 로그인한 리더가 API 를 직접 부르면
--   · 미래 · 과거 아무 주에 '제때 제출' 행을 만들어 열매를 받고(_world_on_report_submitted 는 is_late 를 믿는다)
--   · 늦은 제출을 is_late = false 로 바꾸고
--   · 다른 목장 사람의 출석을 자기 보고서에 지어 넣을 수 있었다.
-- 그래서 두 표의 쓰기 권한을 거두고, 두 함수(open_report · submit_report)를 소유자 권한으로 돌리며
-- 안에서 is_leader_of 와 '이번 주까지' 를 직접 본다. 읽기(select)와 RLS 정책은 그대로다.
-- 목사님의 보고서 지우기 정책도 함께 사라진다(쓰는 화면이 없고, 지우면 기록이 연쇄로 사라진다).
-- ===========================================================================

revoke insert, update, delete on public.reports        from authenticated;
revoke insert, update, delete on public.weekly_records from authenticated;

-- open_report — 그 주 보고서 행 확보 + 열람 기록. 미래 주차는 만들지 않는다
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

-- submit_report — 20261030010000 그대로에 권한 · 주차 검사만 더하고 소유자 권한으로
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

comment on function public.open_report(uuid, date) is
  '보고서 행 확보 + 열람 기록. SECURITY DEFINER — 안에서 is_leader_of 와 이번 주까지를 본다(2026-11-04).';
comment on function public.submit_report(uuid, jsonb, text, boolean) is
  '주간 보고서 제출. 바뀐 필드만 쓰고, 행 단위 updated_at 으로 충돌을 잡고, 완결성을 검사한 뒤 제출을 확정한다. SECURITY DEFINER — 안에서 is_leader_of 와 이번 주까지를 본다(2026-11-04). reports · weekly_records 쓰기는 이 함수와 open_report 로만.';

revoke execute on function public.open_report(uuid, date), public.submit_report(uuid, jsonb, text, boolean) from public, anon, authenticated;
grant  execute on function public.open_report(uuid, date), public.submit_report(uuid, jsonb, text, boolean) to authenticated;

-- ===========================================================================
-- 승인 대기 목록에 이메일(2026-11-04) — 이름은 본인이 바꿀 수 있어서 목사님 이름으로 바꾸고 신청할 수 있다.
-- 이메일은 로그인 제공자(auth.users)에서 온 것이고 본인이 못 고친다. 카카오는 동의하지 않으면 없다.
-- ===========================================================================

drop function public.list_pending_applications();

create function public.list_pending_applications()
returns table (
  id                uuid,
  applicant_name    text,
  applicant_email   text,
  person_name       text,
  person_birth_date date,
  person_birth_year integer,
  group_id          uuid,
  group_number      integer,
  group_name        text,
  requested_at      timestamptz,
  requested_role    public.user_role,
  provider          public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select a.id, u.name, u.email, p.name, p.birth_date, p.birth_year, a.group_id, g.number, g.name, a.requested_at, a.requested_role, u.provider
  from public.applications a
  join public.users        u on u.id = a.user_id
  left join public.persons p on p.id = a.person_id
  left join public.groups  g on g.id = a.group_id
  where a.status = 'pending'
    and public.is_admin()
  order by a.requested_at
$$;

comment on function public.list_pending_applications() is
  '승인 화면의 대기 목록. 운영자만 본다 — 승인·거절도 운영자만 한다. 역할 · 로그인 방법 · 이메일이 붙는다(2026-11-04).';

revoke execute on function public.list_pending_applications() from public, anon, authenticated;
grant  execute on function public.list_pending_applications() to authenticated;
