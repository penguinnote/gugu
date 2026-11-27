-- ===========================================================================
-- 목회자 집 · 운영자 집(2026-11-06 사용자 결정)
--
--   자리     로뎀 월드의 명소 두 곳(식당 하나 · 정원)에 작은 마당 — 울타리 · 집 1칸 · 마당 2칸, 집 안은 목장 집과 같다
--   주인     목회자 집 = 목사님 계정 모두가 함께(목사님 · 사모님), 운영자 집 = 운영자 계정
--            groups 에 특별 자리 둘(status = 'special', 번호 101 · 102) — 월드 경제(열매 · 가진 물건 · 마을 · 집 안)를 목장과 같은 길로 쓴다.
--            활동 목장(status = 'active')만 세는 명단 · 보고서 · 내보내기 · 목사님 화면에는 나오지 않는다
--   열매     시작 60. 목회자 — 보고서를 처음 확인하면 한 건에 +2, 확인 도장 +1. 운영자 — 신청 승인 한 건에 +5 (world_rules 로 바꾼다)
--   _world_my_group  목장 리더 → 그 목장, 목사님 → 목회자 집, 운영자 → 운영자 집(운영자는 목장이 없다, 2026-11-06)
-- ===========================================================================

insert into public.groups (number, name, status)
select 101, '목회자', 'special' where not exists (select 1 from public.groups where number = 101);
insert into public.groups (number, name, status)
select 102, '운영', 'special' where not exists (select 1 from public.groups where number = 102);

-- 열매 이유 셋 · 한 번만(ref_id)
alter table public.world_ledger drop constraint if exists world_ledger_reason_check;
alter table public.world_ledger add constraint world_ledger_reason_check
  check (reason in ('start', 'report_on_time', 'report_late', 'streak_bonus', 'purchase', 'pastor_read', 'pastor_stamp', 'admin_approve'));
alter table public.world_ledger add column if not exists ref_id uuid;
create unique index if not exists world_ledger_ref_once on public.world_ledger (group_id, reason, ref_id) where ref_id is not null;
comment on column public.world_ledger.ref_id is '한 번만 주는 열매의 근거(보고서 · 신청 id). 2026-11-06';

insert into public.world_rules (key, value, note) values
  ('pastor_read',   2, '목회자 집 — 목장 보고서를 처음 확인할 때(한 건)'),
  ('pastor_stamp',  1, '목회자 집 — 확인 도장(한 건)'),
  ('admin_approve', 5, '운영자 집 — 신청 승인(한 건)')
on conflict (key) do nothing;

-- 내 월드 자리
create or replace function public._world_my_group()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.group_id
       from public.persons p
       join public.users u on u.id = p.user_id
      where u.auth_user_id = (select auth.uid())
        and u.status = 'active' and u.role = 'leader'
        and p.status = 'active' and p.group_role = 'leader'
      limit 1),
    (select g.id
       from public.groups g
       join public.users u on u.auth_user_id = (select auth.uid()) and u.status = 'active'
      where g.status = 'special'
        and ((u.role = 'pastor' and g.number = 101) or (u.role = 'admin' and g.number = 102))
      limit 1)
  )
$$;

-- 열매 주기
create function public._world_special(p_number integer)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.groups where status = 'special' and number = p_number
$$;

create function public._world_on_review()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g uuid := public._world_special(101);
begin
  if v_g is null then return new; end if;
  perform public._world_ensure(v_g);
  if tg_op = 'INSERT' then
    insert into public.world_ledger (group_id, delta, reason, ref_id, created_by)
      values (v_g, public._world_rule('pastor_read'), 'pastor_read', new.report_id, new.reviewer_id)
      on conflict do nothing;
  end if;
  if new.stamp is not null and (tg_op = 'INSERT' or old.stamp is null) then
    insert into public.world_ledger (group_id, delta, reason, ref_id, created_by)
      values (v_g, public._world_rule('pastor_stamp'), 'pastor_stamp', new.report_id, new.reviewer_id)
      on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger world_on_review
  after insert or update of stamp on public.report_reviews
  for each row execute function public._world_on_review();

