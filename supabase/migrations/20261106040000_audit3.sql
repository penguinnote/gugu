-- ===========================================================================
-- 감사 3차(2026-11-06)
--
-- 1. 명단(persons_staff_only)
--    · 목장장은 정하는 것만 set_group_head 로 — 푸는 것은 고치기 저장에 함께(저장이 실패하면 함께 되돌아간다)
--    · 리더를 양으로 내리기는 목사님 · 운영자만 — 내린 뒤 '떠났어요' 로 리더 자리를 없앨 수 있었다
--    · '떠났어요' 되돌리기는 30분 안에만(left_at 새 칸) — 떠났다고 해 두고 제출한 뒤 되돌려 출석 검사를 비켜 갔다
-- 2. 휴주 — 고치기(update)로 주차를 바꿔 마감 막기를 비켜 가던 길을 막는다. 사유만 고친다
-- 3. 특이사항 — 연 뒤에 다른 리더가 바꿨으면 덮어쓰지 않고 알린다(submit_report 새 인자 p_note_base · p_note_check)
-- 4. 기록에 남은 사람 이름에 상태를 붙인다 — 기록 제외된 분은 리더 보고서 화면에서 뺀다(고치면 전체 저장이 실패했다)
-- 5. 돌봄 사각지대 — 목장이 보고서를 낸 주가 둘 이상일 때만 '4주 목장 불참' · 접촉 공백을 판정한다
-- ===========================================================================

-- 1. 명단
alter table public.persons add column if not exists left_at timestamptz;
update public.persons set left_at = updated_at where status = 'left' and left_at is null;
comment on column public.persons.left_at is '목장을 떠난 때(상태가 left 가 된 시각). 되돌리면 비운다(2026-11-06).';

create or replace function public.persons_left_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'left' and old.status is distinct from 'left' then new.left_at := now();
  elsif new.status <> 'left' then new.left_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists persons_left_at on public.persons;
create trigger persons_left_at
  before update of status on public.persons
  for each row execute function public.persons_left_at();

create or replace function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
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
  if tg_op = 'UPDATE' then
    -- 고치기는 사유만(2026-11-06) — 주차를 바꾸면 위의 막기를 비켜 지난 · 이번 주 휴주가 바뀌었다
    if public.current_user_id() is not null and new.week_key is distinct from old.week_key then
      raise exception '휴주의 주차는 바꿀 수 없습니다. 지우고 새로 넣어 주세요.' using errcode = '22023';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_user_id(), new.created_by);
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists skipped_weeks_guard on public.skipped_weeks;
create trigger skipped_weeks_guard
  before insert or update or delete on public.skipped_weeks
  for each row execute function public.skipped_weeks_guard();

-- 3. 특이사항 — 인자가 늘어 함수를 바꾼다
drop function public.submit_report(uuid, jsonb, text, boolean);

create function public.submit_report(
  p_report_id  uuid,
  p_rows       jsonb,
  p_note       text    default null,
  p_note_dirty boolean default false,
  p_note_base  text    default null,
  p_note_check boolean default false
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

revoke execute on function public.submit_report(uuid, jsonb, text, boolean, text, boolean) from public, anon, authenticated;
grant  execute on function public.submit_report(uuid, jsonb, text, boolean, text, boolean) to authenticated;

-- 4. 기록에 남은 사람 — 상태를 붙인다
drop function public.recorded_person_names(uuid[]);

create function public.recorded_person_names(p_ids uuid[])
returns table (id uuid, name text, group_role public.group_role, status public.person_status)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.group_role, p.status
  from public.persons p
  where p.id = any (p_ids)
    and exists (
      select 1 from public.weekly_records w
      where w.person_id = p.id and (public.is_pastor() or public.is_leader_of(w.group_id_at_write))
    );
$$;

comment on function public.recorded_person_names(uuid[]) is
  '기록에 남은 사람의 이름 · 구분 · 상태 — 그 기록을 읽을 수 있는 사람(목사님 · 기록한 목장 리더)에게만(2026-11-06).';

revoke execute on function public.recorded_person_names(uuid[]) from public, anon, authenticated;
grant  execute on function public.recorded_person_names(uuid[]) to authenticated;

-- 5. 돌봄 사각지대
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
    select r.group_id, count(*)::integer as n
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
         case when j.st = 'judged' then coalesce(sb.n, 0) >= 2 and coalesce(w.meetings, 0) = 0 end,
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
