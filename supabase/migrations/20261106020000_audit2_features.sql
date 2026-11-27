-- ===========================================================================
-- 감사 2차 기능(2026-11-06)
--
-- 1. 쿠폰보다 이번 주를 먼저 냈을 때의 연속 보너스 — 낼 때는 놓친 주에서 연속이 끊겨 보너스가 0 이었고,
--    나중에 쿠폰으로 지켜도 보너스는 다시 계산되지 않았다. _world_freeze 가 지킨 뒤 채운다.
-- 2. 기록에 남은 사람의 이름 — 다른 목장으로 옮긴 사람은 명단(persons) 읽기 범위 밖이라, 리더의 지난 보고서에서
--    그 사람 줄이 사라지고 내보내기에서는 '(명단에 없음)' 한 줄로 합쳐졌다. 그 사람의 기록을 읽을 수 있는 사람
--    (목사님 · 그 기록을 쓴 목장의 리더)에게만 이름 · 구분을 준다.
-- ===========================================================================

create or replace function public._world_freeze(p_group uuid, p_user uuid, p_week date, p_buy boolean, p_now timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reason  text;
  v_used    integer;
  v_per     integer;
  v_price   integer;
  v_balance integer;
  v_qty     integer;
  v_streak  integer;
  v_bonus   integer;
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

  -- 다음 주(이번 주)를 쿠폰보다 먼저 제때 냈으면, 그때는 놓친 주에서 연속이 끊겨 연속 보너스가 0 이었다.
  -- 지킨 지금 다시 세어 못 받은 보너스를 채운다(2026-11-06). 이미 받았으면(unique) 그대로
  if exists (select 1 from public.reports r where r.group_id = p_group and r.week_key = p_week + 7 and r.submitted_at is not null and not r.is_late)
     and not exists (select 1 from public.world_ledger l where l.group_id = p_group and l.week_key = p_week + 7 and l.reason = 'streak_bonus') then
    v_streak := public._world_streak(p_group, p_week + 7);
    v_bonus  := least(public._world_rule('streak_step') * (v_streak - 1), public._world_rule('streak_max'));
    if v_streak >= 2 and v_bonus > 0 then
      insert into public.world_ledger (group_id, delta, reason, week_key, created_by)
        values (p_group, v_bonus, 'streak_bonus', p_week + 7, p_user)
        on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('week', p_week, 'coupons', v_qty, 'used', v_used + 1, 'per_term', v_per);
end;
$$;

create function public.recorded_person_names(p_ids uuid[])
returns table (id uuid, name text, group_role public.group_role)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.group_role
  from public.persons p
  where p.id = any (p_ids)
    and exists (
      select 1 from public.weekly_records w
      where w.person_id = p.id and (public.is_pastor() or public.is_leader_of(w.group_id_at_write))
    );
$$;

comment on function public.recorded_person_names(uuid[]) is
  '기록에 남은 사람의 이름 — 그 기록을 읽을 수 있는 사람(목사님 · 기록한 목장 리더)에게만. 옮겨 간 사람도 지난 기록에 이름이 붙는다(2026-11-06).';

revoke execute on function public.recorded_person_names(uuid[]) from public, anon, authenticated;
grant  execute on function public.recorded_person_names(uuid[]) to authenticated;
