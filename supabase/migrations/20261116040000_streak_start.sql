-- 연속 제출을 세기 시작하는 주(2026-11-16) — 출시 전에 낸 보고서는 남기되 연속 · 연속 보너스는 모든 목장이 같은 줄에서 시작하게.
--   app_meta 'streak_start'(일요일 날짜)가 있으면 그 주보다 앞의 보고서는 연속에 넣지 않는다. 없으면 예전과 같다(처음부터 센다).
--   세 군데가 같은 기준을 본다: 홈의 연속(group_streaks) · 기록 탭 순위(_group_streak) · 열매 보너스(_world_streak).
--   값은 운영에서 따로 넣는다(이 파일은 규칙만).
create function public._streak_start()
returns date language sql stable security definer set search_path = '' as $$
  select coalesce((select m.value::date from public.app_meta m where m.key = 'streak_start'), date '2000-01-02');
$$;
revoke execute on function public._streak_start() from public, anon, authenticated;
comment on function public._streak_start() is '연속 제출을 세기 시작하는 주(app_meta streak_start). 없으면 아주 옛날 — 처음부터 센다(2026-11-16).';

create or replace function public.group_streaks(p_week_key date, p_now timestamptz default now())
returns table (
  group_id         uuid,
  streak           integer,
  current_included boolean,
  ever_on_time     boolean,
  broken           boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g          record;
  v_week     date;
  v_deadline timestamptz;
  v_streak   integer;
  v_current  boolean;
  v_ever     boolean;
  v_on_time  boolean;
  v_oldest   date;
  v_steps    integer;
  v_start    date := public._streak_start();
begin
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;

  for g in
    select gr.id from public.groups gr
    where gr.status = 'active'
      and (public.is_pastor() or public.is_leader_of(gr.id))
    order by gr.number
  loop
    v_streak  := 0;
    v_current := false;
    v_week    := p_week_key;
    v_steps   := 0;

    select exists (
      select 1 from public.reports r
      where r.group_id = g.id and r.submitted_at is not null and not r.is_late
        and r.week_key <= p_week_key
        and r.week_key >= v_start
        and not exists (select 1 from public.skipped_weeks s where s.week_key = r.week_key)
    ) into v_ever;

    select min(r.week_key) into v_oldest from public.reports r where r.group_id = g.id;
    if v_oldest is not null then v_oldest := greatest(v_oldest, v_start); end if; -- 연속을 세기 시작한 주보다 앞은 보지 않는다

    while v_oldest is not null and v_week >= v_oldest and v_steps < 520 loop
      v_steps := v_steps + 1;

      -- 휴주 · 쿠폰으로 지킨 주: 건너뛰고 유지
      if exists (select 1 from public.skipped_weeks s where s.week_key = v_week)
         or exists (select 1 from public.world_streak_freezes f where f.group_id = g.id and f.week_key = v_week) then
        v_week := v_week - 7;
        continue;
      end if;

      select (r.submitted_at is not null and not r.is_late) into v_on_time
      from public.reports r where r.group_id = g.id and r.week_key = v_week;

      if coalesce(v_on_time, false) then
        v_streak := v_streak + 1;
        if v_week = p_week_key then v_current := true; end if;
        v_week := v_week - 7;
        continue;
      end if;

      v_deadline := public._world_deadline(v_week);
      if p_now < v_deadline then
        v_week := v_week - 7;
        continue;
      end if;

      exit;
    end loop;

    group_id         := g.id;
    streak           := v_streak;
    current_included := v_current;
    ever_on_time     := coalesce(v_ever, false);
    broken           := coalesce(v_ever, false) and v_streak = 0;
    return next;
  end loop;
end;
$$;

create or replace function public._world_streak(p_group uuid, p_week date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_week   date := p_week;
  v_n      integer := 0;
  v_steps  integer := 0;
  v_ok     boolean;
begin
  while v_steps < 520 loop
    v_steps := v_steps + 1;
    exit when v_week < public._streak_start(); -- 연속을 세기 시작한 주보다 앞은 보지 않는다
    if exists (select 1 from public.skipped_weeks s where s.week_key = v_week)
       or exists (select 1 from public.world_streak_freezes f where f.group_id = p_group and f.week_key = v_week) then
      v_week := v_week - 7; continue;
    end if;
    select (r.submitted_at is not null and not r.is_late) into v_ok from public.reports r where r.group_id = p_group and r.week_key = v_week;
    exit when not coalesce(v_ok, false);
    v_n := v_n + 1; v_week := v_week - 7;
  end loop;
  return v_n;
end;
$$;

create or replace function public._group_streak(p_group uuid, p_week_key date, p_now timestamptz)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_week    date := p_week_key;
  v_streak  integer := 0;
  v_steps   integer := 0;
  v_on_time boolean;
  v_oldest  date;
begin
  select min(r.week_key) into v_oldest from public.reports r where r.group_id = p_group;
  if v_oldest is not null then v_oldest := greatest(v_oldest, public._streak_start()); end if; -- 연속을 세기 시작한 주보다 앞은 보지 않는다

  while v_oldest is not null and v_week >= v_oldest and v_steps < 520 loop
    v_steps := v_steps + 1;

    -- 휴주 · 쿠폰으로 지킨 주: 건너뛰고 유지
    if exists (select 1 from public.skipped_weeks s where s.week_key = v_week)
       or exists (select 1 from public.world_streak_freezes f where f.group_id = p_group and f.week_key = v_week) then
      v_week := v_week - 7;
      continue;
    end if;

    select (r.submitted_at is not null and not r.is_late) into v_on_time
    from public.reports r where r.group_id = p_group and r.week_key = v_week;

    if coalesce(v_on_time, false) then
      v_streak := v_streak + 1;
      v_week := v_week - 7;
      continue;
    end if;

    -- 아직 마감 전인 미제출은 '대기' — 끊지 않고 그 앞 주부터 센다
    if p_now < public._world_deadline(v_week) then
      v_week := v_week - 7;
      continue;
    end if;

    exit;
  end loop;

  return v_streak;
end;
$$;
