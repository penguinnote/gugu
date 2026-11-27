-- ===========================================================================
-- 내 AI 동의(2026-11-13) — 앱에 로그인하는 사람(리더 등)은 명단의 자기 행에 대해 직접 AI 동의를 켜고 끈다.
--   첫 접속 동의 화면의 선택 항목 · 내 정보의 'AI 동의' 가 부른다. 청년(로그인 안 함)은 그대로 운영자가 동의서를 보고 켠다.
--
--   set_my_ai_consent(p_on)   본인과 연결된 명단 행(current_person_id)만. 켜면 동의일 = 지금(이미 켰으면 그대로), 끄면 철회
--   my_ai_consent()           본인 행의 동의일(없으면 null)
--
-- persons_staff_only 는 동의를 목사님 · 운영자만 바꾸게 막으므로, 본인 행 하나에 한해 gg.staff_rpc 로 통과시킨다.
-- 끄면 소급 트리거(persons_digest_forget)가 그대로 돈다.
-- ===========================================================================

create function public.set_my_ai_consent(p_on boolean)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_person uuid := public.current_person_id();
  v_at     timestamptz;
begin
  if not public.is_app_user() or v_person is null then
    raise exception '명단과 연결된 계정만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception '켜기 · 끄기를 골라 주세요.' using errcode = '22023';
  end if;

  perform set_config('gg.staff_rpc', '1', true);
  update public.persons
     set ai_consented_at = case when p_on then coalesce(ai_consented_at, now()) else null end
   where id = v_person
  returning ai_consented_at into v_at;
  perform set_config('gg.staff_rpc', '', true);
  return v_at;
end;
$$;

create function public.my_ai_consent()
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select p.ai_consented_at from public.persons p where p.id = public.current_person_id()
$$;

revoke execute on function public.set_my_ai_consent(boolean), public.my_ai_consent() from public, anon;
grant  execute on function public.set_my_ai_consent(boolean), public.my_ai_consent() to authenticated;
