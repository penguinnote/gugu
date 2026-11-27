-- ===========================================================================
-- 리더도 보는 전체 명단 (2026-10-14)
--
-- 운영자의 명단 화면(A-1)과 같은 꼴을 리더 · 목사님도 본다(사용자 결정) — 목장별 전원, 한 줄에 이름 · 역할과
-- 눈에 띄어야 할 표시(목장장 · 활동 외 상태 · 태그 · 확인 필요 · 계정). 필터도 같다.
-- persons 는 RLS 로 리더에게 자기 목장만 보이므로, 이 목록만 함수(security definer)로 연다.
--
--   돌려주는 것  id · 이름 · 목장 · 리더/양 · 목장장 · 상태 · 태그 · 확인 필요 · 계정 있음(참/거짓)
--   돌려주지 않는 것  연락처 · 생년 · 계정 id · 기록 — 고치는 길도 그대로 운영자뿐(보기만)
--   운영 중인 목장의 사람만(떠난 사람 포함 — 명단 화면이 맨 아래 줄을 그어 보인다). 앱 사용자만(42501).
-- ===========================================================================

create function public.roster_people()
returns table (
  id            uuid,
  name          text,
  group_id      uuid,
  group_role    public.group_role,
  is_group_head boolean,
  status        public.person_status,
  care_status   public.care_status,
  needs_check   boolean,
  has_account   boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_user() then
    raise exception '승인된 사용자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.group_id, p.group_role, p.is_group_head, p.status, p.care_status,
           coalesce(p.needs_check, false), p.user_id is not null
      from public.persons p
      join public.groups g on g.id = p.group_id
     where g.status = 'active';
end;
$$;

comment on function public.roster_people() is
  '전체 명단(보기 전용) — 운영 중인 목장의 사람, 이름 · 목장 · 역할 · 목장장 · 상태 · 태그 · 확인 필요 · 계정 있음. 연락처 · 생년 · 기록은 없다. 앱 사용자(리더 · 목사님 · 운영자).';

revoke execute on function public.roster_people() from public, anon;
grant execute on function public.roster_people() to authenticated;