create function public._world_on_approve()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g uuid := public._world_special(102);
begin
  if v_g is null or new.status <> 'approved' or old.status = 'approved' then return new; end if;
  perform public._world_ensure(v_g);
  insert into public.world_ledger (group_id, delta, reason, ref_id, created_by)
    values (v_g, public._world_rule('admin_approve'), 'admin_approve', new.id, new.decided_by)
    on conflict do nothing;
  return new;
end;
$$;

create trigger world_on_approve
  after update of status on public.applications
  for each row execute function public._world_on_approve();

revoke execute on function public._world_special(integer), public._world_on_review(), public._world_on_approve() from public, anon, authenticated;

-- 사기 — 특별 자리도 산다(쿠폰은 목장만)
create or replace function public.world_buy(p_item text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group   uuid := public._world_my_group();
  v_item    public.world_items;
  v_balance integer;
  v_qty     integer;
  v_max     integer;
begin
  if v_group is null then raise exception '목장 리더 · 목사님 · 운영자만 살 수 있습니다.' using errcode = '42501'; end if;
  select * into v_item from public.world_items where id = p_item;
  if v_item.id is null then raise exception '없는 물건입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('world:' || v_group::text, 0));
  perform public._world_ensure(v_group);
  if v_item.cat in ('fence', 'wear') and exists (select 1 from public.world_inventory where group_id = v_group and item_id = p_item and qty > 0) then
    raise exception '%', case when v_item.cat = 'fence' then '이미 가진 울타리입니다.' else '이미 가진 꾸미기입니다.' end using errcode = '23505';
  end if;
  if v_item.cat = 'ticket' and exists (select 1 from public.groups g where g.id = v_group and g.status = 'special') then
    raise exception '연속 지키기 쿠폰은 목장만 씁니다.' using errcode = '22023';
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

-- 마당 — 특별 자리는 앞 세 칸만
create or replace function public.world_set_village(p_fence text, p_slots text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_my_group();
  r       record;
begin
  if v_group is null then raise exception '목장 리더만 꾸밀 수 있습니다.' using errcode = '42501'; end if;
  if cardinality(p_slots) is distinct from 7 then raise exception '자리는 일곱 칸입니다.' using errcode = '22023'; end if;
  -- 목회자 · 운영자 집(작은 마당)은 앞 세 칸만 — 집 하나 · 마당 둘(2026-11-06)
  if exists (select 1 from public.groups g where g.id = v_group and g.status = 'special')
     and (p_slots[4] is not null or p_slots[5] is not null or p_slots[6] is not null or p_slots[7] is not null) then
    raise exception '이 마당은 세 칸입니다.' using errcode = '22023';
  end if;
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
  update public.world_villages
     set fence = p_fence, slots = p_slots, updated_by = public.current_user_id(), updated_at = now(),
         rooms = coalesce((select jsonb_object_agg(e.k, e.arr) from jsonb_each(rooms) as e(k, arr)
                            where exists (select 1 from public.world_items h where h.id = p_slots[e.k::integer + 1] and h.cat = 'house')), '{}'::jsonb)
   where group_id = v_group;
end;
$$;

-- 월드 상태 — 특별 자리 마당도 함께(번호 101 · 102 라 맨 뒤)
create or replace function public.world_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mine uuid;
  v_me   uuid;
begin
  if not public.is_app_user() then raise exception '로뎀 월드는 승인된 사용자만 열 수 있습니다.' using errcode = '42501'; end if;
  v_mine := public._world_my_group();
  v_me := public.current_user_id();
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'cat', i.cat, 'slot', i.slot, 'blurb', i.blurb, 'price', i.price) order by i.sort), '[]'::jsonb) from public.world_items i),
    'villages', (select coalesce(jsonb_agg(jsonb_build_object('group_id', gr.id, 'fence', v.fence, 'slots', to_jsonb(v.slots), 'rooms', v.rooms) order by gr.number), '[]'::jsonb)
                 from public.groups gr join public.world_villages v on v.group_id = gr.id where gr.status in ('active', 'special')),
    'mine', case when v_mine is null then null else jsonb_build_object(
      'group_id', v_mine,
      'berries', (select coalesce(sum(delta), 0) from public.world_ledger where group_id = v_mine),
      'owned', (select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) from public.world_inventory where group_id = v_mine and qty > 0)) end,
    'look', (select look from public.world_avatars where user_id = v_me),
    'rules', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.world_rules),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object('group_id', x.group_id, 'look', x.look) order by x.num nulls first, x.k), '[]'::jsonb)
      from (
        -- 목장 리더 — 한 사람이 두 목장에 리더로 있어도(드묾) 각 마을에 선다
        select p.group_id, gr.number as num, a.look,
               row_number() over (partition by p.group_id order by a.updated_at desc, a.user_id) as k
        from public.world_avatars a
        join public.users u on u.id = a.user_id and u.status = 'active' and u.role in ('leader', 'admin')
        join public.persons p on p.user_id = u.id and p.status = 'active' and p.group_role = 'leader'
        join public.groups gr on gr.id = p.group_id and gr.status = 'active'
        where a.user_id is distinct from v_me
        union all
        -- 목사님 — 교회 앞
        select null, null, a.look, row_number() over (order by a.updated_at desc, a.user_id) as k
        from public.world_avatars a
        join public.users u on u.id = a.user_id and u.status = 'active' and u.role = 'pastor'
        where a.user_id is distinct from v_me
      ) x
      where (x.group_id is not null and x.k <= 3) or (x.group_id is null and x.k <= 1)
    )
  );
