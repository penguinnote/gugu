-- ===========================================================================
-- 스탬프를 하나로 (2026-09-28)
--
-- "수고했어요"·"힘내세요" 는 "기도하겠습니다" 와 같은 자리 말이라 고르는 것 자체가 부담이었다.
-- 하나면 고를 게 없고 그냥 누른다.
--
-- enum 은 남긴다 — 나중에 값을 늘리는 건 `alter type ... add value` 한 줄이다. 대신 지금 쓰지
-- 않는 값은 지운다: Postgres 는 enum 값을 지우지 못하므로 타입을 교체한다. 스탬프 데이터가
-- 거의 없는 지금이 정리 비용이 가장 낮다. 이미 찍힌 thanks·cheer 는 '반응이 있었다' 는 사실이
-- 중요하므로 pray 로 옮긴다(지우지 않는다).
--
-- 머문 시간(연타 감지)은 컬럼 추가 없이 잰다 — 상세를 열 때 last_read_at 이 갱신되고 스탬프를
-- 누를 때 stamped_at 이 찍히므로, 같은 방문에서는 stamped_at - last_read_at 이 그 목장에 머문
-- 시간이다. 첫 방문이면 first_read_at 과도 같다. 03 §2.2c.
-- ===========================================================================

drop function public.set_report_stamp(uuid, public.report_stamp);

alter type public.report_stamp rename to report_stamp_old;
create type public.report_stamp as enum ('pray');

update public.report_reviews set stamp = 'pray' where stamp is not null;

alter table public.report_reviews
  alter column stamp type public.report_stamp using stamp::text::public.report_stamp;

drop type public.report_stamp_old;

comment on type public.report_stamp is
  '목사님 스탬프 코드. 지금은 pray 하나 — 문구는 src/lib/labels.ts REPORT_STAMP_LABELS("기도하겠습니다"). 늘리려면 add value.';

create function public.set_report_stamp(p_report_id uuid, p_stamp public.report_stamp)
returns public.report_stamp
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me  uuid := public.current_user_id();
  v_cur public.report_stamp;
  v_new public.report_stamp;
begin
  if not public.is_pastor() then
    raise exception '목사님만 스탬프를 찍을 수 있습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.submitted_at is not null) then
    raise exception '제출된 보고서가 아닙니다.' using errcode = '22023';
  end if;

  insert into public.report_reviews (report_id, reviewer_id)
  values (p_report_id, v_me)
  on conflict (report_id) do nothing;

  select rr.stamp into v_cur from public.report_reviews rr where rr.report_id = p_report_id for update;
  v_new := case when v_cur is not distinct from p_stamp then null else p_stamp end;

  update public.report_reviews
     set stamp = v_new, stamped_at = now()
   where report_id = p_report_id;

  return v_new;
end;
$$;

revoke execute on function public.set_report_stamp(uuid, public.report_stamp) from public, anon, authenticated;
grant  execute on function public.set_report_stamp(uuid, public.report_stamp) to authenticated;
