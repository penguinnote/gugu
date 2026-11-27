-- ===========================================================================
-- 로뎀 월드 집 안 꾸미기 (2026-10-16)
--
--   가구     새 분류 furniture — 목장 열매로 사서(world_buy 그대로, 여러 개 살 수 있다) 우리 목장 집 안 자리에 놓는다.
--            world_items.slot 은 놓는 곳: floor(바닥) · wall(벽에 거는 것). 모델은 KayKit Furniture Bits · Tiny Treats Charming Kitchen(CC0).
--   집 안    world_villages.rooms — 마을 자리(0~6, 그 자리에 집이 있을 때) → 집 안 열 칸(바닥 1~8 · 벽 9~10, 빈 칸은 null).
--            한 마을에 집이 여럿이면 집마다 따로 꾸민다. 집을 치우면 그 자리 방은 지워지고 가구는 다시 놓을 수 있다.
--   쓰기     world_set_room(p_house, p_slots) — 목장 리더만, 가진 수만큼(그 마을 모든 집 안을 합쳐서). 마을 자리(world_set_village)에는 가구를 못 놓는다.
--   읽기     world_state 의 villages 에 rooms 를 함께 준다(모든 앱 사용자 — 다른 목장 집도 들어가 구경한다).
-- ===========================================================================

alter table public.world_items drop constraint world_items_cat_check;
alter table public.world_items add constraint world_items_cat_check check (cat in ('house', 'fence', 'nature', 'prop', 'ticket', 'wear', 'furniture'));
alter table public.world_items drop constraint world_items_slot_check;
alter table public.world_items add constraint world_items_slot_check check (
  (cat in ('wear', 'furniture')) = (slot is not null)
  and (slot is null or (cat = 'wear' and slot in ('hat', 'face', 'neck', 'back', 'hand')) or (cat = 'furniture' and slot in ('floor', 'wall')))
);
comment on column public.world_items.slot is '꾸미기 소품(wear)이 입는 자리(hat · face · neck · back · hand) · 가구(furniture)를 놓는 곳(floor · wall). 다른 물건은 null.';

insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('sofa',      '소파',        'furniture', 'floor', 60, 70, '셋이 나란히 앉는 푹신한 소파'),
  ('armchair',  '안락의자',    'furniture', 'floor', 35, 71, '혼자 폭 파묻히는 의자'),
  ('chair',     '나무 의자',   'furniture', 'floor', 12, 72, '식탁 곁에 두는 나무 의자'),
  ('bed',       '큰 침대',     'furniture', 'floor', 70, 73, '베개 둘, 넉넉한 침대'),
  ('bedsingle', '작은 침대',   'furniture', 'floor', 45, 74, '아담한 한 사람 침대'),
  ('dtable',    '식탁',        'furniture', 'floor', 30, 75, '둘러앉아 먹는 네모 식탁'),
  ('lowtable',  '낮은 탁자',   'furniture', 'floor', 22, 76, '소파 앞에 두는 낮은 탁자'),
  ('cabinet',   '장식장',      'furniture', 'floor', 45, 77, '화분과 액자를 올린 서랍장'),
  ('cupboard',  '작은 수납장', 'furniture', 'floor', 28, 78, '침대 곁 작은 서랍장'),
  ('lamp',      '스탠드',      'furniture', 'floor', 18, 79, '방을 밝히는 키 큰 스탠드'),
  ('cactus',    '선인장 화분', 'furniture', 'floor', 10, 80, '동글동글 선인장'),
  ('rugoval',   '둥근 깔개',   'furniture', 'floor', 16, 81, '방 가운데 둥근 깔개'),
  ('rugstripe', '줄무늬 깔개', 'furniture', 'floor', 16, 82, '네모난 줄무늬 깔개'),
  ('fridge',    '냉장고',      'furniture', 'floor', 50, 83, '노란 이층 냉장고'),
  ('stove',     '가스레인지',  'furniture', 'floor', 40, 84, '오븐이 달린 가스레인지'),
  ('sink',      '싱크대',      'furniture', 'floor', 35, 85, '수도꼭지 달린 개수대'),
  ('counter',   '조리대',      'furniture', 'floor', 20, 86, '서랍 달린 조리대'),
  ('painting',  '큰 그림',     'furniture', 'wall',  22, 87, '벽에 거는 넓은 그림'),
  ('frame',     '작은 그림',   'furniture', 'wall',  12, 88, '벽에 거는 작은 액자'),
  ('kshelf',    '부엌 선반',   'furniture', 'wall',  18, 89, '컵과 행주를 건 벽 선반');