end;
$$;


-- 목장 일(연속 · 쿠폰 · 목장 탭 사진)은 목장 리더만 — 특별 자리는 열매 · 꾸미기만 쓴다
create function public._world_leader_group()
returns uuid language sql stable security definer set search_path = '' as $$
  select g from (select public._world_my_group() as g) x
   where exists (select 1 from public.groups gr where gr.id = x.g and gr.status = 'active')
$$;
revoke execute on function public._world_leader_group() from public, anon, authenticated;

create or replace function public.world_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_group uuid;
  v_week  date;
begin
  if not public.is_app_user() then raise exception '승인된 사용자만 볼 수 있습니다.' using errcode = '42501'; end if;
  v_group := public._world_leader_group();
  if v_group is null then return null; end if;
  v_week := public._world_freezable(v_group, now());
  return jsonb_build_object(
    'berries', (select coalesce(sum(delta), 0) from public.world_ledger where group_id = v_group),
    'coupons', coalesce((select qty from public.world_inventory where group_id = v_group and item_id = 'freeze'), 0),
    'coupon_price', (select price from public.world_items where id = 'freeze'),
    'coupon_max', public._world_rule('freeze_hold_max'),
    'freeze_week', v_week,
    'freeze_keeps', case when v_week is null then 0 else public._world_streak(v_group, v_week - 7) end,
    'freezes_used', public._world_term_used(v_group, coalesce(v_week, (now() at time zone 'Asia/Seoul')::date)),
    'freezes_per_term', public._world_rule('freeze_per_term')
  );
end;
$$;

create or replace function public.world_use_freeze(p_week date, p_buy boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_leader_group();
begin
  if v_group is null then raise exception '목장 리더만 쿠폰을 쓸 수 있습니다.' using errcode = '42501'; end if;
  return public._world_freeze(v_group, public.current_user_id(), p_week, coalesce(p_buy, false), now());
end;
$$;

create or replace function public.world_set_room_shot(p_image text)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_leader_group();
  v_img   bytea;
  v_at    timestamptz := now();
begin
  if v_group is null then raise exception '목장 리더만 저장할 수 있습니다.' using errcode = '42501'; end if;
  begin
    v_img := decode(p_image, 'base64');
  exception when others then
    raise exception '사진 값이 올바르지 않습니다.' using errcode = '22023';
  end;
  if v_img is null or octet_length(v_img) < 1000 or octet_length(v_img) > 600000 then
    raise exception '사진 크기가 맞지 않습니다.' using errcode = '22023';
  end if;
  -- WebP — 'RIFF' ···· 'WEBP'
  if substring(v_img from 1 for 4) <> '\x52494646'::bytea or substring(v_img from 9 for 4) <> '\x57454250'::bytea then
    raise exception 'WebP 사진만 저장할 수 있습니다.' using errcode = '22023';
  end if;
  insert into public.world_room_shots as s (group_id, image, updated_at, updated_by)
  values (v_group, v_img, v_at, public.current_user_id())
  on conflict (group_id) do update set image = excluded.image, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end;
$$;

-- 두 집을 미리 만들어 둔다(시작 열매 · 기본 집)
select public._world_ensure(id) from public.groups where status = 'special';
