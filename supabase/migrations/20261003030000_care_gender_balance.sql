-- ===========================================================================
-- Step 6 — 성별 수급 균형 (2026-10-03, 03-metrics §3.4)
--
-- 1대1 돌봄은 동성끼리다. 형제 청년이 넷인데 형제 리더가 없는 목장은 구조적으로 접촉 공백을
-- 만든다 — 사각지대가 결과라면 이건 원인 쪽이다. 학기·인사 때 리더 배치를 정하는 데 쓴다.
--
--   청년      group_role = member ∧ status = active ∧ care_status ∈ {active, long_absent}
--             (사각지대와 같은 판정 대상). 리더는 리더끼리 돌보므로 분자에 넣지 않는다
--   리더      group_role = leader ∧ status = active ∧ care_status ∈ {active, long_absent}. 명단 기준 —
--             계정 유무와 무관. 군 복무·원거리 리더는 지금 돌볼 수 없으니 뺀다
--   per_leader 청년 ÷ 동성 리더. 리더가 0 이면 null
--   alert     no_leader — 동성 청년이 있는데 동성 리더가 0 (지표가 아니라 경보)
--             overload  — 1인당 6 이상
--   기록      보지 않는다. 명단 구성만 — 창도 집계 중도 없다
--   범위      목사님·운영자 전체(운영자가 명단·리더 배치를 맡는다, Step 9·11), 리더 자기 목장, 미승인 0행.
--             숫자만 — 이름은 명단 화면의 일이다
-- ===========================================================================

create function public.care_gender_balance()
returns table (
  group_id   uuid,
  gender     public.gender,
  members    integer,
  leaders    integer,
  per_leader numeric,
  alert      text       -- no_leader · overload · null
)
language sql stable security definer set search_path = ''
as $$
  with grp as (
    select g.id, g.number from public.groups g
    where g.status = 'active'
      and (public.is_pastor() or public.is_admin() or public.is_leader_of(g.id))
  ),
  cells as (
    select grp.id, grp.number, s.gender
    from grp cross join (values ('male'::public.gender), ('female'::public.gender)) as s(gender)
  ),
  counts as (
    select c.id, c.number, c.gender,
           count(*) filter (where p.group_role = 'member')::integer as n_members,
           count(*) filter (where p.group_role = 'leader')::integer as n_leaders
    from cells c
    left join public.persons p
      on p.group_id = c.id and p.gender = c.gender
     and p.status = 'active' and p.care_status in ('active', 'long_absent')
    group by c.id, c.number, c.gender
  )
  select id, gender, n_members, n_leaders,
         case when n_leaders > 0 then round(n_members::numeric / n_leaders, 2) end,
         case when n_leaders = 0 and n_members > 0 then 'no_leader'
              when n_leaders > 0 and n_members::numeric / n_leaders >= 6 then 'overload' end
  from counts
  order by number, gender;  -- 목장 번호 순, 형제 먼저 (enum 선언 순서 male < female)
$$;

comment on function public.care_gender_balance() is
  '목장 × 성별 — 동성 리더 1인당 청년 수. 동성 리더 0 이면 no_leader, 6 이상이면 overload. 명단만 본다. 목사님·운영자 전체 · 리더 자기 목장.';

revoke execute on function public.care_gender_balance() from public, anon, authenticated;
grant  execute on function public.care_gender_balance() to authenticated;
