-- Step 4 — 주간 보고서 작성 화면의 데이터 계층
--
-- 이 화면이 제품의 핵심이고, 성공 기준은 하나다 — 리더가 모임 끝나고 3분 안에
-- 제출을 끝내는가. 여기서는 그 화면이 기대는 것들을 만든다.
--
--   · reports.note          — 특이사항은 사람 단위가 아니라 목장 단위 하나
--   · skipped_weeks         — 휴주. 작성 대상이 아닌 주
--   · report_presence       — "지금 다른 리더가 보고 있다"
--   · weekly_records_visible 수정 — 같은 목장 리더는 민감 항목도 그대로 본다 (A)
--   · open_report / touch_report_presence / submit_report
--
-- submit_report 는 SECURITY INVOKER 다. 호출자 권한으로 돌아 RLS 가 그대로
-- 적용된다 — 다른 목장의 보고서는 함수 안에서도 보이지 않는다. 화면 코드가
-- 다시 막을 필요가 없고, 막아서도 안 된다.

-- ===========================================================================
-- 1. reports.note — 목장 단위 특이사항
-- ===========================================================================

alter table public.reports add column note text;

comment on column public.reports.note is
  '목장 단위 특이사항. 선택 사항이며 제출 조건이 아니다. weekly_records.note(사람 단위)는 남겨두되 화면에서 쓰지 않는다.';

-- ===========================================================================
-- 2. skipped_weeks — 휴주
-- ===========================================================================
--
-- 방학·절기 주차는 작성 대상이 아니고 제출률 분모에서도 빠진다.
-- 지정 화면(A-1b)은 Step 9 다. 테이블만 먼저 둔다.

create table public.skipped_weeks (
  week_key   date primary key,
  reason     text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint skipped_weeks_is_sunday_ck check (extract(dow from week_key) = 0)
);

comment on table public.skipped_weeks is '휴주. 작성 대상이 아니며 제출률 분모에서 제외한다.';

alter table public.skipped_weeks enable row level security;
grant select, insert, update, delete on public.skipped_weeks to authenticated;
revoke all on public.skipped_weeks from anon;

create policy skipped_weeks_select on public.skipped_weeks for select to authenticated
  using (public.is_app_user());
create policy skipped_weeks_insert on public.skipped_weeks for insert to authenticated
  with check (public.is_admin());
create policy skipped_weeks_update on public.skipped_weeks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy skipped_weeks_delete on public.skipped_weeks for delete to authenticated
  using (public.is_admin());

-- ===========================================================================
-- 3. report_presence — 지금 누가 보고 있는가
-- ===========================================================================
--
-- 화면이 열려 있는 동안 60초마다 신호를 보낸다. 최근 2분 안에 신호를 보낸
-- 다른 리더를 배너에 띄운다. events.report_opened 는 쓰지 않는다 — 그건
-- 작성 소요시간 지표용 append 로그고 용도가 다르다.
--
-- 테이블 권한은 주지 않는다. 읽고 쓰는 경로는 아래 RPC 하나뿐이다.