alter table public.world_villages add column rooms jsonb not null default '{}'::jsonb check (jsonb_typeof(rooms) = 'object');
comment on column public.world_villages.rooms is '집 안 꾸밈 — 마을 자리 번호(0~6, 문자열) → 열 칸 배열(바닥 1~8 · 벽 9~10, 빈 칸 null). world_set_room 으로만 쓴다.';

-- 집 안 꾸미기 — 우리 목장 리더만. 그 자리에 집이 있어야 하고, 칸마다 맞는 가구(바닥 · 벽)여야 하고, 모든 집 안을 합쳐 가진 수만큼
create function public.world_set_room(p_house integer, p_slots text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_my_group();
  v_vil   public.world_villages;
  v_rooms jsonb;
  r       record;
begin
  if v_group is null then raise exception '목장 리더만 꾸밀 수 있습니다.' using errcode = '42501'; end if;
  if p_house is null or p_house < 0 or p_house > 6 then raise exception '없는 집 자리입니다.' using errcode = '22023'; end if;
  if cardinality(p_slots) is distinct from 10 then raise exception '집 안 자리는 열 칸입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('world:' || v_group::text, 0));
  perform public._world_ensure(v_group);
  select * into v_vil from public.world_villages where group_id = v_group;
  if not exists (select 1 from public.world_items where id = v_vil.slots[p_house + 1] and cat = 'house') then
    raise exception '그 자리에는 집이 없습니다.' using errcode = '22023';
  end if;
  for r in
    select s.item, s.n, i.cat, i.slot
    from unnest(p_slots) with ordinality as s(item, n)
    left join public.world_items i on i.id = s.item
    where s.item is not null
  loop
    if r.cat is distinct from 'furniture' then raise exception '집 안에 놓을 수 없는 물건입니다: %', r.item using errcode = '22023'; end if;
    if (r.n > 8) is distinct from (r.slot = 'wall') then raise exception '그 자리에 놓을 수 없는 가구입니다: %', r.item using errcode = '22023'; end if;
  end loop;
  v_rooms := (v_vil.rooms - p_house::text) || jsonb_build_object(p_house::text, to_jsonb(p_slots));
  for r in
    select x.item, count(*) as n, coalesce(v.qty, 0) as qty
    from jsonb_each(v_rooms) as e(k, arr)
    cross join lateral jsonb_array_elements_text(e.arr) as x(item)
    left join public.world_inventory v on v.group_id = v_group and v.item_id = x.item
    where x.item is not null
      and exists (select 1 from public.world_items h where h.id = v_vil.slots[e.k::integer + 1] and h.cat = 'house')
    group by x.item, v.qty
  loop
    if r.n > r.qty then raise exception '가진 것보다 많이 놓을 수 없습니다: %', r.item using errcode = '22023'; end if;
  end loop;
  update public.world_villages set rooms = v_rooms, updated_by = public.current_user_id(), updated_at = now() where group_id = v_group;
end;
$$;

-- 마을 꾸미기 — 가구는 마을 자리에 못 놓는다(그대로). 집이 없어진 자리의 방은 지운다(가구는 다시 놓을 수 있게)
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
  update public.world_villages
     set fence = p_fence, slots = p_slots, updated_by = public.current_user_id(), updated_at = now(),
         rooms = coalesce((select jsonb_object_agg(e.k, e.arr) from jsonb_each(rooms) as e(k, arr)
                            where exists (select 1 from public.world_items h where h.id = p_slots[e.k::integer + 1] and h.cat = 'house')), '{}'::jsonb)
   where group_id = v_group;
end;
$$;

-- 월드 상태 — 마을마다 집 안 꾸밈(rooms)도
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
                 from public.groups gr join public.world_villages v on v.group_id = gr.id where gr.status = 'active'),
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

revoke execute on function public.world_set_room(integer, text[]) from public, anon;
grant  execute on function public.world_set_room(integer, text[]) to authenticated;
