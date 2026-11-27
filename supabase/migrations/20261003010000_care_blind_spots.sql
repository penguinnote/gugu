-- ===========================================================================
-- Step 6 — 돌봄 사각지대 판정 (2026-10-03, 03-metrics §3.1 · 04-schema §4.4)
--
-- 출석률이 가리던 것을 드러내는 함수다. 기록이 있느냐는 신호가 아니다 — 기도제목이 필수라 기록은
-- 늘 있다. 겨누는 것은 "받아 적는 것"과 "관계가 있는 것" 사이의 간극이다.
--
--   창(window)   마감이 지난 최근 4주. 휴주(skipped_weeks)는 빼고 그만큼 더 거슬러 간다.
--                p_week_key 주가 마감(화요일 23:59 KST = 수요일 00:00 KST) 전이면 그 전 주에서 끝난다 —
--                아직 안 쓴 이번 주 때문에 경보가 뜨면 안 된다.
--   접촉 공백    창 안에 1대1 접촉 기록 0건. 자기 자신에 대한 접촉은 저장 시 이미 무효(트리거).
--   목장 공백    창 안에 목장모임 참석 0회. 예배는 조건에 넣지 않는다 — "예배는 오는데 목장은 안 오는
--                사람" 이 이 제품이 겨누는 전형이다.
--   최우선 경보  두 공백이 겹친 사람. 따로 컬럼을 두지 않는다(contact_gap ∧ meeting_gap).
--   단독 연결    contact_leaders = 1. 그 리더가 빠지면 관계가 통째로 끊긴다(03 §3.2).
--
--   기록 범위    그 사람의 **전체 기록** — 다른 목장에서 쓰인 기록도 센다. 목장을 옮겼다고 경보가 뜨면
--                잘못된 신호다. 보고서의 제출 여부는 보지 않는다 — 리더가 적은 접촉은 마감과 무관하게
--                있었던 일이다.
--   대상         persons.status = active ∧ care_status ∈ {active, long_absent}. 리더도 대상이다.
--                휴면·기록 제외·이탈, 군 복무·원거리·주말 근무·타 교회는 결과에 아예 없다.
--   판정 보류    'collecting' — 창 시작이 앱 데이터 시작(가장 이른 주간기록)보다 앞선다. 4주가 안 찼다
--                'new'        — 창 시작 뒤에 등록했다(joined_at). 4주를 다 볼 수 없다
--                둘 다 gap 은 null. 'judged' 만 판정 값이 있다.
--   범위         목사님 전체, 리더는 **현재 소속** 목장 사람만. 운영자·미승인 0행.
--   원문         돌려주지 않는다. 숫자·날짜·참거짓만 — 리더는 "접촉 공백" 이라는 사실만 알고, 근거가 된
--                다른 목장의 기록은 못 본다. 그래서 SECURITY DEFINER 다.
--   저장         하지 않는다. 사람 110명 × 4주라 싸고, 저장하면 어긋날 여지가 생긴다.
-- ===========================================================================

create function public.care_blind_spots(p_week_key date, p_now timestamptz default now())
returns table (
  person_id         uuid,
  group_id          uuid,
  group_role        public.group_role,
  care_status       public.care_status,
  needs_check       boolean,
  state             text,      -- judged · new · collecting
  contact_gap       boolean,   -- judged 일 때만 값이 있다
  meeting_gap       boolean,
  contact_leaders   integer,   -- 창 안에서 1대1 접촉을 기록한 서로 다른 리더 수
  weeks_recorded    integer,   -- 창 안에서 이 사람의 기록이 있는 주 수
  last_contact_week date,      -- 창 끝까지 마지막 1대1 접촉 주 (창 밖 포함)
  last_meeting_week date,
  window_start      date,
  window_end        date
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_end        date;
  v_week       date;
  v_weeks      date[] := '{}';
  v_steps      integer := 0;
  v_start      date;
  v_data_start date;
  v_collecting boolean;
begin
  if extract(dow from p_week_key) <> 0 then
    raise exception '주차는 일요일이어야 합니다.' using errcode = '22023';
  end if;

  -- 마감 전인 주는 창에 넣지 않는다.
  v_end := case
    when p_now < ((p_week_key + 3)::text || ' 00:00:00+09')::timestamptz then p_week_key - 7
    else p_week_key
  end;

  -- 휴주를 건너뛰며 4주를 모은다 (내림차순).
  v_week := v_end;
  while coalesce(array_length(v_weeks, 1), 0) < 4 and v_steps < 520 loop
    v_steps := v_steps + 1;
    if not exists (select 1 from public.skipped_weeks s where s.week_key = v_week) then
      v_weeks := v_weeks || v_week;
    end if;
    v_week := v_week - 7;
  end loop;
  v_start := v_weeks[array_length(v_weeks, 1)];

  select min(wr.week_key) into v_data_start from public.weekly_records wr;
  v_collecting := v_data_start is null or v_start < v_data_start;

  return query
  with scope as (
    select p.id, p.group_id, p.group_role, p.care_status, p.needs_check, p.joined_at, g.number
    from public.persons p
    join public.groups g on g.id = p.group_id
    where p.status = 'active'
      and p.care_status in ('active', 'long_absent')
      and g.status = 'active'
      and (public.is_pastor() or public.is_leader_of(p.group_id))
  ),
  win as (
    select wr.person_id,
           count(distinct wr.week_key)::integer                                     as weeks_recorded,
           count(*) filter (where wr.one_on_one_contacted)::integer                 as contacts,
           count(*) filter (where wr.group_meeting_attended)::integer               as meetings,
           count(distinct wr.author_id) filter (where wr.one_on_one_contacted)::integer as leaders
    from public.weekly_records wr
    where wr.week_key = any (v_weeks)
      and wr.person_id in (select id from scope)
    group by wr.person_id
  ),
  latest as (
    select wr.person_id,
           max(wr.week_key) filter (where wr.one_on_one_contacted)   as last_contact,
           max(wr.week_key) filter (where wr.group_meeting_attended) as last_meeting
    from public.weekly_records wr
    where wr.week_key <= v_weeks[1]
      and wr.person_id in (select id from scope)
    group by wr.person_id
  ),
  judged as (
    select s.*,
           case when v_collecting then 'collecting'
                when s.joined_at > v_start then 'new'
                else 'judged' end as st
    from scope s
  )
  select j.id, j.group_id, j.group_role, j.care_status, j.needs_check, j.st,
         case when j.st = 'judged' then coalesce(w.contacts, 0) = 0 end,
         case when j.st = 'judged' then coalesce(w.meetings, 0) = 0 end,
         coalesce(w.leaders, 0),
         coalesce(w.weeks_recorded, 0),
         l.last_contact,
         l.last_meeting,
         v_start,
         v_weeks[1]
  from judged j
  left join win w on w.person_id = j.id
  left join latest l on l.person_id = j.id
  order by j.number, j.group_role, j.id;
end;
$$;

comment on function public.care_blind_spots(date, timestamptz) is
  '돌봄 사각지대 판정. 마감이 지난 최근 4주(휴주 제외), 그 사람의 전체 기록으로 계산하고 판정 값만 돌려준다. 목사님 전체 · 리더 자기 목장. p_now 는 마감 판정 기준 시각(테스트용).';

revoke execute on function public.care_blind_spots(date, timestamptz) from public, anon, authenticated;
grant  execute on function public.care_blind_spots(date, timestamptz) to authenticated;
