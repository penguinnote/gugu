-- 휴주 새 규칙(2026-11-26 사용자 결정) — 휴주는 주로 행사가 있는 주다. 행사 주 선물로 열매를 준다. 휴주는 지금처럼 운영자 화면에서 정한다.
--
--   1. 늦게 정해도 휴주 — skipped_weeks_guard 의 소급 금지(지난 주 · 마감 지난 이번 주)를 푼다. 주차는 여전히 고치지 못한다(지우고 새로).
--   2. 연속 제출은 휴주를 건너뛰고 이어진다 — 지금 계산(_world_streak · group_streaks) 그대로.
--   3. 휴주 선물 — 휴주마다 활동 중인 모든 목장에 열매 world_rules.skip_gift(200)개. 원장 사유 skip_gift, 목장 · 주마다 한 번(unique).
--      주는 때: 그 주가 시작됐으면(그 주 일요일 00:00 KST 부터) 준다.
--        · 늦게 정한 휴주(이미 시작한 주) — 정하는 즉시(skipped_weeks 의 after insert 트리거)
--        · 미리 정한 휴주 — 그 주가 시작되면. pg_cron 이 매시 5분에 _world_skip_gifts() 를 부른다(일요일 00:05 KST 쯤 들어간다)
--      이 기능 전에 정해 둔 지난 휴주에는 주지 않는다(app_meta.skip_gift_since 보다 앞에 시작했고 그 전에 정한 휴주).
--   4. 선물 팝업 — 그 목장 리더가 다음에 앱을 열면 한 번. 본 것은 skip_gift_seen(계정 · 주)에 적는다.
--   5. 휴주에 낸 보고서는 지금 규칙 그대로 report_on_time · report_late 를 따로 받는다(선물과 별개).
--   6. 늦게 정한 휴주의 뒷정리(정하는 즉시)
--      · 그 주에 쓴 연속 지키기 쿠폰은 돌려준다 — 쓴 기록(world_streak_freezes)을 지워 학기 사용 횟수도 돌아오고, 가진 수를 하나 늘린다
--      · 끊겼던 연속이 이어지면서 그 뒤 제때 낸 주의 연속 보너스가 모자란다 — _world_freeze 처럼 다시 세어 못 받은 주만 채운다(이미 받은 것은 그대로)
--   7. 휴주를 지우면 앞으로의 선물만 멈춘다. 이미 준 선물은 되돌리지 않는다. 연속 계산은 지운 대로 다시 된다.

insert into public.world_rules (key, value, note) values
  ('skip_gift', 200, '휴주 선물 — 휴주마다 활동 중인 목장마다(2026-11-26)')
on conflict (key) do nothing;

insert into public.app_meta (key, value) values ('skip_gift_since', now()::text)
on conflict (key) do nothing;

-- 원장 사유 · 주차 규칙에 skip_gift 를 더한다
alter table public.world_ledger drop constraint world_ledger_reason_check;
alter table public.world_ledger add constraint world_ledger_reason_check
  check (reason = any (array['start', 'report_on_time', 'report_late', 'streak_bonus', 'purchase', 'pastor_read', 'pastor_stamp', 'admin_approve', 'grant', 'skip_gift']));
alter table public.world_ledger drop constraint world_ledger_check;
alter table public.world_ledger add constraint world_ledger_check
  check ((reason = any (array['report_on_time', 'report_late', 'streak_bonus', 'skip_gift'])) = (week_key is not null));
create unique index world_ledger_skip_gift_once on public.world_ledger (group_id, week_key) where reason = 'skip_gift';

-- 1. 소급 금지를 푼다 — 고치기는 사유만(주차는 그대로)
create or replace function public.skipped_weeks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
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

-- 3. 선물 — 시작한 휴주마다 활동 중인 목장에 한 번. 들어간 수를 돌려준다(cron · 트리거 · 시험이 부른다)
create or replace function public._world_skip_gifts()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := coalesce((select value from public.app_meta where key = 'skip_gift_since')::timestamptz, now());
  v_since_week date := (date_trunc('week', (v_since at time zone 'Asia/Seoul')::date + 1)::date - 1);
  v_n integer;
