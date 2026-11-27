-- ===========================================================================
-- 감사 3차 · 3단계(2026-11-06 사용자 결정)
--
-- 1. 임시 저장 — submit_report(p_submit = false): 다 채우지 않아도 쓴 만큼 서버에 남긴다(공동 리더가 나눠 쓴다).
--    출석을 아직 안 고른 사람은 건너뛰고, 완결성 · 제출 · 알림은 하지 않는다
-- 2. 이번 주 목장 모임 없음 — reports.no_meeting. 리더가 보고서에서 켠다. 그 주는 4주 목장 불참 판정에서 빠진다
-- 3. 휴면 신청 — 리더가 신청(dormancy_request = pending) → 목사님(· 운영자)이 승인하면 휴면
-- 4. 목장 옮기기 — 목사님 · 운영자가 명단 고치기에서 바로(계정이 연결된 리더는 운영자 화면에서)
-- 5. 지난 주 보고서의 새 사람 — 들어온 날을 그 주로(이번 주 앞 3주까지). 그 주가 끝난 뒤 떠난 사람도 그 주 명단
-- ===========================================================================

alter table public.reports add column if not exists no_meeting boolean not null default false;
comment on column public.reports.no_meeting is '이번 주 목장 모임 없음(목장 사정 · 수련회). 그 주는 4주 목장 불참 판정에서 빠진다(2026-11-06).';

create or replace function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 들어온 날은 오늘 — 지난 주 보고서에서 넣으면 그 주(이번 주 앞 3주까지)로 앞당길 수 있다(2026-11-06). 미래는 안 된다
    new.joined_at := least(greatest(coalesce(new.joined_at, (now() at time zone 'Asia/Seoul')::date), public.kst_current_week() - 21),
                           (now() at time zone 'Asia/Seoul')::date);
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
  -- 리더를 양으로 내리기는 목사님 · 운영자만(2026-11-06) — 내린 뒤 '떠났어요' 로 리더 자리를 운영자 모르게 없앨 수 있었다
  if old.group_role = 'leader' and new.group_role = 'member' and not public.is_pastor() then
    raise exception '리더를 양으로 내리는 것은 목사님 · 운영자에게 부탁해 주세요.' using errcode = '42501';
  end if;
  -- 목장장은 정하는 것만 함수로(한 목장에 한 명). 푸는 것은 고치기 저장에 함께 실어도 된다(2026-11-06)
  if new.is_group_head and not old.is_group_head then
    raise exception '목장장은 명단 고치기의 목장장 칸으로 정합니다.' using errcode = '42501';
  end if;
  -- '떠났어요' 되돌리기는 30분 안에만(2026-11-06) — 떠났다고 해 두고 제출한 뒤 되돌려 출석 빈칸 검사를 비켜 가지 않게
  if old.status = 'left' and new.status = 'active' and (old.left_at is null or old.left_at < now() - interval '30 minutes') then
    raise exception '떠난 지 오래된 분은 운영자에게 되살려 달라고 해 주세요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop function public.submit_report(uuid, jsonb, text, boolean, text, boolean);

