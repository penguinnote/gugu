-- ===========================================================================
-- World 4 — world_state 를 읽기 전용으로 (2026-10-11)
--
-- 첫 판(20261011010000)의 world_state 는 열 때마다 새 목장의 시작 상태를 채웠다(_world_ensure). 읽기 함수가 쓰기를 하면
-- 출시 뒤 읽기 전용 프리뷰(Step 9c)에서 월드가 막히고, 분류표(src/lib/rpc-classes.json)의 readOnly 에도 넣을 수 없다.
-- 시작 상태는 목장이 생길 때 트리거가 채우고(지금 목장 12곳은 첫 판이 이미 채웠다), world_state 는 stable 로 읽기만 한다.
-- ===========================================================================

create function public._world_on_group_created()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._world_ensure(new.id);
  return new;
end;
$$;
revoke execute on function public._world_on_group_created() from public, anon, authenticated;

create trigger world_on_group_created
  after insert on public.groups
  for each row execute function public._world_on_group_created();

create or replace function public.world_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mine uuid;
begin
  if not public.is_app_user() then raise exception '로뎀 월드는 승인된 사용자만 열 수 있습니다.' using errcode = '42501'; end if;
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
