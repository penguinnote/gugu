-- 민감(is_sensitive) 개념 제거
--
-- 민감/비민감이라는 구분 자체를 두지 않기로 했다. 원칙은 한 줄이다.
--
--   모든 기도제목과 나눔은 목장 안에서만 다룬다. 목사님은 사역자이므로 전체를 보신다.
--
-- 이것은 이미 RLS 가 강제하는 그대로다 — 같은 목장 리더와 목사님만 행을 보고,
-- 다른 목장·운영자·청년에게는 행 자체가 없다. 플래그는 아무 역할이 없었다
-- (Step 4 조사 E). 실데이터가 없는 지금이 제거 비용이 가장 낮다.
--
-- 뷰는 컬럼 목록이 바뀌므로 create or replace 로 안 되고 지우고 다시 만든다.
-- 뷰가 컬럼에 의존하므로 컬럼보다 먼저 지운다. 다시 만든 뷰에는 권한을 다시 준다.

drop view public.weekly_records_visible;

alter table public.weekly_records drop column is_sensitive;

create view public.weekly_records_visible
with (security_invoker = false) as
select
  wr.id, wr.report_id, wr.person_id, wr.author_id, wr.week_key, wr.group_id_at_write,
  wr.worship_attended, wr.group_meeting_attended, wr.one_on_one_contacted,
  wr.prayer_request, wr.prayer_status, wr.note,
  wr.prev_record_id, wr.created_at, wr.updated_at
from public.weekly_records wr
where public.is_pastor() or public.is_leader_of(wr.group_id_at_write);

comment on view public.weekly_records_visible is
  '주간기록 읽기 경로. 자기 목장 리더와 목사님에게만 행이 보이고, 보이면 본문도 그대로 보인다.';

grant select on public.weekly_records_visible to authenticated;
revoke all on public.weekly_records_visible from anon;

-- submit_report — 허용 필드와 INSERT 컬럼에서 is_sensitive 를 뺀다. 나머지는 그대로다.
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
      select v.id into v_prev
      from public.weekly_records_visible v
      where v.person_id = v_person and v.week_key < v_report.week_key
        and v.prayer_request is not null
      order by v.week_key desc limit 1;
    end if;

    if v_exists then
      if v_fields = '{}'::jsonb then continue; end if;

      v_set := format('author_id = %L', v_me);
      for v_key in select jsonb_object_keys(v_fields) loop
        if v_key = 'prayer_request' then
          v_set := v_set || format(', prayer_request = %L, prayer_status = %L, prev_record_id = %L',
            v_prayer,
            case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end,
            case when v_prayer is null then null else v_prev end);
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
      begin
        insert into public.weekly_records (
          report_id, person_id, author_id, week_key, group_id_at_write,
          worship_attended, group_meeting_attended, one_on_one_contacted,
          prayer_request, prayer_status, prev_record_id
        ) values (
          p_report_id, v_person, v_me, v_report.week_key, v_report.group_id,
          coalesce((v_fields ->> 'worship_attended')::boolean, false),
          coalesce((v_fields ->> 'group_meeting_attended')::boolean, false),
          coalesce((v_fields ->> 'one_on_one_contacted')::boolean, false),
          v_prayer,
          (case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end)::public.prayer_status,
          case when v_prayer is null then null else v_prev end
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
