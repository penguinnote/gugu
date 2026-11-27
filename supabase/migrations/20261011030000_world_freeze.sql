-- ===========================================================================
-- World 5 — 연속 지키기 쿠폰 · 열매 규칙 표 (2026-10-11)
--
-- 05 §3.2 의 streak freeze 를 상점 물건으로 연다. 한 주를 놓쳐도 쌓아 온 기록이 한 번에 0 이 되지 않게.
--   물건      '연속 지키기 쿠폰'(freeze, 새 분류 ticket). 값은 world_items 에서(처음 80 열매).
--   쓰는 주   놓친 주 — 마감이 지났는데 정시 제출이 없는 주(미제출이든 마감 후 제출이든).
--             그 주의 다음 주 마감 전까지만 쓸 수 있다. 그래서 언제든 쓸 수 있는 주는 많아야 하나다.
--   효과      쿠폰을 쓴 주는 그 목장에 한해 휴주처럼 건너뛴다(group_streaks · _world_streak). 소급 적립은 없다.
--   한도      학기(3~8월 / 9~2월, 쓴 주의 날짜 기준)마다 목장당 freeze_per_term 번(처음 2).
--             지킬 기록이 없으면(그 전까지 연속 0주) 쓰지 못한다 — 열매만 버리게 되므로.
--             가질 수 있는 쿠폰은 freeze_hold_max 장까지(처음 2).
--   쓰기      world_use_freeze(주, 사서 쓰기) — 쿠폰이 없고 p_buy 면 같은 거래 안에서 사서 바로 쓴다.
--   읽기      world_summary() — 홈이 쓴다: 열매 · 쿠폰 수 · 지금 지킬 수 있는 주 · 이번 학기 쓴 수.
--
-- 열매 숫자는 아직 정하는 중이라(2026-10-11) 한 표(world_rules)에 모았다. 바꿀 때는 값만 고친다:
--   update public.world_rules set value = 40 where key = 'report_on_time';
-- 이미 적은 원장은 그대로다. 쿠폰 값은 물건 값이라 world_items 에서: update public.world_items set price = 60 where id = 'freeze';
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 열매 규칙 표
-- ---------------------------------------------------------------------------
create table public.world_rules (
  key   text primary key check (key ~ '^[a-z_]+$'),
  value integer not null check (value >= 0),
  note  text not null
);
insert into public.world_rules (key, value, note) values
  ('start_berries',   60, '새 목장의 시작 열매'),
  ('report_on_time',  30, '마감 안에 처음 제출'),
  ('report_late',     10, '마감 뒤에 처음 제출'),
  ('streak_step',      5, '연속 n주째 보너스 = streak_step × (n−1)'),
  ('streak_max',      25, '연속 보너스 최대'),
  ('freeze_per_term',  2, '학기(3~8월/9~2월)마다 목장당 쿠폰 쓰는 횟수'),
  ('freeze_hold_max',  2, '한 목장이 가질 수 있는 쿠폰 수');

alter table public.world_rules enable row level security;
grant select on public.world_rules to authenticated;
create policy world_rules_read on public.world_rules for select to authenticated using (public.is_app_user());

create function public._world_rule(p_key text)
returns integer language sql stable security definer set search_path = '' as $$
  select value from public.world_rules where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- 2. 쿠폰 물건 · 쓴 주
-- ---------------------------------------------------------------------------
alter table public.world_items drop constraint world_items_cat_check;
alter table public.world_items add constraint world_items_cat_check check (cat in ('house', 'fence', 'nature', 'prop', 'ticket'));
insert into public.world_items (id, name, cat, price, sort) values ('freeze', '연속 지키기 쿠폰', 'ticket', 80, 40);

create table public.world_streak_freezes (
  group_id uuid not null references public.groups (id) on delete cascade,
  week_key date not null check (extract(dow from week_key) = 0),
  used_by  uuid references public.users (id) on delete set null,
  used_at  timestamptz not null default now(),
  primary key (group_id, week_key)
);
alter table public.world_streak_freezes enable row level security;
grant select on public.world_streak_freezes to authenticated;
create policy world_streak_freezes_read on public.world_streak_freezes for select to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());

comment on table public.world_streak_freezes is '연속 지키기 쿠폰을 쓴 주. 그 목장의 streak 에서 휴주처럼 건너뛴다. 쓰기는 world_use_freeze 만.';

-- ---------------------------------------------------------------------------
-- 3. 도우미 — 마감 · 학기 · 지킬 수 있는가
-- ---------------------------------------------------------------------------

