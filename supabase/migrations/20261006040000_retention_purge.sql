-- ===========================================================================
-- Step 9c — 2년 보관 자동 정리 (2026-10-06)
--
-- 07 §0 공지: "기록은 2년이 지나면 정리합니다." 2026-09-29 에 약속을 데이터로 박았고(app_meta.retention_months,
-- records_past_retention), 이번에 실제로 지운다. 첫 만료는 2028년 10월이라 그 전까지는 매달 0건을 지운다.
--
-- 1) retention_cutoff() — 기준 주차 하나. "오늘(KST)로부터 retention_months 전 날짜가 속한 주의 일요일".
--    그 주차부터는 남고, 그 전 주차가 만료다. 전에는 records_past_retention 이 일요일이 아닌 날짜를 기준으로
--    썼다(2024-10-04 같은) — 주차 키는 일요일이므로 일요일로 맞춘다. 기준이 최대 6일 앞당겨져 덜 지우는 쪽이다.
--
-- 2) purge_expired_records() — 만료 주차의 주간기록·보고서를 지운다. 보고서에 딸린 확인(report_reviews)·
--    현재 열람·코멘트는 cascade, 이벤트·내보내기 로그의 보고서 참조는 null 로 남는다(행동 로그는 기록 본문이
--    아니다). 지운 수와 시각을 app_meta 에 남겨 운영 홈이 "마지막 정리" 로 보여준다.
--    **앱 사용자는 실행하지 못한다** — 운영자도. 지우는 버튼이 화면에 생기면 안 된다. pg_cron(postgres)과
--    서버 키만 부른다.
--
-- 3) pg_cron — 매월 1일 18:00 UTC(= 2일 03:00 KST). 확장이 없는 곳(로컬 PGlite 테스트)에서는 건너뛴다.
--    job_run_details 는 월 1행이라 따로 비우지 않는다.
-- ===========================================================================

create function public.retention_cutoff()
returns date
language sql stable security definer set search_path = ''
as $$
  select (d - extract(dow from d)::int)::date
  from (
    select ((now() at time zone 'Asia/Seoul')::date
            - make_interval(months => coalesce((select value::int from public.app_meta where key = 'retention_months'), 24)))::date as d
  ) t
$$;

comment on function public.retention_cutoff() is
  '보관 기준 주차(일요일). 이 주차부터 남고 그 전이 만료. retention_months 전 날짜가 속한 주의 일요일 — KST.';

revoke execute on function public.retention_cutoff() from public, anon, authenticated;

-- 같은 기준을 쓰도록 바꾼다. 시그니처·권한(운영자·목사님)은 그대로.
create or replace function public.records_past_retention()
returns table (cutoff_week date, expired_records bigint, expired_reports bigint)
language sql stable security definer set search_path = ''
as $$
  select c.cutoff,
         (select count(*) from public.weekly_records w where w.week_key < c.cutoff),
         (select count(*) from public.reports r where r.week_key < c.cutoff)
  from (select public.retention_cutoff() as cutoff) c
  where public.is_admin() or public.is_pastor()
$$;

create function public.purge_expired_records()
returns table (deleted_records bigint, deleted_reports bigint)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_cutoff  date := public.retention_cutoff();
  v_records bigint;
  v_reports bigint;
begin
  -- 실행 권한을 거둬 두었지만, 앱 세션으로 들어온 호출은 이름이 무엇이든 한 번 더 막는다.
  if public.current_user_id() is not null then
    raise exception '보관 정리는 예약 작업만 실행합니다.' using errcode = '42501';
  end if;

  delete from public.weekly_records where week_key < v_cutoff;
  get diagnostics v_records = row_count;

  delete from public.reports where week_key < v_cutoff;
  get diagnostics v_reports = row_count;

  insert into public.app_meta (key, value) values
    ('retention_last_run', now()::text),
    ('retention_last_deleted', format('records=%s reports=%s', v_records, v_reports))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return query select v_records, v_reports;
end;
$$;

comment on function public.purge_expired_records() is
  '2년 보관 정리 — retention_cutoff() 이전 주차의 주간기록·보고서 삭제, app_meta 에 마지막 정리 기록. pg_cron 매월. 앱 사용자 실행 불가.';

revoke execute on function public.purge_expired_records() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron — 매월 1일 18:00 UTC (2일 03:00 KST)
-- ---------------------------------------------------------------------------

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';
    execute $q$select cron.schedule('purge-expired-records', '0 18 1 * *', 'select public.purge_expired_records()')$q$;
  end if;
end
$do$;
