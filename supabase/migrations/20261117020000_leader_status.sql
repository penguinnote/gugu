-- ===========================================================================
-- 상태 · 판정 태그는 그 목장 리더도 바꾼다, 휴면 신청은 없앤다(2026-11-17 사용자 결정)
--   예전: 판정 태그(care_status)는 운영자만(트리거), 휴면은 리더가 신청 → 목사님이 승인(request_dormancy · decide_dormancy).
--   이제: 그 목장 리더 · 목사님 · 운영자가 명단 고치기에서 바로 바꾼다. 행 범위는 그대로 persons_update 정책(리더는 자기 목장).
--   리더 자신의 상태 · 기록 제외 · AI 동의 같은 것은 그대로 운영자 몫(persons_staff_only).
-- ===========================================================================

create or replace function public.persons_care_status_admin_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.care_status is distinct from old.care_status
     and public.current_user_id() is not null
     and not (public.is_admin() or public.is_pastor() or public.is_leader_of(old.group_id)) then
    raise exception '판정 태그는 그 목장 리더 · 목사님 · 운영자가 바꿉니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.persons_care_status_admin_only() is '판정 태그 — 그 목장 리더 · 목사님 · 운영자(2026-11-17, 예전 운영자만). 이름은 예전 그대로.';
comment on column public.persons.care_status is
  '돌봄 판정 축(04 v0.12). 그 목장 리더 · 목사님 · 운영자가 바꾼다(2026-11-17 — 트리거). 판정 대상은 active·long_absent.';

-- 휴면 신청 없애기 — 기다리던 신청은 지운다(상태는 그대로)
update public.persons set dormancy_request = 'none' where dormancy_request = 'pending';
drop function public.request_dormancy(uuid, boolean);
drop function public.decide_dormancy(uuid, boolean);
comment on column public.persons.dormancy_request is '쓰지 않는다(2026-11-17 휴면 신청을 없앴다 — 리더가 상태를 바로 바꾼다). 옛 기록으로만 남는다.';