-- 주차(일요일)의 마감: 화요일 23:59 KST = 수요일 00:00 KST 전 (group_streaks 와 같다)
create function public._world_deadline(p_week date)
returns timestamptz language sql stable set search_path = '' as $$
  select ((p_week + 3)::text || ' 00:00:00+09')::timestamptz
$$;

-- 그 주가 든 학기의 첫날: 3~8월 → 3월 1일, 9~12월 → 9월 1일, 1~2월 → 지난해 9월 1일
create function public._world_term_start(p_week date)
returns date language sql immutable set search_path = '' as $$
  select case
    when extract(month from p_week) between 3 and 8 then make_date(extract(year from p_week)::int, 3, 1)
    when extract(month from p_week) >= 9 then make_date(extract(year from p_week)::int, 9, 1)
    else make_date(extract(year from p_week)::int - 1, 9, 1)
  end
$$;

create function public._world_term_used(p_group uuid, p_week date)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.world_streak_freezes f
  where f.group_id = p_group
    and f.week_key >= public._world_term_start(p_week)
    and f.week_key < (public._world_term_start(p_week) + interval '6 months')::date
$$;

-- 그 목장의 그 주를 지금(p_now) 지킬 수 없는 까닭. 지킬 수 있으면 null. 쿠폰 수·학기 한도는 따로 본다
create function public._world_freeze_block(p_group uuid, p_week date, p_now timestamptz)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if p_week is null or extract(dow from p_week) <> 0 then return '주차는 일요일이어야 합니다.'; end if;
  if exists (select 1 from public.skipped_weeks s where s.week_key = p_week) then return '휴주는 지킬 필요가 없습니다.'; end if;
  if exists (select 1 from public.world_streak_freezes f where f.group_id = p_group and f.week_key = p_week) then return '이미 쿠폰으로 지킨 주입니다.'; end if;
  if exists (select 1 from public.reports r where r.group_id = p_group and r.week_key = p_week and r.submitted_at is not null and not r.is_late) then
    return '마감 안에 낸 주입니다.';
  end if;
  if p_now < public._world_deadline(p_week) then return '아직 마감 전인 주입니다.'; end if;
  if p_now >= public._world_deadline(p_week + 7) then return '쿠폰은 놓친 주의 다음 주 마감 전까지만 쓸 수 있습니다.'; end if;
  if public._world_streak(p_group, p_week - 7) = 0 then return '지킬 연속 기록이 없습니다.'; end if;
  return null;
end;
$$;

-- 지금 지킬 수 있는 주(없으면 null). 마감이 지났고 다음 마감은 아직인 주는 언제나 하나뿐이다:
-- 수요일 0시(KST)부터는 이번 주, 그 전(일~화)은 지난주
create function public._world_freezable(p_group uuid, p_now timestamptz)
returns date language plpgsql stable security definer set search_path = '' as $$
declare
  v_day  date := (p_now at time zone 'Asia/Seoul')::date;
  v_week date := v_day - extract(dow from v_day)::int;
begin
  if p_now < public._world_deadline(v_week) then v_week := v_week - 7; end if;
  if public._world_freeze_block(p_group, v_week, p_now) is not null then return null; end if;
  return v_week;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. streak — 쿠폰 쓴 주는 그 목장에 한해 휴주처럼
-- ---------------------------------------------------------------------------
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
        and not exists (select 1 from public.skipped_weeks s where s.week_key = r.week_key)
    ) into v_ever;

    select min(r.week_key) into v_oldest from public.reports r where r.group_id = g.id;

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

