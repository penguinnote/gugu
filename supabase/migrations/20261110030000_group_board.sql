-- ===========================================================================
-- '기록' 탭 — 모든 목장의 연속 제출 · 열매 (2026-11-10)
--
--   사용자 결정(2026-11-10) — 정보 탭을 빼고 그 자리에 '기록' 탭을 둔다. 목장마다 몇 주 연속 제출 중인지, 열매가 몇 개인지를
--   **모든 앱 사용자에게** 보여 준다. 2026-09-29 의 "목장 간 순위는 만들지 않는다"(01 §8 · 03 §2.4)를 사용자가 바꿨다
--   ("꼴찌가 생긴다"는 걱정을 알리고 '우리 목장만' · '좋은 소식만' 과 견준 뒤 '모든 목장 공개' 를 골랐다).
--   화면은 순위 숫자를 붙이지 않고 목장 번호 순으로 늘어놓는다.
--
--   group_board(p_week_key, p_now)  앱 사용자(리더 · 목사님 · 운영자 · 임원진) 누구나. 활동 중인 목장(특별 자리 101 · 102 는 뺀다)마다
--       group_id · number · name · streak(연속 정시 제출 주 수, group_streaks 와 같은 규칙) · berries(열매 잔액)
--   보고서 본문 · 기도제목 · 출석은 돌려주지 않는다 — 숫자 두 개뿐.
--   group_streaks 는 그대로 둔다(리더는 자기 목장만 — 홈 · 지난 보고서 화면이 그 모양을 믿는다).
--
--   _group_streak(group, week, now)  group_streaks 의 한 목장 셈을 떼어 낸 것(같은 규칙: 마감 후 제출은 끊고, 휴주 · 쿠폰 주는
--   건너뛰고, 마감 전 미제출은 '대기'). 내부용 — 직접 부를 수 없다.
-- ===========================================================================

create function public._group_streak(p_group uuid, p_week_key date, p_now timestamptz)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_week    date := p_week_key;
  v_streak  integer := 0;
  v_steps   integer := 0;
  v_on_time boolean;
  v_oldest  date;
begin
  select min(r.week_key) into v_oldest from public.reports r where r.group_id = p_group;

  while v_oldest is not null and v_week >= v_oldest and v_steps < 520 loop
    v_steps := v_steps + 1;

    -- 휴주 · 쿠폰으로 지킨 주: 건너뛰고 유지
    if exists (select 1 from public.skipped_weeks s where s.week_key = v_week)
       or exists (select 1 from public.world_streak_freezes f where f.group_id = p_group and f.week_key = v_week) then
      v_week := v_week - 7;
      continue;
    end if;

    select (r.submitted_at is not null and not r.is_late) into v_on_time
    from public.reports r where r.group_id = p_group and r.week_key = v_week;

    if coalesce(v_on_time, false) then
      v_streak := v_streak + 1;
      v_week := v_week - 7;
      continue;
    end if;

    -- 아직 마감 전인 미제출은 '대기' — 끊지 않고 그 앞 주부터 센다
    if p_now < public._world_deadline(v_week) then
      v_week := v_week - 7;
      continue;
    end if;

    exit;
  end loop;

  return v_streak;
end;
$$;

revoke execute on function public._group_streak(uuid, date, timestamptz) from public, anon, authenticated;
comment on function public._group_streak(uuid, date, timestamptz) is
  '한 목장의 연속 정시 제출 주 수 — group_streaks 와 같은 규칙(2026-11-10). 내부용(group_board 가 부른다).';

create function public.group_board(p_week_key date, p_now timestamptz default now())
returns table (
  group_id uuid,
  number   integer,
  name     text,
  streak   integer,
  berries  integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_user() then
    raise exception '승인된 사용자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;

  return query
    select gr.id,
           gr.number,
           gr.name,
           public._group_streak(gr.id, p_week_key, p_now),
           coalesce((select sum(l.delta) from public.world_ledger l where l.group_id = gr.id), 0)::integer
    from public.groups gr
    where gr.status = 'active'
    order by gr.number;
end;
$$;

revoke execute on function public.group_board(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.group_board(date, timestamptz) to authenticated;
comment on function public.group_board(date, timestamptz) is
  '기록 탭 — 활동 중인 목장마다 연속 정시 제출 주 수 · 열매 잔액. 앱 사용자 누구나(2026-11-10 사용자 결정 — 목장 간 공개). 순위는 화면도 붙이지 않는다.';
