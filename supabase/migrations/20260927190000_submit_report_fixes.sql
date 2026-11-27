-- 브라우저 검증에서 나온 수정 (2026-09-27)
--
-- ① submit_report — 빈 기도제목이 앞 사람의 기도제목을 물려받던 버그 ★
--    v_prayer · v_prev 가 루프 변수인데 fields 에 prayer_request 가 있을 때만
--    대입되고 반복마다 초기화되지 않았다. INSERT 분기가 그 잔존값을 썼다.
--    A 의 기도제목이 B 의 이름으로 저장되는 것 — 이 앱이 막으려던 오해를 그대로
--    만드는 버그다. 반복 시작에서 둘을 비운다.
--
-- ② submit_report — 출석 상태 없는 새 행 거부
--    fields 가 비었거나 출석 두 축이 다 없는 새 행은 조용히 결석 행이 됐다.
--    "전원 출석 상태 입력" 이 제출 조건이므로 서버도 거부한다.
--
-- ③ current_user_context — 명단 이름(person_name) 추가
--    이 앱에서 사람을 식별하는 기준은 명단이다. 계정 프로필 이름은 보조다.
--
-- ④ ensure_user — 제공자는 현재 세션의 것
--    identities 를 last_sign_in_at 로 고르면 구글로 들어왔는데 카카오로 기록됐다.
--    JWT 의 app_metadata.provider 가 이번 로그인의 제공자다. 없을 때만 identities.

-- ===========================================================================
-- ①② submit_report
-- ===========================================================================

create or replace function public.submit_report(
  p_report_id  uuid,
  p_rows       jsonb,
  p_note       text    default null,
  p_note_dirty boolean default false
)
returns jsonb
language plpgsql volatile security invoker set search_path = ''
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
                             'one_on_one_contacted','prayer_request'];
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception '보고서를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  v_deadline := ((v_report.week_key + 3)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    -- ① 반복마다 비운다. 앞 사람의 값이 다음 사람에게 흘러가면 안 된다.
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
      -- ② 새 행은 출석 두 축이 있어야 한다. 없으면 결석으로 굳는 것이 아니라 거부다.
      if not (v_fields ? 'worship_attended' and v_fields ? 'group_meeting_attended') then
        raise exception '출석 상태 없이 기록을 만들 수 없습니다.' using errcode = '22023';
      end if;

      begin
        insert into public.weekly_records (
          report_id, person_id, author_id, week_key, group_id_at_write,
          worship_attended, group_meeting_attended, one_on_one_contacted,
          prayer_request, prayer_status, prev_record_id
        ) values (
          p_report_id, v_person, v_me, v_report.week_key, v_report.group_id,
          (v_fields ->> 'worship_attended')::boolean,
          (v_fields ->> 'group_meeting_attended')::boolean,
          coalesce((v_fields ->> 'one_on_one_contacted')::boolean, false),
          v_prayer,
          (case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end)::public.prayer_status,
          v_prev
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

-- ===========================================================================
-- ③ current_user_context — person_name
-- ===========================================================================

drop function public.current_user_context();

create function public.current_user_context()
returns table (
  user_id              uuid,
  name                 text,
  person_name          text,
  role                 public.user_role,
  provider             public.auth_provider,
  person_id            uuid,
  group_id             uuid,
  group_number         integer,
  group_name           text,
  group_role           public.group_role,
  is_group_head        boolean,
  application_status   public.application_status,
  pending_person_name  text,
  pending_group_number integer
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.name, p.name, u.role, u.provider,
    p.id, p.group_id, g.number, g.name, p.group_role, p.is_group_head,
    la.status, la.person_name, la.group_number
  from public.users u
  left join public.persons p on p.user_id = u.id and p.status = 'active'
  left join public.groups  g on g.id = p.group_id
  left join lateral (
    select a.status, ap.name as person_name, ag.number as group_number
    from public.applications a
    join public.persons ap on ap.id = a.person_id
    join public.groups  ag on ag.id = a.group_id
    where a.user_id = u.id
    order by a.requested_at desc
    limit 1
  ) la on true
  where u.auth_user_id = (select auth.uid()) and u.status = 'active'
$$;

revoke execute on function public.current_user_context() from public, anon, authenticated;
grant  execute on function public.current_user_context() to authenticated;

-- ===========================================================================
-- ④ ensure_user — 현재 세션의 제공자
-- ===========================================================================

create or replace function public.ensure_user()
returns public.user_role
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_auth_id  uuid := (select auth.uid());
  v_role     public.user_role;
  v_name     text;
  v_provider text;
  v_uid      text;
begin
  if v_auth_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select u.role into v_role from public.users u where u.auth_user_id = v_auth_id;
  if found then return v_role; end if;

  -- 이번 로그인의 제공자는 JWT 에 있다. 구글·카카오 신원이 한 계정에 묶인 경우
  -- identities 의 last_sign_in_at 은 이번 로그인을 가리키지 않을 수 있다.
  v_provider := (select auth.jwt()) -> 'app_metadata' ->> 'provider';

  select i.provider_id into v_uid
  from auth.identities i
  where i.user_id = v_auth_id and (v_provider is null or i.provider = v_provider)
  order by i.last_sign_in_at desc nulls last limit 1;

  if v_provider is null then
    select i.provider into v_provider
    from auth.identities i where i.user_id = v_auth_id
    order by i.last_sign_in_at desc nulls last limit 1;
  end if;

  if v_provider is null or v_provider not in ('kakao', 'google') then
    raise exception '지원하지 않는 로그인 제공자입니다.' using errcode = '28000';
  end if;

  select coalesce(
           au.raw_user_meta_data ->> 'full_name',
           au.raw_user_meta_data ->> 'name',
           au.raw_user_meta_data ->> 'preferred_username',
           '이름 없음')
  into v_name
  from auth.users au where au.id = v_auth_id;

  insert into public.users (auth_user_id, name, role, provider, provider_uid, email)
  select v_auth_id, v_name, 'pending', v_provider::public.auth_provider, v_uid, au.email
  from auth.users au where au.id = v_auth_id;

  return 'pending';
end;
$$;