create function public.submit_report(
  p_report_id  uuid,
  p_rows       jsonb,
  p_note       text    default null,
  p_note_dirty boolean default false,
  p_note_base  text    default null,
  p_note_check boolean default false,
  p_submit     boolean default true,
  p_no_meeting boolean default null
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
  if p_submit and v_report.submitted_at is null and exists (select 1 from public.skipped_weeks s where s.week_key = v_report.week_key) then
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
      where p.id = v_person and p.group_id = v_report.group_id
        and p.joined_at <= v_report.week_key + 6
        and (p.status = 'active'
             -- 그 주가 끝난 뒤에 떠난 사람도 그 주 명단이다(2026-11-06)
             or (p.status = 'left' and p.left_at >= ((v_report.week_key + 7)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul'))
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
        -- 임시 저장(2026-11-06)이면 출석을 아직 안 고른 사람은 건너뛴다 — 제출할 때는 그대로 막는다
        if not p_submit then continue; end if;
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

  -- 특이사항은 연 뒤에 다른 리더가 바꿨으면 덮어쓰지 않는다(2026-11-06) — 나중에 낸 쪽이 앞의 것을 말없이 지웠다.
  -- p_note_check 는 새 화면만 보낸다(옛 화면은 예전처럼 쓴다)
  if p_note_dirty and p_note_check and v_report.note is distinct from p_note_base then
    return jsonb_build_object(
      'submitted', false,
      'conflicts', to_jsonb(v_conflicts),
      'note_conflict', true,
      'note', v_report.note,
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
  end if;
  if p_note_dirty then
    update public.reports set note = p_note where id = p_report_id;
  end if;
  -- 이번 주 목장 모임 없음(2026-11-06) — 그 주는 4주 목장 불참 판정에서 빠진다
  if p_no_meeting is not null then
    update public.reports set no_meeting = p_no_meeting where id = p_report_id and no_meeting is distinct from p_no_meeting;
  end if;

  -- 임시 저장 — 쓴 만큼만 남기고 제출은 하지 않는다(공동 리더가 나눠 쓴다)
  if not p_submit then
    return jsonb_build_object(
      'submitted', false,
      'saved', array_length(v_conflicts, 1) is null,
      'conflicts', to_jsonb(v_conflicts),
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
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
    and p.group_id = v_report.group_id
    and (p.status = 'active'
         or (p.status = 'left' and p.left_at >= ((v_report.week_key + 7)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul'))
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

revoke execute on function public.submit_report(uuid, jsonb, text, boolean, text, boolean, boolean, boolean) from public, anon, authenticated;
grant  execute on function public.submit_report(uuid, jsonb, text, boolean, text, boolean, boolean, boolean) to authenticated;

-- 3. 휴면 신청 · 승인
create function public.request_dormancy(p_person_id uuid, p_on boolean default true)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
begin
  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found or v_person.group_id is null then raise exception '명단에 없는 사람입니다.' using errcode = '22023'; end if;
  if not (public.is_admin() or public.is_pastor() or public.is_leader_of(v_person.group_id)) then
    raise exception '이 목장 사람의 휴면을 신청할 수 없습니다.' using errcode = '42501';
  end if;
  if p_on and (v_person.status <> 'active' or v_person.group_role <> 'member') then
    raise exception '활동 중인 양만 휴면을 신청합니다.' using errcode = '22023';
  end if;
  update public.persons
     set dormancy_request = case when p_on then 'pending'::public.dormancy_request_status else 'none'::public.dormancy_request_status end
   where id = p_person_id;
end;
$$;

create function public.decide_dormancy(p_person_id uuid, p_approve boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not (public.is_pastor() or public.is_admin()) then
    raise exception '휴면 신청은 목사님이 확인합니다.' using errcode = '42501';
  end if;
  perform set_config('gg.staff_rpc', '1', true);
  update public.persons
     set dormancy_request = case when p_approve then 'approved'::public.dormancy_request_status else 'none'::public.dormancy_request_status end,
         status = case when p_approve then 'dormant'::public.person_status else status end
   where id = p_person_id and dormancy_request = 'pending';
  if not found then
    perform set_config('gg.staff_rpc', '', true);
    raise exception '대기 중인 휴면 신청이 아닙니다.' using errcode = '22023';
  end if;
  perform set_config('gg.staff_rpc', '', true);
end;
$$;

comment on function public.request_dormancy(uuid, boolean) is '휴면 신청 · 취소 — 그 목장 리더 · 목사님 · 운영자, 활동 중인 양만(2026-11-06).';
comment on function public.decide_dormancy(uuid, boolean) is '휴면 신청 승인 · 거절 — 목사님 · 운영자(2026-11-06).';

-- 4. 목장 옮기기
create function public.move_person_group(p_person_id uuid, p_group_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
begin
  if not (public.is_pastor() or public.is_admin()) then
    raise exception '목장 옮기기는 목사님 · 운영자가 합니다.' using errcode = '42501';
  end if;
  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found then raise exception '명단에 없는 사람입니다.' using errcode = '22023'; end if;
  if v_person.user_id is not null then
    raise exception '앱 계정이 연결된 리더는 운영자 화면에서 옮겨 주세요.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.status = 'active') then
    raise exception '없는 목장입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.persons p where p.group_id = p_group_id and p.name = v_person.name and p.status <> 'left' and p.id <> p_person_id) then
    raise exception '옮길 목장에 같은 이름이 이미 있습니다.' using errcode = '23505';
  end if;
  perform set_config('gg.staff_rpc', '1', true);
  update public.persons set group_id = p_group_id, is_group_head = false where id = p_person_id;
  perform set_config('gg.staff_rpc', '', true);
end;
$$;

comment on function public.move_person_group(uuid, uuid) is '다른 목장으로 옮기기 — 목사님 · 운영자. 계정이 연결된 리더는 운영자 화면에서(2026-11-06).';

revoke execute on function public.request_dormancy(uuid, boolean), public.decide_dormancy(uuid, boolean), public.move_person_group(uuid, uuid)
  from public, anon, authenticated;
grant  execute on function public.request_dormancy(uuid, boolean), public.decide_dormancy(uuid, boolean), public.move_person_group(uuid, uuid)
  to authenticated;

-- 2. 돌봄 사각지대 — 목장 모임이 없던 주는 목장 불참으로 세지 않는다
create or replace function public.care_blind_spots(p_week_key date, p_now timestamptz default now())
returns table (
  person_id         uuid,
  group_id          uuid,
  group_role        public.group_role,
  care_status       public.care_status,
  needs_check       boolean,
  state             text,
  contact_gap       boolean,
  meeting_gap       boolean,
  contact_leaders   integer,
  weeks_recorded    integer,
  last_contact_week date,
  last_meeting_week date,
  window_start      date,
  window_end        date,
  absent_streak     boolean,   -- judged 일 때만 값이 있다
  last_worship_week date
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_weeks      date[];
  v_start      date;
  v_data_start date;
  v_collecting boolean;
begin
  v_weeks := public.care_window(p_week_key, p_now);
  v_start := v_weeks[array_length(v_weeks, 1)];

  select min(wr.week_key) into v_data_start from public.weekly_records wr;
  v_collecting := v_data_start is null or v_start < v_data_start;

  return query
  with scope as (
    select p.id, p.group_id, p.group_role, p.care_status, p.needs_check, p.joined_at, g.number
    from public.persons p
    join public.groups g on g.id = p.group_id
    where p.status = 'active'
      and p.care_status in ('active', 'long_absent')
      and g.status = 'active'
      and (public.is_pastor() or public.is_leader_of(p.group_id))
  ),
  -- 그 목장이 보고서를 낸 주(2026-11-06) — 안 낸 주를 '불참' 으로 세면 늦게 시작한 목장이 전원 사각지대가 됐다
  subs as (
    select r.group_id, count(*)::integer as n,
           count(*) filter (where not r.no_meeting)::integer as nm   -- 목장 모임이 있었던 주(2026-11-06)
    from public.reports r
    where r.week_key = any (v_weeks) and r.submitted_at is not null
    group by r.group_id
  ),
  win as (
    select wr.person_id,
           count(distinct wr.week_key)::integer                                     as weeks_recorded,
           count(*) filter (where wr.one_on_one_contacted)::integer                 as contacts,
           count(*) filter (where wr.group_meeting_attended)::integer               as meetings,
           count(distinct wr.author_id) filter (where wr.one_on_one_contacted)::integer as leaders,
           count(distinct wr.week_key) filter (
             where not wr.worship_attended and wr.week_key in (v_weeks[1], v_weeks[2])
           )::integer                                                               as recent_absent
    from public.weekly_records wr
    where wr.week_key = any (v_weeks)
      and wr.person_id in (select id from scope)
    group by wr.person_id
  ),
  latest as (
    select wr.person_id,
           max(wr.week_key) filter (where wr.one_on_one_contacted)   as last_contact,
           max(wr.week_key) filter (where wr.group_meeting_attended) as last_meeting,
           max(wr.week_key) filter (where wr.worship_attended)       as last_worship
    from public.weekly_records wr
    where wr.week_key <= v_weeks[1]
      and wr.person_id in (select id from scope)
    group by wr.person_id
  ),
  judged as (
    select s.*,
           case when v_collecting then 'collecting'
                when s.joined_at > v_start then 'new'
                else 'judged' end as st
    from scope s
  )
  select j.id, j.group_id, j.group_role, j.care_status, j.needs_check, j.st,
         case when j.st = 'judged' then coalesce(sb.n, 0) >= 2 and coalesce(w.contacts, 0) = 0 end,
         case when j.st = 'judged' then coalesce(sb.nm, 0) >= 2 and coalesce(w.meetings, 0) = 0 end,
         coalesce(w.leaders, 0),
         coalesce(w.weeks_recorded, 0),
         l.last_contact,
         l.last_meeting,
         v_start,
         v_weeks[1],
         case when j.st = 'judged' then coalesce(w.recent_absent, 0) = 2 end,
         l.last_worship
  from judged j
  left join win w on w.person_id = j.id
  left join latest l on l.person_id = j.id
  left join subs sb on sb.group_id = j.group_id
  order by j.number, j.group_role, j.id;
end;
$$;

revoke execute on function public.care_blind_spots(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.care_blind_spots(date, timestamptz) to authenticated;
