-- ===========================================================================
-- World 4 — 로뎀 월드: 열매 · 상점 · 마을 꾸미기 · 아바타 (2026-10-11)
--
-- 01 PRD §8 · 05 §3.1 의 Phase 3 보상을 로뎀 월드의 마을로 연다.
--   단위      목장. 열매·가진 물건은 목장 것이고 그 목장 리더들이 함께 쓴다. 개인 원장은 없다.
--   공개 범위  꾸민 마을(world_villages)은 앱 사용자 모두가 본다 — 꾸민 것이 남에게 보여야 보상이 된다(05 §3.1).
--             열매·가진 물건은 그 목장 리더 · 목사님 · 운영자만. 목장 간 순위는 만들지 않는다(group_streaks 와 같은 원칙).
--   적립      보고서를 처음 제출하는 순간 트리거가 원장에 한 번 적는다.
--               마감 안 +30 · 마감 후 +10 · 마감 안이고 연속 n주째면 보너스 +5×(n−1), 최대 +25.
--             같은 목장·같은 주는 한 번뿐(유일 인덱스). 소급 적립은 없다 — DB 에 데모 보고서가 남아 있어서.
--   시작      목장마다 60 열매 + 집 1(번호 순으로 네 가지) + 나무 1 + 나무 울타리, 마을엔 집과 나무.
--   쓰기      표에 직접 쓰지 않는다. 구매(world_buy) · 꾸미기(world_set_village) · 생김새(world_save_look) 함수로만.
--             리더는 명단이 기준(is_leader_of). 목사님·운영자는 맡은 목장이 없어 사고 꾸미지 않는다.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 상점 물건 — 월드의 ITEMS 와 같은 열쇠
-- ---------------------------------------------------------------------------
create table public.world_items (
  id    text primary key check (id ~ '^[a-z]+$'),
  name  text not null,
  cat   text not null check (cat in ('house', 'fence', 'nature', 'prop')),
  price integer not null check (price > 0),
  sort  integer not null default 0
);

insert into public.world_items (id, name, cat, price, sort) values
  ('cabin',     '초록 지붕 집',   'house',  30,  1), ('redhouse', '빨간 지붕 집',   'house',  60,  2),
  ('mushroom',  '분홍 지붕 집',   'house',  90,  3), ('twofloor', '파란 지붕 큰 집', 'house', 120,  4),
  ('wood',      '나무 울타리',    'fence',  20, 10), ('picket',   '하얀 울타리',    'fence',  35, 11),
  ('hedge',     '꽃 덤불 울타리', 'fence',  45, 12), ('stone',    '돌담',          'fence',  50, 13),
  ('apple',     '둥근 나무',      'nature', 25, 20), ('pine',     '소나무',        'nature', 15, 21),
  ('tulips',    '꽃밭',          'nature', 12, 22), ('sunflower', '덤불',         'nature', 18, 23),
  ('well',      '분수',          'prop',   40, 30), ('bench',    '벤치',          'prop',   15, 31),
  ('flag',      '가로등',        'prop',   10, 32), ('campfire', '소풍 돗자리',    'prop',   22, 33);

-- ---------------------------------------------------------------------------
-- 2. 열매 원장 — 잔액은 합계. 적립 사유는 주마다 한 번
-- ---------------------------------------------------------------------------
create table public.world_ledger (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     text not null check (reason in ('start', 'report_on_time', 'report_late', 'streak_bonus', 'purchase')),
  week_key   date,
  item_id    text references public.world_items (id),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((reason in ('report_on_time', 'report_late', 'streak_bonus')) = (week_key is not null)),
  check ((reason = 'purchase') = (item_id is not null))
);
create index world_ledger_group on public.world_ledger (group_id);
-- 한 목장의 한 주는 제출 적립 한 번(정시든 지각이든), 보너스 한 번. 시작 열매도 한 번
create unique index world_ledger_report_once on public.world_ledger (group_id, week_key) where reason in ('report_on_time', 'report_late');
create unique index world_ledger_bonus_once  on public.world_ledger (group_id, week_key) where reason = 'streak_bonus';
create unique index world_ledger_start_once  on public.world_ledger (group_id) where reason = 'start';

-- ---------------------------------------------------------------------------
-- 3. 가진 물건 · 4. 마을 꾸밈 · 5. 아바타
-- ---------------------------------------------------------------------------
create table public.world_inventory (
  group_id uuid not null references public.groups (id) on delete cascade,
  item_id  text not null references public.world_items (id),
  qty      integer not null check (qty >= 0),
  primary key (group_id, item_id)
);

