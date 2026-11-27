-- ===========================================================================
-- Step 6 — 연속 제출(streak) (2026-09-29)
--
-- 종이 보고서가 넉 달 만에 멈췄다. 리더가 계속 쓸 이유가 없었기 때문이다. streak 은 그 자리를
-- 메우는 장치다. 순위·랭킹은 만들지 않는다 — 12개 목장 순위를 리더 41명이 다 보면 매주 꼴찌가
-- 생기고, 교회에서 그건 동기부여가 아니라 수치심이 된다. 동력은 "내가 쌓은 걸 깨기 싫다" 다.
--
--   단위     목장. 제출이 목장 단위이고 보조 리더가 번갈아 내므로 개인 streak 이면 아무도 못 쌓는다.
--   계산     마감(화요일 23:59 KST = 수요일 00:00 KST 전) 안에 제출한 주가 연속으로 이어진 수.
--            · 마감 후 제출(is_late)은 반영되지 않는다 — 끊는다
--            · 휴주(skipped_weeks)는 건너뛰고 유지한다 — 제출 대상이 아닌 주에 끊기면 안 된다
--            · p_week_key 주가 아직 마감 전이고 미제출이면 '대기' — 끊지도 세지도 않는다
--   저장     하지 않는다. 12목장 × 주차라 비용이 싸고, 저장하면 어긋날 여지가 생긴다.
--   범위     목사님은 전체, 리더는 자기 목장만. 운영자·미승인은 0행. 남의 목장 streak 은 없다.
--   freeze   지금 없다 (상점, Phase 3).
-- ===========================================================================

create function public.group_streaks(p_week_key date, p_now timestamptz default now())
returns table (
  group_id         uuid,
  streak           integer,
  current_included boolean,  -- p_week_key 주가 정시 제출로 셈에 들어갔는가
  ever_on_time     boolean,  -- 정시 제출이 한 번이라도 있었는가 (첫 주 문구 판단)
  broken           boolean   -- 정시 제출이 있었는데 지금 streak 이 0 인가 ("이번 주부터 다시")
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g          record;
  v_week     date;
  v_deadline timestamptz;
  v_streak   integer;
  v_current  boolean;
  v_ever     boolean;
  v_on_time  boolean;
  v_oldest   date;
  v_steps    integer;
begin
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;

  for g in
    select gr.id from public.groups gr
    where gr.status = 'active'
      and (public.is_pastor() or public.is_leader_of(gr.id))
    order by gr.number
  loop
    v_streak  := 0;
    v_current := false;
    v_week    := p_week_key;
    v_steps   := 0;

    -- 정시 제출이 있었던 적이 있는가 (첫 주 판단용). 휴주에 낸 것은 세지 않는다.
    select exists (
      select 1 from public.reports r
      where r.group_id = g.id and r.submitted_at is not null and not r.is_late
        and r.week_key <= p_week_key
        and not exists (select 1 from public.skipped_weeks s where s.week_key = r.week_key)
    ) into v_ever;

    -- 이 목장의 가장 오래된 보고서 주차 — 그 전은 세지 않는다 (앱 도입 전)
    select min(r.week_key) into v_oldest from public.reports r where r.group_id = g.id;

    while v_oldest is not null and v_week >= v_oldest and v_steps < 520 loop
      v_steps := v_steps + 1;

      -- 휴주: 건너뛰고 유지
      if exists (select 1 from public.skipped_weeks s where s.week_key = v_week) then
        v_week := v_week - 7;
        continue;
      end if;

      select (r.submitted_at is not null and not r.is_late) into v_on_time
      from public.reports r where r.group_id = g.id and r.week_key = v_week;

      if coalesce(v_on_time, false) then
        v_streak := v_streak + 1;
        if v_week = p_week_key then v_current := true; end if;
        v_week := v_week - 7;
        continue;
      end if;

      -- 정시 제출이 아니다. 마감 전인 주면 '대기' — 끊지 않고 그 전 주부터 센다.
      v_deadline := ((v_week + 3)::text || ' 00:00:00+09')::timestamptz;
      if p_now < v_deadline then
        v_week := v_week - 7;
        continue;
      end if;

      -- 마감이 지났는데 정시 제출이 없다 — 여기서 끊긴다.
      exit;
    end loop;

    group_id         := g.id;
    streak           := v_streak;
    current_included := v_current;
    ever_on_time     := coalesce(v_ever, false);
    broken           := coalesce(v_ever, false) and v_streak = 0;
    return next;
  end loop;
end;
$$;

comment on function public.group_streaks(date, timestamptz) is
  '목장별 연속 정시 제출 주 수. 저장하지 않고 계산한다. 목사님은 전체, 리더는 자기 목장. p_now 는 마감 판정 기준 시각(테스트용).';

revoke execute on function public.group_streaks(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.group_streaks(date, timestamptz) to authenticated;
