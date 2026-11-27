-- ===========================================================================
-- 이번 주 제출 수(2026-11-13) — 운영자 홈 카드(B안)가 '12목장 중 7곳 제출' 을 그린다.
--   운영자는 reports 를 못 읽는다(목사님 · 그 목장 리더만). 그래서 숫자 두 개만 돌려주는 함수 — 보고서 본문 · 어느 목장인지는 없다.
--   group_board(연속 제출 · 열매)처럼 앱 사용자 누구나. 세는 법은 목사님 홈(loadPastorWeek)과 같다 — 활동 중 목장, submitted_at 이 있는 것.
-- ===========================================================================

create function public.week_submission_count(p_week_key date)
returns table (total integer, submitted integer)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.groups g where g.status = 'active')::integer,
    (select count(*) from public.reports r
       join public.groups g on g.id = r.group_id and g.status = 'active'
      where r.week_key = p_week_key and r.submitted_at is not null)::integer
  where public.is_app_user()
$$;

comment on function public.week_submission_count(date) is
  '그 주 활동 목장 수와 제출한 목장 수 — 숫자만. 앱 사용자 누구나(2026-11-13 운영자 홈).';

revoke execute on function public.week_submission_count(date) from public, anon;
grant  execute on function public.week_submission_count(date) to authenticated;