create table public.world_villages (
  group_id   uuid primary key references public.groups (id) on delete cascade,
  fence      text not null references public.world_items (id),
  slots      text[] not null check (cardinality(slots) = 7),   -- 마을 자리 7칸(월드의 SLOTS 순서), 빈 칸은 null
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.world_avatars (
  user_id    uuid primary key references public.users (id) on delete cascade,
  look       jsonb not null check (jsonb_typeof(look) = 'object' and pg_column_size(look) <= 1024),
  updated_at timestamptz not null default now()
);

alter table public.world_items     enable row level security;
alter table public.world_ledger    enable row level security;
alter table public.world_inventory enable row level security;
alter table public.world_villages  enable row level security;
alter table public.world_avatars   enable row level security;

-- 읽기만 연다. 쓰기는 아래 함수(security definer)로만
grant select on public.world_items, public.world_ledger, public.world_inventory, public.world_villages, public.world_avatars to authenticated;

create policy world_items_read     on public.world_items     for select to authenticated using (public.is_app_user());
create policy world_villages_read  on public.world_villages  for select to authenticated using (public.is_app_user());
create policy world_ledger_read    on public.world_ledger    for select to authenticated using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());
create policy world_inventory_read on public.world_inventory for select to authenticated using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());
create policy world_avatars_read   on public.world_avatars   for select to authenticated using (user_id = public.current_user_id());

-- ---------------------------------------------------------------------------
-- 6. 도우미(내부용) — 목장 시작 상태, 호출한 사람이 리더로 맡은 목장, 정시 연속 주 수
-- ---------------------------------------------------------------------------
create function public._world_ensure(p_group uuid)
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
  insert into public.world_ledger (group_id, delta, reason) values (p_group, 60, 'start') on conflict do nothing;
  insert into public.world_inventory (group_id, item_id, qty)
    values (p_group, v_house, 1), (p_group, v_tree, 1), (p_group, 'wood', 1) on conflict do nothing;
  insert into public.world_villages (group_id, fence, slots)
    values (p_group, 'wood', array[v_house, null, v_tree, null, null, null, null]) on conflict do nothing;
end;
$$;

create function public._world_my_group()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.group_id
  from public.persons p
  join public.users u on u.id = p.user_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active' and u.role in ('leader', 'admin')
    and p.status = 'active' and p.group_role = 'leader'
  limit 1
$$;

-- 그 주까지 정시 제출이 몇 주 이어졌나(휴주는 건너뛰고 유지). group_streaks 와 같은 규칙을 한 목장·한 주에만 —
-- group_streaks 는 부르는 사람에 따라 걸러서(리더는 자기 목장만) 트리거에서 쓰기 어렵다
create function public._world_streak(p_group uuid, p_week date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_week   date := p_week;
  v_n      integer := 0;
  v_steps  integer := 0;
  v_ok     boolean;
begin
  while v_steps < 520 loop
    v_steps := v_steps + 1;
    if exists (select 1 from public.skipped_weeks s where s.week_key = v_week) then v_week := v_week - 7; continue; end if;
    select (r.submitted_at is not null and not r.is_late) into v_ok from public.reports r where r.group_id = p_group and r.week_key = v_week;
    exit when not coalesce(v_ok, false);
    v_n := v_n + 1; v_week := v_week - 7;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public._world_ensure(uuid), public._world_my_group(), public._world_streak(uuid, date) from public, anon, authenticated;

-- 지금 있는 목장들의 시작 상태
select public._world_ensure(id) from public.groups;

-- ---------------------------------------------------------------------------
-- 7. 적립 — 보고서가 처음 제출되는 순간
-- ---------------------------------------------------------------------------
create function public._world_on_report_submitted()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_streak integer;
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then return new; end if;
  perform public._world_ensure(new.group_id);
  insert into public.world_ledger (group_id, delta, reason, week_key, created_by)
    values (new.group_id, case when new.is_late then 10 else 30 end, case when new.is_late then 'report_late' else 'report_on_time' end, new.week_key, new.submitted_by)
    on conflict do nothing;
  if not new.is_late then
    v_streak := public._world_streak(new.group_id, new.week_key);
    if v_streak >= 2 then
      insert into public.world_ledger (group_id, delta, reason, week_key, created_by)
        values (new.group_id, 5 * least(v_streak - 1, 5), 'streak_bonus', new.week_key, new.submitted_by)
        on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public._world_on_report_submitted() from public, anon, authenticated;

create trigger world_on_report_submitted
  after insert or update of submitted_at on public.reports
  for each row execute function public._world_on_report_submitted();

-- ---------------------------------------------------------------------------
-- 8. 앱이 부르는 함수
-- ---------------------------------------------------------------------------

-- 월드에 필요한 것 한 번에: 물건 목록 · 모든 마을 꾸밈(번호 순) · 내 목장(열매·가진 물건) · 내 생김새
create function public.world_state()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_mine uuid;
  g      record;
begin
  if not public.is_app_user() then raise exception '로뎀 월드는 승인된 사용자만 열 수 있습니다.' using errcode = '42501'; end if;
  for g in select id from public.groups where status = 'active' loop perform public._world_ensure(g.id); end loop; -- 새로 생긴 목장도
  v_mine := public._world_my_group();
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'cat', i.cat, 'price', i.price) order by i.sort), '[]'::jsonb) from public.world_items i),
    'villages', (select coalesce(jsonb_agg(jsonb_build_object('group_id', gr.id, 'fence', v.fence, 'slots', to_jsonb(v.slots)) order by gr.number), '[]'::jsonb)
                 from public.groups gr join public.world_villages v on v.group_id = gr.id where gr.status = 'active'),
    'mine', case when v_mine is null then null else jsonb_build_object(
      'group_id', v_mine,
      'berries', (select coalesce(sum(delta), 0) from public.world_ledger where group_id = v_mine),
      'owned', (select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) from public.world_inventory where group_id = v_mine and qty > 0)) end,
    'look', (select look from public.world_avatars where user_id = public.current_user_id())
  );
