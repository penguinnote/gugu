-- 목사님 '아직 한마디를 안 남긴 목장보고서'(2026-11-26 사용자 결정) — 제출됐고 스탬프가 없는 보고서를 최근 주부터.
-- 기간 제한은 없다(set_report_stamp 에도 기한이 없다). 화면은 나눠 부른다(p_limit · p_offset). total 은 전체 수.
-- 목사님만 — 다른 사람에게는 빈 결과.
create or replace function public.unstamped_reports(p_limit integer default 10, p_offset integer default 0)
returns table (report_id uuid, week_key date, group_id uuid, group_name text, submitted_at timestamptz, is_late boolean, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.week_key, r.group_id, g.name, r.submitted_at, r.is_late, count(*) over ()
    from public.reports r
    join public.groups g on g.id = r.group_id
    left join public.report_reviews rr on rr.report_id = r.id
   where public.is_pastor()
     and r.submitted_at is not null
     and rr.stamp is null
   order by r.week_key desc, g.name
   limit greatest(1, least(coalesce(p_limit, 10), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

comment on function public.unstamped_reports(integer, integer) is
  '목사님 — 제출됐고 한마디(스탬프)가 없는 보고서, 최근 주부터 나눠서. 2026-11-26.';

revoke execute on function public.unstamped_reports(integer, integer) from public, anon, authenticated;
grant  execute on function public.unstamped_reports(integer, integer) to authenticated;
