-- ===========================================================================
-- World 6 — 상점 넓히기 · 캐릭터 꾸미기 소품 (2026-10-11)
--
--   마을 물건   놀이터·소풍 물건 여덟 가지를 더한다(우체통 · 그네 · 미끄럼틀 · 시소 · 흔들 목마 · 모래놀이터 · 소풍 탁자 · 작은 새).
--   꾸미기 소품  새 분류 wear. 자리(slot)마다 하나씩 입는다 — 모자(hat) · 얼굴(face) · 목(neck) · 등(back) · 손(hand).
--               목장 열매로 사고, 산 소품은 '목장 옷장' 이라 그 목장 리더 모두가 입을 수 있다. 같은 소품은 한 번만 산다.
--   입기 검사    world_save_look 이 소품 자리 값을 본다 — 'none' 이거나, 그 자리 소품이고 내 목장이 가진 것이어야 한다.
--               맡은 목장이 없는 목사님·운영자는 소품 없이 꾸민다(살 수 없으므로).
--   설명 한 줄   world_items.blurb — 앱 상점 화면의 카드 설명. world_state 가 slot · blurb 를 함께 준다.
-- ===========================================================================

alter table public.world_items add column slot text, add column blurb text not null default '';
alter table public.world_items drop constraint world_items_cat_check;
alter table public.world_items add constraint world_items_cat_check check (cat in ('house', 'fence', 'nature', 'prop', 'ticket', 'wear'));
alter table public.world_items add constraint world_items_slot_check
  check ((cat = 'wear') = (slot is not null) and (slot is null or slot in ('hat', 'face', 'neck', 'back', 'hand')));

insert into public.world_items (id, name, cat, price, sort) values
  ('mailbox',     '우체통',      'prop',   12, 34), ('picnictable', '소풍 탁자',   'prop', 28, 35),
  ('springhorse', '흔들 목마',   'prop',   30, 36), ('seesaw',      '시소',       'prop', 40, 37),
  ('sandbox',     '모래놀이터',  'prop',   45, 38), ('swing',       '그네',       'prop', 55, 39),
  ('slide',       '미끄럼틀',    'prop',   65, 41), ('birds',       '작은 새',    'nature', 10, 24);

insert into public.world_items (id, name, cat, slot, price, sort) values
  ('strawhat',     '밀짚모자',     'wear', 'hat',  40, 50), ('ribbon',      '리본 머리띠', 'wear', 'hat',  30, 51),
  ('beanie',       '털모자',       'wear', 'hat',  35, 52), ('flowercrown', '꽃관',       'wear', 'hat',  45, 53),
  ('roundglasses', '동그란 안경',  'wear', 'face', 30, 54), ('sunglasses',  '선글라스',    'wear', 'face', 40, 55),
  ('scarf',        '목도리',       'wear', 'neck', 30, 56), ('bowtie',      '나비넥타이',  'wear', 'neck', 25, 57),
  ('backpack',     '배낭',         'wear', 'back', 45, 58), ('wings',       '날개',       'wear', 'back', 70, 59),
  ('balloon',      '풍선',         'wear', 'hand', 35, 60);

