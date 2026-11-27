-- 리더 추가는 목사님도, 양을 리더로 올리기는 목사님 · 운영자만(2026-11-26 사용자 결정).
--   1. persons_insert — 목사님은 어느 목장이든 구분(리더 · 양)을 골라 넣는다. 계정 없음 · 활동 · 목장장 아님은 그대로.
--      리더는 자기 목장에 양으로만.
--   2. persons_staff_only — '양 → 리더' 를 목사님 · 운영자만(리더 → 양 내리기는 2026-11-06 부터 같은 규칙).
--      운영자는 함수 맨 앞에서 통과한다. is_pastor() 는 목사님.

drop policy if exists persons_insert on public.persons;
create policy persons_insert on public.persons for insert to authenticated
  with check (
    public.is_admin()
    or (
      (
        (public.is_leader_of(group_id) and group_role = 'member')
        or (public.is_pastor() and group_id is not null and group_role in ('member', 'leader'))
      )
      and user_id is null
      and status = 'active'
      and not is_group_head
    )
  );

create or replace function public.persons_staff_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 들어온 날은 오늘 — 지난 주 보고서에서 넣으면 그 주(이번 주 앞 3주까지)로 앞당길 수 있다(2026-11-06). 미래는 안 된다
    new.joined_at := least(greatest(coalesce(new.joined_at, (now() at time zone 'Asia/Seoul')::date), public.kst_current_week() - 21),
                           (now() at time zone 'Asia/Seoul')::date);
    new.care_status := 'active';
    if new.status = 'opted_out' then
      raise exception '기록 제외는 운영자만 정합니다.' using errcode = '42501';
    end if;
    -- AI 동의는 목사님 · 운영자가 동의서를 받고 적는다(2026-11-13) — 리더가 넣는 사람은 동의 전으로
    if new.ai_consented_at is not null and not public.is_pastor() then
      raise exception 'AI 동의는 목사님 · 운영자만 적습니다.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and (new.status = 'opted_out' or old.status = 'opted_out') then
    raise exception '기록 제외는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- AI 동의 · 철회는 목사님 · 운영자만(2026-11-13, 예전 'AI 정리에서 빼기')
  if (new.ai_consented_at is distinct from old.ai_consented_at or new.ai_excluded is distinct from old.ai_excluded) and not public.is_pastor() then
    raise exception 'AI 동의는 목사님 · 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception '들어온 날은 운영자만 고칩니다.' using errcode = '42501';
  end if;
  if old.group_role = 'leader' and new.status is distinct from old.status then
    raise exception '리더의 상태는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- 리더를 양으로 내리기는 목사님 · 운영자만(2026-11-06) — 내린 뒤 '떠났어요' 로 리더 자리를 운영자 모르게 없앨 수 있었다
  if old.group_role = 'leader' and new.group_role = 'member' and not public.is_pastor() then
    raise exception '리더를 양으로 내리는 것은 목사님 · 운영자에게 부탁해 주세요.' using errcode = '42501';
  end if;
  -- 양을 리더로 올리기도 목사님 · 운영자만(2026-11-26 사용자 결정) — 리더 추가는 운영자와 목사님이 한다
  if old.group_role = 'member' and new.group_role = 'leader' and not public.is_pastor() then
    raise exception '리더로 바꾸는 것은 목사님 · 운영자에게 부탁해 주세요.' using errcode = '42501';
  end if;
  -- 목장장은 정하는 것만 함수로(한 목장에 한 명). 푸는 것은 고치기 저장에 함께 실어도 된다(2026-11-06)
  if new.is_group_head and not old.is_group_head then
    raise exception '목장장은 명단 고치기의 목장장 칸으로 정합니다.' using errcode = '42501';
  end if;
  -- '떠났어요' 되돌리기는 30분 안에만(2026-11-06) — 떠났다고 해 두고 제출한 뒤 되돌려 출석 빈칸 검사를 비켜 가지 않게
  if old.status = 'left' and new.status = 'active' and (old.left_at is null or old.left_at < now() - interval '30 minutes') then
    raise exception '떠난 지 오래된 분은 운영자에게 되살려 달라고 해 주세요.' using errcode = '42501';
  end if;
  return new;
end;
$function$;