begin
  with due as (
    select s.week_key from public.skipped_weeks s
     where s.week_key <= public.kst_current_week()           -- 그 주가 시작됐다
       and (s.week_key >= v_since_week or s.created_at >= v_since)  -- 이 기능 전의 지난 휴주는 빼고
  ), ins as (
    insert into public.world_ledger (group_id, delta, reason, week_key)
    select g.id, public._world_rule('skip_gift'), 'skip_gift', d.week_key
      from due d cross join public.groups g
     where g.status = 'active'
    on conflict do nothing
    returning 1
  )
  select count(*)::int into v_n from ins;
  return v_n;
end;
$$;
revoke execute on function public._world_skip_gifts() from public, anon, authenticated;

-- 6. 늦게 정한 휴주의 뒷정리 — 쿠폰 돌려주기 · 못 받은 연속 보너스 채우기
create or replace function public._world_skip_cleanup(p_week date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g      record;
  v_w      date;
  v_streak integer;
  v_bonus  integer;
begin
  -- 쿠폰 — 그 주에 쓴 쿠폰을 돌려준다(쓴 기록을 지우면 학기 사용 횟수도 돌아온다)
  for v_g in delete from public.world_streak_freezes f where f.week_key = p_week returning f.group_id loop
    insert into public.world_inventory (group_id, item_id, qty) values (v_g.group_id, 'freeze', 1)
      on conflict (group_id, item_id) do update set qty = public.world_inventory.qty + 1;
  end loop;
  -- 연속 보너스 — 그 뒤 제때 낸 주들을 다시 세어, 보너스 줄이 없는 주만 채운다
  for v_g in select g.id from public.groups g where g.status = 'active' loop
    for v_w in
      select r.week_key from public.reports r
       where r.group_id = v_g.id and r.week_key > p_week and r.week_key <= public.kst_current_week()
         and r.submitted_at is not null and not r.is_late
         and not exists (select 1 from public.world_ledger l where l.group_id = v_g.id and l.week_key = r.week_key and l.reason = 'streak_bonus')
       order by r.week_key
    loop
      v_streak := public._world_streak(v_g.id, v_w);
      v_bonus  := least(public._world_rule('streak_step') * (v_streak - 1), public._world_rule('streak_max'));
      if v_streak >= 2 and v_bonus > 0 then
        insert into public.world_ledger (group_id, delta, reason, week_key)
          values (v_g.id, v_bonus, 'streak_bonus', v_w)
          on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;
revoke execute on function public._world_skip_cleanup(date) from public, anon, authenticated;

create or replace function public._skipped_weeks_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 이미 시작한 주를 휴주로 — 뒷정리하고 선물은 바로
  if new.week_key <= public.kst_current_week() then
    perform public._world_skip_cleanup(new.week_key);
    perform public._world_skip_gifts();
  end if;
  return new;
end;
$$;

create trigger skipped_weeks_after_insert
  after insert on public.skipped_weeks
  for each row execute function public._skipped_weeks_after();

-- 4. 선물 팝업 — 본 것(계정 · 주)
create table public.skip_gift_seen (
  user_id  uuid not null references public.users (id) on delete cascade,
  week_key date not null,
  seen_at  timestamptz not null default now(),
  primary key (user_id, week_key)
);
comment on table public.skip_gift_seen is '휴주 선물 팝업을 본 계정 · 주(2026-11-26). 한 번 보면 다시 띄우지 않는다.';
alter table public.skip_gift_seen enable row level security;
grant select, insert on public.skip_gift_seen to authenticated;
create policy skip_gift_seen_select on public.skip_gift_seen for select to authenticated using (user_id = public.current_user_id());
create policy skip_gift_seen_insert on public.skip_gift_seen for insert to authenticated with check (user_id = public.current_user_id());

-- 이미 시작한 휴주(이 기능 뒤에 정한 것)가 있으면 지금 한 번
select public._world_skip_gifts();

-- pg_cron — 매시 5분(미리 정한 휴주는 그 주 일요일 00:05 KST 쯤 선물이 들어간다)
-- 운영 DB 는 pg_cron 이 이미 깔려 있다 — 확장을 새로 만들지 않고(만들면 'dependent privileges exist' 로 막혔다, 2026-11-26) 있으면 일정만 건다
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('skip-week-gifts', '5 * * * *', 'select public._world_skip_gifts()')$q$;
    raise notice 'pg_cron: skip-week-gifts 일정을 걸었다';
  else
    raise notice 'pg_cron 없음: skip-week-gifts 일정을 걸지 못했다';
  end if;
end
$do$;
