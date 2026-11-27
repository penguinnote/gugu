-- ===========================================================================
-- 한 사람(persons)에 계정이 둘 붙지 않는다 — DB 가 막는다 (2026-09-27)
--
-- 배경. Supabase 는 확인된 이메일이 같으면 구글·카카오 신원을 한 계정으로 합치지만,
-- 이메일이 다른 사람은 계정이 둘로 갈린다. 갈린 두 번째 계정이 같은 사람에게 붙으면
-- 같은 목장 보고서를 두 계정이 쓰고, 승인 화면에 같은 이름이 두 번 뜨고, streak 이
-- 쪼개진다. 세 번째가 가장 아프다 — 로그인 방법을 한 번 바꿨다고 연속 기록이
-- 리셋되면 그 리더는 앱을 놓는다.
--
-- 지금까지 막고 있던 것과 구멍
--   persons.user_id            자리가 하나(스칼라) — 동시에 둘은 구조적으로 불가
--   persons_user_id_key        한 계정이 사람 둘에 — 반대 방향의 유일 제약
--   approve_application        빈 자리에만 연결 — 함수 논리
--   persons_update 정책        리더·목사님·운영자가 자기 목장 행의 **모든 컬럼**을 고칠 수
--                              있었다. user_id 도. → 연결을 다른 계정으로 덮을 수 있었다 ★
--
-- 이 마이그레이션
--   1) user_id 컬럼은 authenticated 가 직접 못 고친다 (컬럼 권한)
--   2) 찬 자리를 다른 계정으로 덮는 것은 **누구든** 못 한다 (트리거 = 제약)
--      연결은 빈 자리에만. 옮기려면 먼저 떼야 한다.
--   3) 신청 목록은 점유된 사람도 보여준다 — 어느 로그인 방법이 잡고 있는지와 함께
--   4) 떼어내기는 운영자의 unlink_person_account() 로만. 기록은 사람에 남는다.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. user_id 는 함수로만 바뀐다
-- ---------------------------------------------------------------------------

revoke update on public.persons from authenticated;
grant update (
  group_id, name, gender, group_role, is_group_head,
  status, dormancy_request, joined_at, birth_date, phone
) on public.persons to authenticated;

comment on column public.persons.user_id is
  '앱 계정 연결. 신청→승인(approve_application)으로만 채워지고, 운영자의 unlink_person_account 로만 비워진다. 찬 자리를 다른 계정으로 덮는 것은 트리거가 막는다.';

-- ---------------------------------------------------------------------------
-- 2. 연결은 빈 자리에만 — 트리거 제약
--
-- RLS 를 우회하는 SECURITY DEFINER 함수, 운영자, 시드까지 전부 적용된다.
-- 허용: null→X (연결), X→null (해제), X→X (같은 값 — 시드 재실행).
-- 거부: X→Y.
-- ---------------------------------------------------------------------------

create or replace function public.persons_user_id_link_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is not null and new.user_id <> old.user_id then
    raise exception '이미 다른 계정에 연결된 사람입니다. 먼저 연결을 해제해야 합니다.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger persons_user_id_link_once
  before update of user_id on public.persons
  for each row execute function public.persons_user_id_link_once();

-- ---------------------------------------------------------------------------
-- 3. 신청 목록 — 점유된 사람을 지우지 않는다
--
-- 지우면 본인이 자기 이름을 못 찾아 더 혼란스럽다. 점유됐으면 어느 로그인
-- 방법(처음 쓴 제공자)이 잡고 있는지 같이 준다 — 그래야 스스로 돌아간다.
-- 폐쇄된 청년부 명단이므로 이 정도 노출은 문제가 되지 않는다.
-- ---------------------------------------------------------------------------

drop function public.list_claimable_persons(uuid);

create function public.list_claimable_persons(p_group_id uuid)
returns table (
  id               uuid,
  name             text,
  birth_date       date,
  group_role       public.group_role,
  claimed          boolean,
  claimed_provider public.auth_provider
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.birth_date, p.group_role,
         (p.user_id is not null) as claimed,
         u.provider as claimed_provider
  from public.persons p
  left join public.users u on u.id = p.user_id
  where p.group_id = p_group_id
    and p.status = 'active'
    and public.current_user_id() is not null      -- 로그인은 해야 한다
  order by p.name
$$;

-- ---------------------------------------------------------------------------
-- 4. 떼어내기 — 운영자만
--
-- 잘못 붙은 연결은 시범 운영에서 반드시 생긴다. 2) 때문에 떼는 길이 없으면
-- 영구 고착이다. 명단 연결이 앱 권한의 근거였으므로, 떼면 계정은 pending 으로
-- 돌아가고 리더 권한도 사라진다. 주간기록·streak 은 사람(persons)에 붙어 있어
-- 그대로 남는다 — 본인이 맞는 계정으로 다시 신청→승인하면 이어진다.
--
-- p_disable: 남의 계정이 붙었던 경우. pending 으로 돌리지 않고 잠근다(inactive).
-- ---------------------------------------------------------------------------

alter type public.event_type add value if not exists 'account_unlinked';

-- 이벤트의 대상 사람. account_unlinked 처럼 "누구를" 이 필요한 이벤트에 채운다.
alter table public.events
  add column person_id uuid references public.persons (id) on delete set null;

create function public.unlink_person_account(p_person_id uuid, p_disable boolean default false)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin  uuid := public.current_user_id();
  v_person public.persons%rowtype;
begin
  if not public.is_admin() then
    raise exception '운영자만 연결을 해제할 수 있습니다.' using errcode = '42501';
  end if;

  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found then
    raise exception '명단에 없는 사람입니다.' using errcode = '22023';
  end if;
  if v_person.user_id is null then
    raise exception '연결된 계정이 없습니다.' using errcode = '22023';
  end if;

  update public.persons p set user_id = null where p.id = p_person_id;

  -- 계정은 pending 으로. 리더였어도 — 명단 연결이 리더 권한의 근거였다.
  -- 목사님·운영자 계정은 명단 밖이라 여기 걸리지 않는다.
  update public.users u
     set role   = 'pending',
         status = case when p_disable then 'inactive'::public.user_status else u.status end
   where u.id = v_person.user_id and u.role in ('pending', 'member', 'leader');

  -- 그 계정이 걸어둔 신청은 닫는다.
  update public.applications a
     set status = 'rejected', decided_at = now(), decided_by = v_admin
   where a.user_id = v_person.user_id and a.status = 'pending';

  insert into public.events (user_id, type, group_id, person_id)
  values (v_admin, 'account_unlinked', v_person.group_id, p_person_id);
end;
$$;

revoke execute on function
  public.list_claimable_persons(uuid),
  public.unlink_person_account(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.list_claimable_persons(uuid),
  public.unlink_person_account(uuid, boolean)
to authenticated;
