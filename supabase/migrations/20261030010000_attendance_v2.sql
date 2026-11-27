-- ===========================================================================
-- 출석 분류 v2 (2026-10-30) — 현장 예배 · 온라인 예배 · 목장 모임 불참 · 결석, 사유 세 칸
--
-- 화면 네 칩과 DB 의 대응. 예배출석 · 목장참석 두 축은 그대로 두고 온라인 여부 한 칸을 더한다.
--   현장 예배              예배 O · 온라인 X · 목장 O
--   현장 예배 + 목장 불참  예배 O · 온라인 X · 목장 X   (예전 '예배만')
--   온라인 예배            예배 O · 온라인 O · 목장 X   (목장 불참이 자동으로 함께 — 제약으로 묶는다)
--   결석                   예배 X · 목장 X
-- 예전 기록(출석 · 예배만 · 결석)은 온라인 X 로 그대로 위 표에 들어간다 — 옮길 데이터가 없다.
--
-- 사유 — 온라인 예배 · 목장 모임 불참 · 결석을 고르면 각각 한 칸. 목사님께 드리는 것이라 읽기 범위는
-- 기도제목과 같다(같은 목장 리더 · 목사님 — weekly_records_visible).
--
-- 옛 화면(지금 프로덕션)은 새 칸을 보내지 않는다 — 기본값(온라인 X, 사유 없음)으로 지금처럼 저장된다.
-- ===========================================================================

alter table public.weekly_records
  add column worship_online        boolean not null default false,
  add column online_reason         text,
  add column meeting_absent_reason text,
  add column absent_reason         text,
  add constraint weekly_records_online_ck
    check (not worship_online or (worship_attended and not group_meeting_attended));

comment on column public.weekly_records.worship_online is
  '온라인 예배. 예배출석 O · 목장참석 X 와 함께만 참이다(온라인 예배는 목장 모임 불참을 겸한다).';
comment on column public.weekly_records.online_reason is '온라인 예배 사유.';
comment on column public.weekly_records.meeting_absent_reason is '목장 모임 불참 사유.';
comment on column public.weekly_records.absent_reason is '결석 사유.';

-- 뷰 — 새 칸은 끝에 붙인다(create or replace 로 된다. 권한도 그대로)
create or replace view public.weekly_records_visible
with (security_invoker = false) as
select
  wr.id, wr.report_id, wr.person_id, wr.author_id, wr.week_key, wr.group_id_at_write,
  wr.worship_attended, wr.group_meeting_attended, wr.one_on_one_contacted,
  wr.prayer_request, wr.prayer_status, wr.note,
  wr.prev_record_id, wr.created_at, wr.updated_at,
  wr.worship_online, wr.online_reason, wr.meeting_absent_reason, wr.absent_reason
from public.weekly_records wr
where public.is_pastor() or public.is_leader_of(wr.group_id_at_write);

-- submit_report — 허용 필드와 INSERT 컬럼에 네 칸을 더한다. 나머지는 20260927190000 그대로다.
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
                             'one_on_one_contacted','prayer_request',
                             'worship_online','online_reason','meeting_absent_reason','absent_reason'];
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

-- ===========================================================================
-- 돌봄 사각지대 기준 v2 (2026-10-30)
--
--   결석 연속  창의 최근 두 주(휴주 제외) 모두 결석(예배 X) 기록. 1대1 접촉이 있었어도 사각지대다
--   목장 공백  창 4주 동안 목장 모임 참석 0회 — 온라인 예배도 불참으로 센다. 접촉 · 예배와 무관하다
--   사각지대 = 결석 연속 ∪ 목장 공백. 접촉 공백(contact_gap)은 값만 남긴다 — 이제 사각지대 기준이 아니다.
-- 반환에 absent_streak · last_worship_week 가 붙어 함수를 지우고 다시 만든다.
-- ===========================================================================

drop function public.care_blind_spots(date, timestamptz);

create function public.care_blind_spots(p_week_key date, p_now timestamptz default now())
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
         case when j.st = 'judged' then coalesce(w.contacts, 0) = 0 end,
         case when j.st = 'judged' then coalesce(w.meetings, 0) = 0 end,
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
  order by j.number, j.group_role, j.id;
end;
$$;

comment on function public.care_blind_spots(date, timestamptz) is
  '돌봄 사각지대 판정(v2) — 최근 두 주 연속 결석 또는 4주 목장 모임 불참(온라인 포함). 마감이 지난 최근 4주(휴주 제외), 그 사람의 전체 기록으로 계산하고 판정 값만 돌려준다. 목사님 전체 · 리더 자기 목장.';

revoke execute on function public.care_blind_spots(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.care_blind_spots(date, timestamptz) to authenticated;
