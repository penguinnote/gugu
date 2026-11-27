-- ===========================================================================
-- 07 §0 도입 공지의 두 약속을 앱이 지키게 한다 (2026-09-29)
--
--   "기록되기를 원하지 않는 분은 목장 리더나 목사님께 편하게 말씀해 주세요."
--   "기록은 2년이 지나면 정리합니다."
--
-- 1) persons.status = 'opted_out' — 목장에는 계속 오는데 앱에만 없는 상태.
--    'left'(떠난 사람)·'dormant'(휴면)와 섞지 않는다. 기존 정책·함수는 전부 status = 'active'
--    를 기준으로 하므로, 이 값 하나로 보고서 작성 명단·완결성 검사·행 저장에서 자동으로 빠진다.
--    이유를 담는 컬럼은 두지 않는다 — 리더 화면에 "이분은 기록을 원하지 않으십니다" 가 뜨면
--    그것 자체가 낙인이다. 조용히 빠지고, 운영자가 리더에게 따로 말한다(09 §1.5).
--    바꾸는 경로는 운영자 전용 함수 하나. 과거 기록 처리는 별도 결정(09 §1.5).
--
-- 2) 보관 기간은 데이터로 박아 둔다 — app_meta.retention_months = 24. 삭제 자체는 Step 9 에서
--    붙이지만(pg_cron), 약속이 사람 기억이 아니라 DB 와 로드맵에 있어야 지켜진다.
--    records_past_retention() 이 지금 만료된 기록 수를 돌려준다 — 운영자 월간 점검(09 §1.6).
-- ===========================================================================

alter type public.person_status add value if not exists 'opted_out' after 'dormant';

comment on type public.person_status is
  'active 활동 · dormant 휴면 · opted_out 기록 제외(목장에는 오지만 앱에 기록하지 않음 — 본인 요청) · left 이탈';

create function public.set_person_recording(p_person_id uuid, p_recording boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_status public.person_status;
begin
  if not public.is_admin() then
    raise exception '운영자만 기록 제외를 바꿀 수 있습니다.' using errcode = '42501';
  end if;

  select p.status into v_status from public.persons p where p.id = p_person_id for update;
  if not found then
    raise exception '명단에 없는 사람입니다.' using errcode = '22023';
  end if;

  if not p_recording then
    if v_status <> 'active' then
      raise exception '활동 중인 사람만 기록 제외로 바꿀 수 있습니다 (현재: %).', v_status using errcode = '22023';
    end if;
    update public.persons set status = 'opted_out' where id = p_person_id;
  else
    if v_status <> 'opted_out' then
      raise exception '기록 제외 상태가 아닙니다 (현재: %).', v_status using errcode = '22023';
    end if;
    update public.persons set status = 'active' where id = p_person_id;
  end if;
end;
$$;

comment on function public.set_person_recording(uuid, boolean) is
  '기록 제외 켜기/끄기. 운영자만. false = 활동→기록 제외, true = 기록 제외→활동. 과거 기록은 건드리지 않는다.';

-- ---------------------------------------------------------------------------
-- 2년 보관
-- ---------------------------------------------------------------------------

insert into public.app_meta (key, value) values ('retention_months', '24')
  on conflict (key) do update set value = excluded.value, updated_at = now();

create function public.records_past_retention()
returns table (cutoff_week date, expired_records bigint, expired_reports bigint)
language sql stable security definer set search_path = ''
as $$
  with m as (
    select (date_trunc('week', (now() at time zone 'Asia/Seoul')::date + 1)::date - 1
            - (coalesce((select value::int from public.app_meta where key = 'retention_months'), 24) * interval '1 month'))::date as cutoff
  )
  select m.cutoff,
         (select count(*) from public.weekly_records w where w.week_key < m.cutoff),
         (select count(*) from public.reports r where r.week_key < m.cutoff)
  from m
  where public.is_admin() or public.is_pastor()
$$;

comment on function public.records_past_retention() is
  '보관 기간(app_meta.retention_months)이 지난 주간기록·보고서 수. 운영자·목사님. 삭제는 Step 9 에서(pg_cron).';

revoke execute on function
  public.set_person_recording(uuid, boolean), public.records_past_retention()
from public, anon, authenticated;

grant execute on function
  public.set_person_recording(uuid, boolean), public.records_past_retention()
to authenticated;
