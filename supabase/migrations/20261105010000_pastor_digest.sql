-- ===========================================================================
-- 목사님 주간 정리 v1 (2026-11-05) — AI 없이 코드만
--
-- 1. 목사님 알림 — 알림 대상 함수가 리더 · 운영자만 골라, 목사님은 알림을 켜도 아무것도 받지 않았다.
--    수요일 아침(마감 직후) '지난주 보고서 정리' 를 목사님께 보낸다(/api/cron/digest).
-- 2. 기도제목 연속 n주 — 그 주에 기도제목을 낸 사람마다, 휴주를 건너뛰고 몇 주 연속 기도제목을 냈는지.
--    '같은 제목이 이어진다' 가 아니다 — 같은 내용인지는 보지 않는다(prayer_status 의 ongoing 도 '전에 낸 적이 있다' 일 뿐).
--    목사님 화면의 '기도제목' 칸이 4주 이상을 모아 보여 준다.
-- ===========================================================================

-- 1. 알림 받는 목사님 — 활동 중인 목사님 계정 전원
create function public.push_digest_targets()
returns table (user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select u.id from public.users u
  where u.role = 'pastor' and u.status = 'active'
  order by u.id;
$$;

comment on function public.push_digest_targets() is
  '수요일 주간 정리 알림을 받을 목사님 계정. 서버(service_role) 전용(2026-11-05).';

revoke execute on function public.push_digest_targets() from public, anon, authenticated;
grant  execute on function public.push_digest_targets() to service_role;

-- 2. 기도제목 연속 n주
create function public.prayer_streaks(p_week_key date)
returns table (
  person_id      uuid,
  group_id       uuid,
  weeks          integer,   -- 이 주까지 연속으로 기도제목을 낸 주 수(휴주는 건너뛴다). 1 이면 이번 주만
  first_ever     boolean,   -- 이 사람이 처음 낸 기도제목(prayer_status = new)
  prayer_request text
)
language sql stable security definer set search_path = ''
as $$
  with wk as (
    -- 이 주부터 거슬러 올라가는 모임 주(휴주 제외), 가까운 주가 1
    select w::date as week_key, row_number() over (order by w desc) as rn
    from generate_series(p_week_key - 7 * 103, p_week_key, interval '7 days') as w
    where not exists (select 1 from public.skipped_weeks s where s.week_key = w::date)
  ),
  pr as (
    select wr.person_id, wk.rn
    from public.weekly_records wr
    join wk on wk.week_key = wr.week_key
    where wr.prayer_request is not null
  ),
  run as (
    -- 1, 2, 3 … 으로 빈틈없이 이어지는 동안만 센다
    select pr.person_id, count(*)::integer as weeks
    from (select person_id, rn, row_number() over (partition by person_id order by rn) as k from pr) pr
    where pr.rn = pr.k
    group by pr.person_id
  )
  select wr.person_id, wr.group_id_at_write, run.weeks, wr.prayer_status = 'new', wr.prayer_request
  from public.weekly_records wr
  join run on run.person_id = wr.person_id
  join public.persons p on p.id = wr.person_id
  where wr.week_key = p_week_key
    and wr.prayer_request is not null
    and p.status <> 'opted_out'
    and (public.is_pastor() or public.is_leader_of(wr.group_id_at_write))
  order by run.weeks desc, wr.group_id_at_write, wr.person_id;
$$;

comment on function public.prayer_streaks(date) is
  '그 주에 기도제목을 낸 사람마다 연속 주 수(휴주 제외, 같은 내용인지는 보지 않는다). 목사님 전체 · 리더 자기 목장(2026-11-05).';

revoke execute on function public.prayer_streaks(date) from public, anon, authenticated;
grant  execute on function public.prayer_streaks(date) to authenticated;
