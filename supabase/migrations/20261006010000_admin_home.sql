-- ===========================================================================
-- Step 9a 운영 화면 (2026-10-06) — 푸시 현황 함수 · 휴주 소급 금지
--
-- 1) push_registration_status() — A-1c. 운영자가 "누가 알림을 못 받는가" 를 보고 개별 안내한다(02 C-2a).
--    push_subscriptions 는 본인 것만 읽힌다 — endpoint·키는 발송 비밀이라 운영자에게도 열지 않는다.
--    이 함수는 이름·목장·역할·기기 수·마지막 성공 시각만 돌려준다. 계정 있는 앱 사용자 전원(기기 0 포함).
--
-- 2) skipped_weeks — 이번 주부터만 (2026-10-06 결정). 지난 주차를 휴주로 넣거나 빼면 streak·제출률이
--    소급해서 바뀐다. 운영자 화면이 지난 주를 보여주지 않지만, 화면은 마지막 방어선이 아니다. 세션 없는
--    쓰기(시드·서버 키)는 예외 — 이력 적재용.
--    created_by 는 세션 사용자로 채운다.
-- ===========================================================================

-- 운영자가 아니면 빈 결과가 아니라 42501 — 운영 함수는 "거기 뭔가 있다" 를 숨길 이유가 없고,
-- 빈 결과는 "아무도 등록 안 했다" 로 읽히기 때문이다.
create function public.push_registration_status()
returns table (
  user_id         uuid,
  name            text,
  role            public.user_role,
  group_name      text,
  devices         integer,
  last_success_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '운영자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
  select u.id,
         coalesce(p.name, u.name),
         u.role,
         g.name,
         (select count(*)::int from public.push_subscriptions s where s.user_id = u.id),
         (select max(s.last_success_at) from public.push_subscriptions s where s.user_id = u.id)
    from public.users u
    left join public.persons p on p.user_id = u.id
    left join public.groups g on g.id = p.group_id
   where u.status = 'active'
     and u.role in ('leader', 'pastor', 'admin')
   order by g.number nulls last, coalesce(p.name, u.name);
end;
$$;

comment on function public.push_registration_status() is
  'A-1c 푸시 등록 현황 — 계정 있는 앱 사용자별 기기 수. 운영자 전용. endpoint·키는 돌려주지 않는다.';

revoke execute on function public.push_registration_status() from public, anon;
grant execute on function public.push_registration_status() to authenticated;

-- ---------------------------------------------------------------------------
-- 휴주 — 이번 주부터만
-- ---------------------------------------------------------------------------

create function public.kst_current_week()
returns date
language sql stable set search_path = ''
as $$
  select (date_trunc('week', (now() at time zone 'Asia/Seoul')::date + 1)::date - 1)
$$;

comment on function public.kst_current_week() is '가장 최근 일요일(KST). 오늘이 일요일이면 오늘. src/lib/week.ts currentWeekKey() 와 같다.';

create function public.skipped_weeks_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_week date := coalesce(new.week_key, old.week_key);
begin
  -- 세션 사용자(운영자 화면)만 막는다. 세션 없는 쓰기(시드·테스트·서버 키)는 과거도 넣는다 — 이력 적재용.
  if public.current_user_id() is not null and v_week < public.kst_current_week() then
    raise exception '지난 주차의 휴주는 바꿀 수 없습니다 (%). 연속 제출과 제출률이 소급해서 바뀝니다.', v_week
      using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.current_user_id(), new.created_by);
    return new;
  end if;
  return old;
end;
$$;

create trigger skipped_weeks_guard
  before insert or delete on public.skipped_weeks
  for each row execute function public.skipped_weeks_guard();

comment on table public.skipped_weeks is
  '휴주. 작성 대상이 아니고 제출률 분모에서 빠지며 streak 을 끊지 않는다. 쓰기는 운영자, 이번 주부터만(트리거).';