-- ---------------------------------------------------------------------------
-- 5. 시작 열매 · 제출 적립을 규칙 표에서
-- ---------------------------------------------------------------------------
create or replace function public._world_ensure(p_group uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_no    integer;
  v_house text;
  v_tree  text;
begin
  select number into v_no from public.groups where id = p_group;
  if v_no is null then return; end if;
  v_house := (array['cabin', 'redhouse', 'mushroom', 'twofloor'])[((v_no - 1) % 4) + 1];
  v_tree  := (array['apple', 'pine'])[((v_no - 1) % 2) + 1];
  insert into public.world_ledger (group_id, delta, reason) values (p_group, public._world_rule('start_berries'), 'start') on conflict do nothing;
  insert into public.world_inventory (group_id, item_id, qty)
    values (p_group, v_house, 1), (p_group, v_tree, 1), (p_group, 'wood', 1) on conflict do nothing;
  insert into public.world_villages (group_id, fence, slots)
    values (p_group, 'wood', array[v_house, null, v_tree, null, null, null, null]) on conflict do nothing;
end;
$$;

create or replace function public._world_on_report_submitted()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_streak integer;
  v_bonus  integer;
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then return new; end if;
  perform public._world_ensure(new.group_id);
  insert into public.world_ledger (group_id, delta, reason, week_key, created_by)
    values (new.group_id,
            case when new.is_late then public._world_rule('report_late') else public._world_rule('report_on_time') end,
            case when new.is_late then 'report_late' else 'report_on_time' end,
            new.week_key, new.submitted_by)
    on conflict do nothing;
  if not new.is_late then
    v_streak := public._world_streak(new.group_id, new.week_key);
    v_bonus  := least(public._world_rule('streak_step') * (v_streak - 1), public._world_rule('streak_max'));
    if v_streak >= 2 and v_bonus > 0 then
      insert into public.world_ledger (group_id, delta, reason, week_key, created_by)
        values (new.group_id, v_bonus, 'streak_bonus', new.week_key, new.submitted_by)
        on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 사기 · 꾸미기 — 쿠폰은 가질 수 있는 수까지, 마을에는 놓지 않는다
-- ---------------------------------------------------------------------------
create or replace function public.world_buy(p_item text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group   uuid := public._world_my_group();
  v_item    public.world_items;
  v_balance integer;
  v_qty     integer;
  v_max     integer;
begin
  if v_group is null then raise exception '목장 리더만 살 수 있습니다.' using errcode = '42501'; end if;
  select * into v_item from public.world_items where id = p_item;
  if v_item.id is null then raise exception '없는 물건입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('world:' || v_group::text, 0));
  perform public._world_ensure(v_group);
  if v_item.cat = 'fence' and exists (select 1 from public.world_inventory where group_id = v_group and item_id = p_item and qty > 0) then
    raise exception '이미 가진 울타리입니다.' using errcode = '23505';
  end if;
  if v_item.cat = 'ticket' then
    v_max := public._world_rule('freeze_hold_max');
    if coalesce((select qty from public.world_inventory where group_id = v_group and item_id = p_item), 0) >= v_max then
      raise exception '쿠폰은 %장까지 가질 수 있습니다.', v_max using errcode = '23505';
    end if;
  end if;
  select coalesce(sum(delta), 0) into v_balance from public.world_ledger where group_id = v_group;
  if v_balance < v_item.price then
    raise exception '열매가 모자랍니다.' using errcode = 'P0001', detail = jsonb_build_object('need', v_item.price - v_balance)::text;
  end if;
  insert into public.world_ledger (group_id, delta, reason, item_id, created_by) values (v_group, -v_item.price, 'purchase', p_item, public.current_user_id());
  insert into public.world_inventory (group_id, item_id, qty) values (v_group, p_item, 1)
    on conflict (group_id, item_id) do update set qty = public.world_inventory.qty + 1
    returning qty into v_qty;
  return jsonb_build_object('berries', v_balance - v_item.price, 'item', p_item, 'qty', v_qty);
end;
$$;

create or replace function public.world_set_village(p_fence text, p_slots text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_my_group();
  r       record;
begin
  if v_group is null then raise exception '목장 리더만 꾸밀 수 있습니다.' using errcode = '42501'; end if;
  if cardinality(p_slots) is distinct from 7 then raise exception '자리는 일곱 칸입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('world:' || v_group::text, 0));
  perform public._world_ensure(v_group);
  if not exists (select 1 from public.world_items i join public.world_inventory v on v.item_id = i.id
                 where i.id = p_fence and i.cat = 'fence' and v.group_id = v_group and v.qty > 0) then
    raise exception '가진 울타리가 아닙니다.' using errcode = '22023';
  end if;
  for r in
    select s.item, count(*) as n, i.cat, coalesce(v.qty, 0) as qty
    from unnest(p_slots) as s(item)
    left join public.world_items i on i.id = s.item
    left join public.world_inventory v on v.group_id = v_group and v.item_id = s.item
    where s.item is not null
    group by s.item, i.cat, v.qty
  loop
    if r.cat is null or r.cat not in ('house', 'nature', 'prop') then raise exception '놓을 수 없는 물건입니다: %', r.item using errcode = '22023'; end if;
    if r.n > r.qty then raise exception '가진 것보다 많이 놓을 수 없습니다: %', r.item using errcode = '22023'; end if;
  end loop;
  update public.world_villages set fence = p_fence, slots = p_slots, updated_by = public.current_user_id(), updated_at = now()
   where group_id = v_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 쿠폰 쓰기 — 안쪽(시각을 받는다, 테스트용) · 바깥(앱이 부른다, 지금 시각)
-- ---------------------------------------------------------------------------
create function public._world_freeze(p_group uuid, p_user uuid, p_week date, p_buy boolean, p_now timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason  text;
  v_used    integer;
  v_per     integer;
  v_price   integer;
  v_balance integer;
  v_qty     integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('world:' || p_group::text, 0));
  v_reason := public._world_freeze_block(p_group, p_week, p_now);
  if v_reason is not null then raise exception '%', v_reason using errcode = '22023'; end if;
  v_used := public._world_term_used(p_group, p_week);
  v_per  := public._world_rule('freeze_per_term');
  if v_used >= v_per then raise exception '이번 학기에는 쿠폰을 %번까지 쓸 수 있습니다.', v_per using errcode = 'P0001'; end if;

  -- 쿠폰이 없고 사서 쓰기면 같은 거래 안에서 산다 — 사기만 되고 쓰기가 실패하면 함께 되돌아간다
  if p_buy and not exists (select 1 from public.world_inventory where group_id = p_group and item_id = 'freeze' and qty > 0) then
    select price into v_price from public.world_items where id = 'freeze';
    select coalesce(sum(delta), 0) into v_balance from public.world_ledger where group_id = p_group;
    if v_balance < v_price then
      raise exception '열매가 모자랍니다.' using errcode = 'P0001', detail = jsonb_build_object('need', v_price - v_balance)::text;
    end if;
    insert into public.world_ledger (group_id, delta, reason, item_id, created_by) values (p_group, -v_price, 'purchase', 'freeze', p_user);
    insert into public.world_inventory (group_id, item_id, qty) values (p_group, 'freeze', 1)
      on conflict (group_id, item_id) do update set qty = public.world_inventory.qty + 1;
  end if;

  update public.world_inventory set qty = qty - 1
   where group_id = p_group and item_id = 'freeze' and qty > 0
   returning qty into v_qty;
  if v_qty is null then raise exception '쿠폰이 없습니다. 상점에서 살 수 있습니다.' using errcode = 'P0001'; end if;

  insert into public.world_streak_freezes (group_id, week_key, used_by) values (p_group, p_week, p_user);
  return jsonb_build_object('week', p_week, 'coupons', v_qty, 'used', v_used + 1, 'per_term', v_per);
end;
$$;

create function public.world_use_freeze(p_week date, p_buy boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_my_group();
begin
  if v_group is null then raise exception '목장 리더만 쿠폰을 쓸 수 있습니다.' using errcode = '42501'; end if;
  return public._world_freeze(v_group, public.current_user_id(), p_week, coalesce(p_buy, false), now());
end;
$$;

-- 홈이 한 번에 읽는 내 목장 요약(명단상 리더만, 아니면 null)
--   berries 열매 · coupons 가진 쿠폰 · coupon_price · freeze_week 지금 지킬 수 있는 주(없으면 null)
--   freeze_keeps 그 주를 지키면 이어지는 연속 주 수
--   freezes_used / freezes_per_term  이번 학기(지킬 주가 있으면 그 주의 학기) 쓴 수 / 한도
create function public.world_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_group uuid;
  v_week  date;
begin
  if not public.is_app_user() then raise exception '승인된 사용자만 볼 수 있습니다.' using errcode = '42501'; end if;
  v_group := public._world_my_group();
  if v_group is null then return null; end if;
  v_week := public._world_freezable(v_group, now());
  return jsonb_build_object(
    'berries', (select coalesce(sum(delta), 0) from public.world_ledger where group_id = v_group),
    'coupons', coalesce((select qty from public.world_inventory where group_id = v_group and item_id = 'freeze'), 0),
    'coupon_price', (select price from public.world_items where id = 'freeze'),
    'freeze_week', v_week,
    'freeze_keeps', case when v_week is null then 0 else public._world_streak(v_group, v_week - 7) end,
    'freezes_used', public._world_term_used(v_group, coalesce(v_week, (now() at time zone 'Asia/Seoul')::date)),
    'freezes_per_term', public._world_rule('freeze_per_term')
  );
end;
$$;

revoke execute on function public._world_rule(text), public._world_deadline(date), public._world_term_start(date),
  public._world_term_used(uuid, date), public._world_freeze_block(uuid, date, timestamptz), public._world_freezable(uuid, timestamptz),
  public._world_freeze(uuid, uuid, date, boolean, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.world_use_freeze(date, boolean), public.world_summary() from public, anon;
grant  execute on function public.world_use_freeze(date, boolean), public.world_summary() to authenticated;

comment on table public.world_rules is '로뎀 월드 열매 규칙의 숫자. 값만 고치면 다음 적립·쿠폰부터 바뀐다(지난 원장은 그대로).';
