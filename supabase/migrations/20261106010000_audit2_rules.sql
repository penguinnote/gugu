-- ===========================================================================
-- 감사 2차 데이터 규칙(2026-11-06) — 화면은 막지만 데이터베이스는 허용하던 것들
--
-- 1. 명단(persons) — 리더 · 목사님이 API 로 직접 바꿔도
--      · 기록 제외(opted_out)로 바꾸거나 거기서 되돌리기 — 운영자만(본인 요청 약속, set_person_recording)
--      · 들어온 날(joined_at) 바꾸기 — 운영자만. 미래로 밀면 출석 빈칸 · 사각지대 판정에서 빠졌다
--      · 리더 행의 상태(휴면 · 이탈) · 목장장 바꾸기 — 운영자만. 공동 리더를 잠가 버릴 수 있었다
--      · 새로 넣을 때 들어온 날은 오늘, 돌봄 상태는 활동으로 — 운영자만 다르게 넣는다
--    세션 없는 쓰기(시드 · 테스트 · 서버 키)와 운영자는 그대로 둔다.
-- 2. 휴주 — 이번 주도 마감(수 00:00 KST)이 지나면 켜고 끄지 못한다. 끄면 모두가 미제출, 켜면 쓴 쿠폰이 사라졌다
-- 3. submit_report — 휴주가 된 주는 처음 제출하지 않는다. 기록 제외가 된 사람의 지난 기록은 더 고치지 않는다
-- 4. 신청 — 임원진은 이름(목장 리더)을 골라야 한다. 잠긴 계정은 승인하지 않고, 잠글 때 걸어 둔 신청을 닫는다
-- 5. 활동 기록(events) — 앱 사용자가 직접 넣지 못한다(정시율 같은 지표를 지어낼 수 있었다). 함수 안에서만 쓴다
-- 6. 알림 기기 — 알려진 푸시 서비스 주소만, 한 사람 다섯 대까지(오래된 것부터 지운다)
-- ===========================================================================

-- 1. 명단
create function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.current_user_id() is null or public.is_admin() then
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
    raise exception '목장장은 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger persons_staff_only
  before insert or update on public.persons
  for each row execute function public.persons_staff_only();

-- 2. 휴주
create or replace function public.skipped_weeks_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_week date := coalesce(new.week_key, old.week_key);
begin
  -- 세션 사용자(운영자 화면)만 막는다. 세션 없는 쓰기(시드·테스트·서버 키)는 과거도 넣는다 — 이력 적재용.
  if public.current_user_id() is not null and v_week < public.kst_current_week() then
    raise exception '지난 주차의 휴주는 바꿀 수 없습니다 (%). 연속 제출과 제출률이 소급해서 바뀝니다.', v_week
      using errcode = '22023';
  end if;
  -- 이번 주도 마감이 지나면 그대로 둔다(2026-11-06)
  if public.current_user_id() is not null and v_week = public.kst_current_week()
     and now() >= ((v_week + 3)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul' then
    raise exception '마감이 지난 주의 휴주는 바꿀 수 없습니다 (%). 연속 제출과 쿠폰이 소급해서 바뀝니다.', v_week
      using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_user_id(), new.created_by);
    return new;
  end if;
  return old;
end;
$$;

-- 3. submit_report — 20261105020000 그대로에 두 가지 검사를 더한다
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
  -- 휴주가 된 주는 처음 제출하지 않는다(2026-11-06) — 열어 둔 사이 휴주로 바뀌어도 열매 · 제출 기록이 생기지 않게
  if v_report.submitted_at is null and exists (select 1 from public.skipped_weeks s where s.week_key = v_report.week_key) then
    raise exception '휴주입니다. 이 주는 작성 대상이 아닙니다.' using errcode = '22023';
  end if;
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
      select 1 from public.weekly_records w
      join public.persons p on p.id = w.person_id
      where w.report_id = p_report_id and w.person_id = v_person
        and p.status <> 'opted_out'   -- 기록 제외가 된 사람의 지난 기록은 더 고치지 않는다(2026-11-06)
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

