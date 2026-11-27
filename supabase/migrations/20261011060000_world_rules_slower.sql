-- ===========================================================================
-- World 8 — 열매 규칙 '추천안 — 천천히' (2026-10-11)
--
-- 열매 계산기(26주 한 학기, 휴주 2주로 굴려 봄)에서 지금 값은 매주 정시인 목장이 25주 만에 상점을 다 사고
-- 쿠폰(80)이 1.5주치밖에 안 됐다. 버는 속도를 2/3 남짓으로 줄인다 — 물건 값은 그대로.
--   정시 30 → 20 · 지각 10 → 5 · 연속 보너스 한 칸 5 → 4 · 최대 25 → 12 (시작 60 · 쿠폰 80 · 쿠폰 한도는 그대로)
--   매주 정시 목장 한 학기 ≈ 800(상점 전부 1,297 에 못 미침) · 보통 목장(정시 75%) 4주에 ≈ 70 · 쿠폰 = 최대 주의 2.5주치
-- 이미 적힌 원장은 그대로 — 다음 제출부터 새 값이다.
--
-- 월드가 규칙 숫자를 화면 글에 쓰도록 world_state 에 rules 를 함께 준다(글에 숫자를 박아 두면 값을 바꿀 때마다 어긋난다).
-- ===========================================================================

update public.world_rules set value = 20 where key = 'report_on_time';
update public.world_rules set value = 5  where key = 'report_late';
update public.world_rules set value = 4  where key = 'streak_step';
update public.world_rules set value = 12 where key = 'streak_max';

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