end;
$$;

-- 사기 — 내 목장 열매로. 울타리는 한 번만 산다. 두 리더가 동시에 사도 원장이 어긋나지 않게 목장 단위로 잠근다
create function public.world_buy(p_item text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group   uuid := public._world_my_group();
  v_item    public.world_items;
  v_balance integer;
  v_qty     integer;
begin
  if v_group is null then raise exception '목장 리더만 살 수 있습니다.' using errcode = '42501'; end if;
  select * into v_item from public.world_items where id = p_item;
  if v_item.id is null then raise exception '없는 물건입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('world:' || v_group::text, 0));
  perform public._world_ensure(v_group);
  if v_item.cat = 'fence' and exists (select 1 from public.world_inventory where group_id = v_group and item_id = p_item and qty > 0) then
    raise exception '이미 가진 울타리입니다.' using errcode = '23505';
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

-- 꾸미기 — 내 목장 마을. 가진 수만큼만 놓고, 울타리는 가진 것 중에서
create function public.world_set_village(p_fence text, p_slots text[])
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
    if r.cat is null or r.cat = 'fence' then raise exception '놓을 수 없는 물건입니다: %', r.item using errcode = '22023'; end if;
    if r.n > r.qty then raise exception '가진 것보다 많이 놓을 수 없습니다: %', r.item using errcode = '22023'; end if;
  end loop;
  update public.world_villages set fence = p_fence, slots = p_slots, updated_by = public.current_user_id(), updated_at = now()
   where group_id = v_group;
end;
$$;

-- 생김새 — 본인 것만
create function public.world_save_look(p_look jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := public.current_user_id();
begin
  if not public.is_app_user() or v_me is null then raise exception '승인된 사용자만 저장할 수 있습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_look) is distinct from 'object' or pg_column_size(p_look) > 1024 then raise exception '생김새 값이 올바르지 않습니다.' using errcode = '22023'; end if;
  insert into public.world_avatars (user_id, look) values (v_me, p_look)
    on conflict (user_id) do update set look = excluded.look, updated_at = now();
end;
$$;

revoke execute on function public.world_state(), public.world_buy(text), public.world_set_village(text, text[]), public.world_save_look(jsonb) from public, anon;
grant  execute on function public.world_state(), public.world_buy(text), public.world_set_village(text, text[]), public.world_save_look(jsonb) to authenticated;

comment on table public.world_ledger is '로뎀 월드 열매 원장(목장 단위). 잔액은 합계. 제출 적립은 트리거, 구매는 world_buy 만 쓴다.';
comment on table public.world_villages is '로뎀 월드 마을 꾸밈. 앱 사용자 모두가 본다(꾸민 것이 보여야 보상). 바꾸기는 world_set_village 만.';