-- 4. 신청
create or replace function public.request_role(p_role public.user_role, p_person_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id  uuid := public.current_user_id();
  v_group_id uuid;
  v_app_id   uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if public.current_app_role() <> 'pending' then
    raise exception '이미 승인된 계정입니다.' using errcode = '23505';
  end if;
  if p_role not in ('pastor', 'officer') then
    raise exception '목사님 · 임원진 신청만 받습니다.' using errcode = '22023';
  end if;
  if p_role = 'pastor' and p_person_id is not null then
    raise exception '목사님 신청에는 이름을 고르지 않습니다.' using errcode = '22023';
  end if;
  -- 임원진은 목장 리더만 된다(2026-11-01) — 화면만 막던 것을 여기서도(2026-11-06)
  if p_role = 'officer' and p_person_id is null then
    raise exception '임원진은 목장 리더 이름을 골라 신청합니다.' using errcode = '22023';
  end if;

  if p_person_id is not null then
    select p.group_id into v_group_id
    from public.persons p
    where p.id = p_person_id and p.status = 'active' and p.group_role = 'leader' and p.user_id is null;
    if v_group_id is null then
      raise exception '신청할 수 없는 대상입니다.' using errcode = '22023';
    end if;
  end if;

  if exists (select 1 from public.applications a where a.user_id = v_user_id and a.status = 'pending') then
    raise exception '이미 승인 대기 중인 신청이 있습니다.' using errcode = '23505';
  end if;

  insert into public.applications (user_id, person_id, group_id, requested_role)
  values (v_user_id, p_person_id, v_group_id, p_role)
  returning id into v_app_id;
  return v_app_id;
end;
$$;

create or replace function public.approve_application(p_application_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception '신청은 운영자만 확인할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_app from public.applications a
  where a.id = p_application_id for update;

  if not found or v_app.status <> 'pending' then
    raise exception '대기 중인 신청이 아닙니다.' using errcode = '22023';
  end if;
  -- 잠긴 계정은 승인하지 않는다(2026-11-06) — 나중에 잠금을 풀면 리더 권한이 말없이 생겼다
  if not exists (select 1 from public.users u where u.id = v_app.user_id and u.status = 'active') then
    raise exception '잠긴 계정입니다. 잠금을 먼저 풀어 주세요.' using errcode = '22023';
  end if;

  -- 이름을 건 신청(리더 · 리더 겸 임원진) — 빈 자리에만, 리더에게만
  if v_app.person_id is not null then
    update public.persons p
       set user_id = v_app.user_id
     where p.id = v_app.person_id and p.user_id is null and p.status = 'active' and p.group_role = 'leader';
    if not found then
      raise exception '이미 다른 계정에 연결됐거나 명단에서 리더가 아닌 사람입니다.' using errcode = '23505';
    end if;
  end if;

  v_role := case
    when v_app.requested_role = 'pastor' then 'pastor'
    when v_app.requested_role = 'officer' and v_app.person_id is null then 'officer'
    else 'leader'
  end::public.user_role;

  update public.users u
     set role = v_role,
         is_officer = u.is_officer or v_app.requested_role = 'officer'
   where u.id = v_app.user_id and u.role = 'pending';

  update public.applications a
     set status = 'approved', decided_at = now(), decided_by = public.current_user_id()
   where a.id = p_application_id;

  -- 같은 사람을 노린 다른 대기 건은 자동으로 닫힌다.
  if v_app.person_id is not null then
    update public.applications a
       set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
     where a.person_id = v_app.person_id and a.status = 'pending' and a.id <> p_application_id;
  end if;
end;
$$;

create or replace function public.admin_update_account(p_user_id uuid, p_action text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  if not public.is_admin() then
    raise exception '운영자만 계정을 고칠 수 있습니다.' using errcode = '42501';
  end if;
  select * into v_user from public.users u where u.id = p_user_id for update;
  if not found then
    raise exception '계정을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  if v_user.id = public.current_user_id() or v_user.role = 'admin' then
    raise exception '운영자 계정은 여기서 고칠 수 없습니다.' using errcode = '42501';
  end if;

  if p_action = 'pastor_off' then
    if v_user.role <> 'pastor' then raise exception '목사님 계정이 아닙니다.' using errcode = '22023'; end if;
    update public.users set role = 'pending' where id = p_user_id;
  elsif p_action = 'officer_on' then
    -- 임원진은 목장 리더만 된다(2026-11-01)
    if v_user.role <> 'leader' then raise exception '목장 리더에게만 임원진을 맡길 수 있습니다.' using errcode = '22023'; end if;
    update public.users set is_officer = true where id = p_user_id;
  elsif p_action = 'officer_off' then
    if not (v_user.is_officer or v_user.role = 'officer') then raise exception '임원진이 아닙니다.' using errcode = '22023'; end if;
    update public.users
       set is_officer = false,
           role = case when role = 'officer' then 'pending'::public.user_role else role end
     where id = p_user_id;
  elsif p_action = 'lock' then
    update public.users set status = 'inactive' where id = p_user_id;
    -- 걸어 둔 신청도 닫는다(2026-11-06) — 잠긴 계정이 승인되는 길을 막는다
    update public.applications a
       set status = 'rejected', decided_at = now(), decided_by = public.current_user_id()
     where a.user_id = p_user_id and a.status = 'pending';
  elsif p_action = 'unlock' then
    update public.users set status = 'active' where id = p_user_id;
  else
    raise exception '알 수 없는 동작: %', p_action using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.request_role(public.user_role, uuid), public.approve_application(uuid), public.admin_update_account(uuid, text)
  from public, anon, authenticated;
grant  execute on function public.request_role(public.user_role, uuid), public.approve_application(uuid), public.admin_update_account(uuid, text)
  to authenticated;

-- 5. 활동 기록
revoke insert on public.events from authenticated;

-- 6. 알림 기기
create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := public.current_user_id();
begin
  if v_me is null or not public.is_app_user() then
    raise exception '승인된 사용자만 알림을 켤 수 있습니다.' using errcode = '42501';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|push\.services\.mozilla\.com)/' then
    raise exception '구독 정보가 올바르지 않습니다.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now(), failure_count = 0;

  -- 한 사람 다섯 대까지 — 가장 오래 등록된 것부터 지운다
  delete from public.push_subscriptions s
  where s.user_id = v_me
    and s.id not in (select x.id from public.push_subscriptions x where x.user_id = v_me order by x.created_at desc limit 5);
end;
$$;