update public.world_items i set blurb = b.blurb from (values
  ('cabin', '초록 지붕의 아담한 집'), ('redhouse', '빨간 지붕, 하얀 벽의 집'), ('mushroom', '분홍 지붕의 동글동글한 집'), ('twofloor', '파란 지붕의 넓은 이층집'),
  ('wood', '마을 둘레를 두르는 나무 울타리'), ('picket', '하얀 말뚝 울타리'), ('hedge', '초록 덤불로 두른 울타리'), ('stone', '단단한 돌담'),
  ('apple', '그늘이 넓은 둥근 나무'), ('pine', '키 큰 소나무'), ('tulips', '알록달록 작은 꽃밭'), ('sunflower', '몽실몽실 덤불'), ('birds', '마당에 내려앉은 작은 새'),
  ('well', '물이 퐁퐁 솟는 분수'), ('bench', '쉬어 가는 나무 벤치'), ('flag', '밤길을 밝히는 가로등'), ('campfire', '바구니와 사과가 있는 돗자리'),
  ('mailbox', '편지를 기다리는 우체통'), ('picnictable', '둘러앉아 먹는 나무 탁자'), ('springhorse', '통통 튀는 흔들 목마'), ('seesaw', '둘이 타는 시소'),
  ('sandbox', '모래성 쌓는 놀이터'), ('swing', '나란히 타는 그네'), ('slide', '쭉 내려오는 미끄럼틀'),
  ('freeze', '놓친 주를 지켜 주는 쿠폰'),
  ('strawhat', '햇볕 가리는 넓은 챙'), ('ribbon', '분홍 리본이 달린 머리띠'), ('beanie', '방울 달린 따뜻한 모자'), ('flowercrown', '들꽃을 엮은 화관'),
  ('roundglasses', '똑똑해 보이는 동그란 테'), ('sunglasses', '여름 햇살엔 이것'), ('scarf', '포근한 빨간 목도리'), ('bowtie', '단정한 나비넥타이'),
  ('backpack', '소풍 갈 때 메는 배낭'), ('wings', '하늘하늘 하얀 날개'), ('balloon', '손에 쥔 노란 풍선')
) as b(id, blurb) where i.id = b.id;

-- 사기 — 꾸미기 소품도 울타리처럼 한 번만
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
  if v_item.cat in ('fence', 'wear') and exists (select 1 from public.world_inventory where group_id = v_group and item_id = p_item and qty > 0) then
    raise exception '%', case when v_item.cat = 'fence' then '이미 가진 울타리입니다.' else '이미 가진 꾸미기입니다.' end using errcode = '23505';
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

-- 생김새 — 본인 것만. 소품 자리는 'none' 이거나 내 목장 옷장에 있는 그 자리 소품
create or replace function public.world_save_look(p_look jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me    uuid := public.current_user_id();
  v_group uuid;
  r       record;
begin
  if not public.is_app_user() or v_me is null then raise exception '승인된 사용자만 저장할 수 있습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_look) is distinct from 'object' or pg_column_size(p_look) > 1024 then raise exception '생김새 값이 올바르지 않습니다.' using errcode = '22023'; end if;
  v_group := public._world_my_group();
  for r in select key, value from jsonb_each_text(p_look) where key in ('hat', 'face', 'neck', 'back', 'hand') and value is distinct from 'none' loop
    if not exists (select 1 from public.world_items i join public.world_inventory v on v.item_id = i.id
                   where i.id = r.value and i.cat = 'wear' and i.slot = r.key and v.group_id = v_group and v.qty > 0) then
      raise exception '아직 우리 목장 옷장에 없는 꾸미기입니다: %', r.value using errcode = '22023';
    end if;
  end loop;
  insert into public.world_avatars (user_id, look) values (v_me, p_look)
    on conflict (user_id) do update set look = excluded.look, updated_at = now();
end;
$$;

-- 월드 상태 — 물건에 자리 · 설명을 함께
create or replace function public.world_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mine uuid;
begin
  if not public.is_app_user() then raise exception '로뎀 월드는 승인된 사용자만 열 수 있습니다.' using errcode = '42501'; end if;
  v_mine := public._world_my_group();
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'cat', i.cat, 'slot', i.slot, 'blurb', i.blurb, 'price', i.price) order by i.sort), '[]'::jsonb) from public.world_items i),
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

-- 홈·상점 요약 — 쿠폰을 몇 장까지 가질 수 있는지도
create or replace function public.world_summary()
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
    'coupon_max', public._world_rule('freeze_hold_max'),
    'freeze_week', v_week,
    'freeze_keeps', case when v_week is null then 0 else public._world_streak(v_group, v_week - 7) end,
    'freezes_used', public._world_term_used(v_group, coalesce(v_week, (now() at time zone 'Asia/Seoul')::date)),
    'freezes_per_term', public._world_rule('freeze_per_term')
  );
end;
$$;

comment on column public.world_items.slot is '꾸미기 소품(wear)이 입는 자리: hat · face · neck · back · hand. 다른 물건은 null.';
comment on column public.world_items.blurb is '앱 상점 카드의 설명 한 줄.';
