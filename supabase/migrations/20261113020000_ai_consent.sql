-- ===========================================================================
-- AI 는 동의한 사람만(2026-11-13) — 옵트아웃(빼 달라는 사람만 뺀다) → 옵트인(동의한 사람만 보낸다).
--
-- 기도제목은 민감정보이고 AI 로 보내는 것은 해외 이전이라, 청년 동의서 ⑤(07 §1)에 동의한 사람의 글만 AI 로 간다.
--
--   persons.ai_consented_at   동의서 ⑤ 에 동의한 날. null = 동의 전 · 동의 안 함 · 철회. 이것이 정답이다
--   persons.ai_excluded       이제 위에서 정해지는 값(= ai_consented_at is null). AI 코드는 계속 이것을 본다.
--                             직접 쓰지 못한다 — 쓰기 권한을 거두고, 트리거가 매번 다시 맞춘다
--
-- 바꾸는 사람은 그대로 목사님 · 운영자(persons_staff_only). 리더가 새로 넣는 사람은 동의 전으로 시작한다.
-- 지금 있는 모두는 동의 전이 된다 → 소급 트리거가 그 사람들의 글이 들어간 지난 AI 정리를 지운다(동의 없이 만든 것).
-- ===========================================================================

alter table public.persons add column ai_consented_at timestamptz;

comment on column public.persons.ai_consented_at is
  'AI 동의(청년 동의서 ⑤)한 날. null 이면 AI 로 보내지 않는다(ai_excluded = true). 목사님 · 운영자만 바꾼다(2026-11-13).';
comment on column public.persons.ai_excluded is
  'AI 로 보내지 않는다. ai_consented_at 에서 정해진다(persons_ai_sync) — 직접 쓰지 않는다(2026-11-13 옵트인).';

alter table public.persons alter column ai_excluded set default true;

revoke update (ai_excluded) on public.persons from authenticated;
grant  update (ai_consented_at) on public.persons to authenticated; -- 누가 바꾸는지는 persons_staff_only 가 본다

-- 1. 맞추기 — 동의일이 정답, ai_excluded 는 그 그림자 -----------------------------------------------------------

create function public.persons_ai_sync()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.ai_excluded := new.ai_consented_at is null;
  return new;
end;
$$;
comment on function public.persons_ai_sync() is 'ai_excluded = (ai_consented_at is null). BEFORE 트리거 — 이름 순으로 persons_staff_only 보다 먼저 돈다(2026-11-13).';
revoke execute on function public.persons_ai_sync() from public, anon, authenticated;

create trigger persons_ai_sync
  before insert or update on public.persons
  for each row execute function public.persons_ai_sync();

-- 2. 누가 바꾸나 — 20261107010000 본문 그대로에 동의일 두 줄 ----------------------------------------------------

create or replace function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
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
$$;

-- 3. 소급 — 동의일만 바꿔도(ai_excluded 는 BEFORE 트리거가 바꾸므로 UPDATE OF 에 안 걸린다) 지난 정리를 지운다 ----

drop trigger persons_digest_forget on public.persons;
create trigger persons_digest_forget
  after update of ai_excluded, ai_consented_at, status on public.persons
  for each row execute function public.digest_forget_person();

-- 4. 지금 있는 모두는 동의 전 — 동의 없이 만든 지난 AI 정리는 소급 트리거가 지운다 ----------------------------------

update public.persons set ai_excluded = true where not ai_excluded;
