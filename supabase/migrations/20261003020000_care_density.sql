-- ===========================================================================
-- Step 6 — 관계 밀도 (2026-10-03, 03-metrics §3.3)
--
-- 목장 안에서 실제로 이어진 (사람 × 리더) 1대1 연결의 비율. 사각지대가 "누가 비었나" 라면 이건
-- "목장의 연결망이 얼마나 촘촘한가" 다. 낮다고 나쁜 게 아니다 — 목장이 클수록 자연히 낮다.
-- **같은 목장의 추이**로 읽는다. 그래서 순위는 없고, 리더는 자기 목장만 본다.
--
--   창         사각지대와 같은 규칙. 한 곳(care_window)에 둔다 — 두 지표의 4주가 어긋나면 안 된다
--   분자       이 목장에서 쓰인 기록(group_id_at_write = G) 중 1대1 접촉의 서로 다른 (사람, 작성 리더) 쌍.
--              사람은 **지금** 이 목장의 판정 대상, 작성자는 **지금** 이 목장의 리더일 때만 센다 —
--              분모와 같은 구성원으로 세야 비율이 1 을 넘지 않고, 떠난 사람이 남은 사람의 연결로 잡히지 않는다
--   분모       판정 대상 × 리더 − (리더이면서 판정 대상인 사람). 리더도 판정 대상이고(04 §4.4),
--              자기 자신과는 연결이 없다(트리거)
--   판정 대상  사각지대와 같다: status = active ∧ care_status ∈ {active, long_absent}
--   리더       명단 기준 활동 중 리더. 앱 계정이 없어도 센다 — 아직 기록하지 않는 리더의 몫도 빈 연결이다
--   보류       창이 데이터 시작보다 앞서면 collecting(density null). 분모가 0 이어도 null
--   반환       숫자뿐. 어느 쌍이 이어졌는지는 돌려주지 않는다
-- ===========================================================================

-- 판정 창 — 마감이 지난 최근 4주, 휴주는 빼고 더 거슬러 간다. 내림차순(첫 원소가 창 끝).
-- 직접 부르지 않는다 — 집계 함수(SECURITY DEFINER)가 쓴다.
create function public.care_window(p_week_key date, p_now timestamptz default now())
returns date[]
language plpgsql stable set search_path = ''
as $$
declare
  v_week  date;
  v_weeks date[] := '{}';
  v_steps integer := 0;
begin
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;

  -- 마감(화요일 23:59 KST = 수요일 00:00 KST) 전인 주는 창에 넣지 않는다.
  v_week := case
    when p_now < ((p_week_key + 3)::text || ' 00:00:00+09')::timestamptz then p_week_key - 7
    else p_week_key
  end;

  while coalesce(array_length(v_weeks, 1), 0) < 4 and v_steps < 520 loop
    v_steps := v_steps + 1;
    if not exists (select 1 from public.skipped_weeks s where s.week_key = v_week) then
      v_weeks := v_weeks || v_week;
    end if;
    v_week := v_week - 7;
  end loop;
  return v_weeks;
end;
$$;

comment on function public.care_window(date, timestamptz) is
  '돌봄 지표의 판정 창 — 마감이 지난 최근 4주(휴주 제외), 내림차순. care_blind_spots · care_density 가 같이 쓴다.';

revoke execute on function public.care_window(date, timestamptz) from public, anon, authenticated;

-- 사각지대도 같은 창을 쓰도록 바꾼다. 규칙은 그대로다(tests/rls/blind-spots.test.mjs).
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
  window_end        date
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
           count(distinct wr.author_id) filter (where wr.one_on_one_contacted)::integer as leaders
    from public.weekly_records wr
    where wr.week_key = any (v_weeks)
      and wr.person_id in (select id from scope)
    group by wr.person_id
  ),
  latest as (
    select wr.person_id,
           max(wr.week_key) filter (where wr.one_on_one_contacted)   as last_contact,
           max(wr.week_key) filter (where wr.group_meeting_attended) as last_meeting
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
         v_weeks[1]
  from judged j
  left join win w on w.person_id = j.id
  left join latest l on l.person_id = j.id
  order by j.number, j.group_role, j.id;
end;
$$;

create function public.care_density(p_week_key date, p_now timestamptz default now())
returns table (
  group_id        uuid,
  state           text,      -- judged · collecting
  targets         integer,   -- 판정 대상 수
  leaders         integer,   -- 리더 수 (명단 기준)
  possible_pairs  integer,   -- 대상 × 리더 − 리더이면서 대상
  connected_pairs integer,   -- 창 안에서 1대1 이 기록된 서로 다른 (사람, 리더) 쌍
  density         numeric,   -- connected / possible. collecting 이거나 분모 0 이면 null
  window_start    date,
  window_end      date
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
  with grp as (
    select g.id, g.number from public.groups g
    where g.status = 'active'
      and (public.is_pastor() or public.is_leader_of(g.id))
  ),
  targets as (
    select p.id, p.group_id, p.group_role = 'leader' as is_leader
    from public.persons p
    where p.group_id in (select id from grp)
      and p.status = 'active'
      and p.care_status in ('active', 'long_absent')
  ),
  leaders as (
    select p.group_id, p.user_id
    from public.persons p
    where p.group_id in (select id from grp)
      and p.status = 'active'
      and p.group_role = 'leader'
  ),
  pairs as (
    select distinct t.group_id, wr.person_id, wr.author_id
    from public.weekly_records wr
    join targets t on t.id = wr.person_id and t.group_id = wr.group_id_at_write
    join leaders l on l.group_id = wr.group_id_at_write and l.user_id = wr.author_id
    where wr.week_key = any (v_weeks)
      and wr.one_on_one_contacted
  ),
  counts as (
    select g.id, g.number,
           (select count(*) from targets t where t.group_id = g.id)::integer                   as n_targets,
           (select count(*) from leaders l where l.group_id = g.id)::integer                   as n_leaders,
           (select count(*) from targets t where t.group_id = g.id and t.is_leader)::integer   as n_self,
           (select count(*) from pairs pr where pr.group_id = g.id)::integer                   as n_pairs
    from grp g
  )
  select c.id,
         case when v_collecting then 'collecting' else 'judged' end,
         c.n_targets,
         c.n_leaders,
         c.n_targets * c.n_leaders - c.n_self,
         c.n_pairs,
         case when v_collecting or c.n_targets * c.n_leaders - c.n_self <= 0 then null
              else round(c.n_pairs::numeric / (c.n_targets * c.n_leaders - c.n_self), 4) end,
         v_start,
         v_weeks[1]
  from counts c
  order by c.number;
end;
$$;

comment on function public.care_density(date, timestamptz) is
  '목장별 관계 밀도 — 마감이 지난 최근 4주, 이 목장에서 쓰인 1대1 의 (사람, 리더) 쌍 ÷ 가능한 쌍. 숫자만 돌려준다. 목사님 전체 · 리더 자기 목장. 같은 목장의 추이로 읽는다.';

revoke execute on function public.care_density(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.care_density(date, timestamptz) to authenticated;
