-- ===========================================================================
-- Step 9b 명단 관리 (2026-10-06) — 운영자 화면이 고치는 두 컬럼과 목장장 한 명
--
-- 이동·역할·목장장·상태는 Step 2~4 의 컬럼 권한과 persons_update 정책으로 이미 된다. 이번에 여는 것:
--   care_status   판정 태그. 컬럼 권한을 열되 **운영자만** 바꾼다 — 09 §1.5a "운영자가". 트리거가 막는다.
--                 지금까지는 roster.config 의 overrides 로만 바꿨다(명단의 진실이 앱이 되면서 화면으로).
--   needs_check   확인 필요. 리더도 내린다(04 v0.12 "리더가 내린다") — 행 범위는 정책이 정한다.
--   목장장         목장당 한 명. 명단에는 목장장 정보가 없어 지금 0명이고, 운영자가 화면에서 지정한다.
--                 둘이 되면 23505 — 화면의 '목장장으로 지정' 은 먼저 내리고 올린다.
-- 세션 없는 쓰기(시드·명단 스크립트·서버 키)는 트리거 예외 — 지금까지의 경로를 깨지 않는다.
-- ===========================================================================

grant update (care_status, needs_check) on public.persons to authenticated;

create function public.persons_care_status_admin_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.care_status is distinct from old.care_status
     and public.current_user_id() is not null
     and not public.is_admin() then
    raise exception '판정 태그는 운영자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger persons_care_status_admin_only
  before update of care_status on public.persons
  for each row execute function public.persons_care_status_admin_only();

create unique index persons_one_head_per_group
  on public.persons (group_id)
  where is_group_head and status <> 'left';

comment on column public.persons.is_group_head is
  '목장장. 호칭일 뿐 앱 권한과 무관. 리더여야 하고(persons_head_is_leader_ck) 목장당 한 명(persons_one_head_per_group). 운영자가 A-1 에서 지정한다.';
comment on column public.persons.care_status is
  '돌봄 판정 축(04 v0.12). 운영자만 바꾼다(트리거). 판정 대상은 active·long_absent.';