create table public.report_presence (
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.report_presence enable row level security;
revoke all on public.report_presence from anon, authenticated;

-- ===========================================================================
-- 4. weekly_records_visible — 같은 목장 리더는 민감 항목도 본다 (A) ★
-- ===========================================================================
--
-- 이전 정의는 민감 표시된 기록의 본문을 작성자 본인과 목사님에게만 보였다.
-- 같은 목장 리더들은 동일한 접근 권한을 갖는다는 것이 확정되면서 그 가림은
-- 버그가 됐다. 행이 보이면 본문도 보인다. 다른 목장 격리는 그대로다 —
-- 행 자체가 안 보이므로 본문도 안 보인다.
--
-- 이 뷰가 여전히 존재하는 이유는 컬럼 권한 때문이다. 원본 테이블은 본문
-- 컬럼의 select 권한을 주지 않으므로, 본문을 읽는 유일한 경로가 이 뷰다.

create or replace view public.weekly_records_visible
with (security_invoker = false) as
select
  wr.id, wr.report_id, wr.person_id, wr.author_id, wr.week_key, wr.group_id_at_write,
  wr.worship_attended, wr.group_meeting_attended, wr.one_on_one_contacted,
  wr.prayer_request, wr.prayer_status, wr.note, wr.is_sensitive,
  wr.prev_record_id, wr.created_at, wr.updated_at
from public.weekly_records wr
where public.is_pastor() or public.is_leader_of(wr.group_id_at_write);

comment on view public.weekly_records_visible is
  '주간기록 읽기 경로. 행이 보이는 사람(자기 목장 리더·목사님)에게는 본문도 그대로 보인다.';

-- ===========================================================================
-- 5. open_report — 보고서 행 확보 + 열람 기록
-- ===========================================================================
--
-- 화면을 열 때 부른다. 그 주의 보고서 행이 없으면 만든다(빈 행은 미제출이다 —
-- submitted_at 이 null). 그리고 report_opened 를 남겨 작성 소요시간 지표가
-- 살아 있게 한다.
--
-- SECURITY INVOKER — 다른 목장의 보고서는 select 에서 안 보이고, insert 는
-- reports_insert 정책이 막는다.

create or replace function public.open_report(p_group_id uuid, p_week_key date)
returns uuid
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_id uuid;
begin
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
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

-- ===========================================================================
-- 6. touch_report_presence — 신호 보내고, 같이 보고 있는 사람 받기
-- ===========================================================================
--
-- SECURITY DEFINER — 리더는 users 를 읽을 수 없으므로 이름을 돌려주려면
-- 소유자 권한이 필요하다. 대신 안에서 is_leader_of 로 직접 검사한다.

create or replace function public.touch_report_presence(p_report_id uuid)
returns table (name text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_group uuid;
  v_me    uuid := public.current_user_id();
begin
  select r.group_id into v_group from public.reports r where r.id = p_report_id;
  if v_group is null or not public.is_leader_of(v_group) then
    raise exception '이 보고서를 볼 권한이 없습니다.' using errcode = '42501';
  end if;

  insert into public.report_presence (report_id, user_id, seen_at)
  values (p_report_id, v_me, now())
  on conflict (report_id, user_id) do update set seen_at = now();

  -- 오래된 신호는 치운다.
  delete from public.report_presence p where p.seen_at < now() - interval '1 day';

  return query
    select u.name
    from public.report_presence p
    join public.users u on u.id = p.user_id
    where p.report_id = p_report_id
      and p.user_id <> v_me
      and p.seen_at > now() - interval '2 minutes'
    order by u.name;
end;
$$;

-- ===========================================================================
-- 7. submit_report — 제출 ★
-- ===========================================================================
--
-- 한 트랜잭션 안에서:
--   1) 바뀐 행마다, 바뀐 필드만 SET 에 넣어 UPDATE 한다 (B)
--      WHERE 에 불러올 때의 updated_at 을 넣어 그 사이 남이 고쳤으면 0행 → 충돌
--   2) 충돌이 있으면 충돌 없는 행은 저장한 채 충돌 목록을 돌려준다.
--      제출 확정은 하지 않는다
--   3) 충돌이 없으면 완결성을 검사한다 — 전원 출석 상태 + 출석자 전원 기도제목.
--      부족하면 예외(전체 롤백)
--   4) 통과하면 첫 제출이면 submitted_at·is_late 를 정하고, 아니면 submitted_by 만 갱신
--
-- p_rows: [{ "person_id": uuid,
--            "expected_updated_at": timestamptz | null,   -- 불러올 때 값. 새 행이면 null
--            "fields": { "worship_attended"?, "group_meeting_attended"?,
--                        "one_on_one_contacted"?, "prayer_request"?, "is_sensitive"? } }]
--
-- 작성자(author_id)는 그 행을 마지막으로 쓴 리더다. 단독 연결 지표가 이 정의를 쓴다.

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
                             'one_on_one_contacted','prayer_request','is_sensitive'];
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  -- RLS 가 적용된 select 다. 다른 목장의 보고서는 여기서 안 보인다.
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found then
    raise exception '보고서를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  -- 마감: 그 주 화요일 23:59 KST = 수요일 00:00 KST
  v_deadline := ((v_report.week_key + 3)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_person   := (v_row ->> 'person_id')::uuid;
    v_fields   := coalesce(v_row -> 'fields', '{}'::jsonb);
    v_expected := nullif(v_row ->> 'expected_updated_at', '')::timestamptz;

    -- 허용된 필드만 받는다.
    for v_key in select jsonb_object_keys(v_fields) loop
      if not (v_key = any (v_allowed)) then
        raise exception '허용되지 않은 필드: %', v_key using errcode = '22023';
      end if;
    end loop;

    -- 이 목장의 활동 인원인가. persons 도 RLS 가 적용된 select 다.
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

    -- 기도제목이 바뀌면 상태와 이전 기록 연결도 다시 정한다.
    -- 본문 컬럼은 원본에서 읽을 수 없으므로 뷰로 읽는다.
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

      -- (B) 바뀐 필드만 SET 에 넣는다.
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
        v_conflicts := v_conflicts || v_person;   -- 그 사이 남이 고쳤다
      end if;
    else
      begin
        insert into public.weekly_records (
          report_id, person_id, author_id, week_key, group_id_at_write,
          worship_attended, group_meeting_attended, one_on_one_contacted,
          prayer_request, prayer_status, prev_record_id, is_sensitive
        ) values (
          p_report_id, v_person, v_me, v_report.week_key, v_report.group_id,
          coalesce((v_fields ->> 'worship_attended')::boolean, false),
          coalesce((v_fields ->> 'group_meeting_attended')::boolean, false),
          coalesce((v_fields ->> 'one_on_one_contacted')::boolean, false),
          v_prayer,
          (case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end)::public.prayer_status,
          case when v_prayer is null then null else v_prev end,
          coalesce((v_fields ->> 'is_sensitive')::boolean, false)
        );
      exception when unique_violation then
        v_conflicts := v_conflicts || v_person;   -- 그 사이 남이 만들었다
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

  -- 완결성 — 전원 출석 상태 입력 + 출석자(목장모임 참석) 전원 기도제목
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

comment on function public.submit_report(uuid, jsonb, text, boolean) is
  '주간 보고서 제출. 바뀐 필드만 쓰고, 행 단위 updated_at 으로 충돌을 잡고, 완결성을 검사한 뒤 제출을 확정한다. SECURITY INVOKER.';

-- ===========================================================================
-- 8. 실행 권한
-- ===========================================================================

revoke execute on function
  public.open_report(uuid, date),
  public.touch_report_presence(uuid),
  public.submit_report(uuid, jsonb, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.open_report(uuid, date),
  public.touch_report_presence(uuid),
  public.submit_report(uuid, jsonb, text, boolean)
to authenticated;
