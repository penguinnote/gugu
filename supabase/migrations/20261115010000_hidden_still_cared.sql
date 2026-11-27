-- ===========================================================================
-- 보고서에서 숨긴 사람도 돌봄 사각지대에 남는다(2026-11-15 사용자 — "숨겼더니 사각지대에서 빠졌다").
--
--   까닭 둘
--   ① 20261114020000 이 care_blind_spots 의 대상에서 숨긴 사람을 뺐다(not p.report_hidden) — 의도였지만 틀렸다.
--      숨기기는 보고서 화면을 편하게 하려는 것이지 돌봄에서 빼는 것이 아니다(교환학생 · 본가에 오래 가 있는 사람일수록 챙겨야 한다).
--   ② ①만 되돌리면 또 빠진다 — 숨긴 사람은 그 뒤 주간기록이 생기지 않는데, '2주 연속 결석' 은 "결석으로 적힌 기록" 을 세므로
--      기록이 없는 주는 결석으로 세지 않았다. 숨긴 사람에 한해, 목장이 보고서를 낸 최근 두 주에 기록이 없으면 결석으로 센다.
--      ('4주 목장 불참' 은 참석 기록 0 을 보므로 기록이 없어도 그대로 잡힌다.)
--
--   처음 제출 때의 출석 빈칸 검사(submit_report)는 그대로 — 숨긴 사람은 빈칸으로 치지 않는다.
--   본문은 20261114020000 의 care_blind_spots 그대로에 위 두 가지.
-- ===========================================================================

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
    select p.id, p.group_id, p.group_role, p.care_status, p.needs_check, p.joined_at, g.number, p.report_hidden
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
  -- 보고서에서 숨긴 사람(2026-11-15) — 숨긴 동안은 기록이 없다. 목장이 보고서를 낸 최근 두 주에 그 사람 기록이 없으면 결석으로 센다
  --   (숨기지 않은 사람은 처음 제출 때 출석이 빠질 수 없으므로 이 셈이 필요 없다)
  miss as (
    select s.id as person_id, count(*)::integer as recent_missing
    from scope s
    join public.reports r on r.group_id = s.group_id and r.submitted_at is not null
                         and r.week_key in (v_weeks[1], v_weeks[2])
    where s.report_hidden
      and not exists (select 1 from public.weekly_records wr where wr.person_id = s.id and wr.week_key = r.week_key)
    group by s.id
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
         case when j.st = 'judged' then coalesce(w.recent_absent, 0) + coalesce(m.recent_missing, 0) = 2 end,
         l.last_worship
  from judged j
  left join win w on w.person_id = j.id
  left join latest l on l.person_id = j.id
  left join miss m on m.person_id = j.id
  left join subs sb on sb.group_id = j.group_id
  order by j.number, j.group_role, j.id;
end;
$$;
