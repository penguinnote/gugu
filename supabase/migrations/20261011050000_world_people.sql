-- ===========================================================================
-- World 7 — 꾸민 모습이 서로 보이게 (2026-10-11)
--
-- 마을 꾸밈은 모두가 보는데 아바타 생김새는 본인만 봤다(world_avatars RLS). 소품을 사도 남에게 안 보이면 보상이 안 된다
-- (05 §3.1 "꾸민 것이 남에게 보여야 보상이 된다"). 실시간 함께 걷기는 아니고, 월드를 열 때 그 순간의 모습을 받는다.
--
--   누가    생김새를 저장한 사람 중 — 명단상 활동 중 목장 리더(그 목장 마을 앞마당) · 목사님(교회 앞)
--           나 자신은 빼고(내 아바타는 내가 움직인다). 운영자(명단 밖)·미승인·휴면은 나오지 않는다
--   몇 명   마을마다 최근에 꾸민 세 사람까지, 목사님은 한 사람
--   무엇    목장 id 와 생김새만. 이름·사용자 id 는 주지 않는다(월드는 이름표를 띄우지 않는다)
--   어디서  world_state().people — 테이블 RLS 는 그대로(본인만). 넓힌 범위는 이 함수가 정한다
-- ===========================================================================

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
    'villages', (select coalesce(jsonb_agg(jsonb_build_object('group_id', gr.id, 'fence', v.fence, 'slots', to_jsonb(v.slots)) order by gr.number), '[]'::jsonb)
                 from public.groups gr join public.world_villages v on v.group_id = gr.id where gr.status = 'active'),
    'mine', case when v_mine is null then null else jsonb_build_object(
      'group_id', v_mine,
      'berries', (select coalesce(sum(delta), 0) from public.world_ledger where group_id = v_mine),
      'owned', (select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb) from public.world_inventory where group_id = v_mine and qty > 0)) end,
    'look', (select look from public.world_avatars where user_id = v_me),
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
