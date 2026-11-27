-- ===========================================================================
-- AI 주간 정리는 목사님이 요청할 때만(2026-11-08)
--
--   전에는 목사님이 마감(화 23:59)이 지난 주를 열면 저절로 만들었다. 이제 목사님 홈의 'AI 정리 만들기' 단추로만 만든다.
--   마감 전에도 만들 수 있다 — 제출된 보고서가 하나라도 있으면. 나중에 들어온 보고서는 다시 만들기(한 주 3번)로 넣는다.
--   이번 주보다 뒤의 주는 여전히 막는다.
-- ===========================================================================

create or replace function public.digest_claim(p_week date)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.pastor_digests;
begin
  if not public.is_pastor() then raise exception '목사님만 만들 수 있습니다.' using errcode = '42501'; end if;
  if p_week is null or extract(isodow from p_week) <> 7 then raise exception '주 시작일(일요일)이 아닙니다.' using errcode = '22023'; end if;
  -- 이번 주까지만(2026-11-08 — 마감 검사를 풀었다)
  if p_week > public.kst_current_week() then raise exception '이번 주까지만 정리합니다.' using errcode = '22023'; end if;
  -- 제출된 보고서가 없는 주는 빈 정리를 남기지 않는다
  if not exists (
    select 1 from public.reports r join public.groups g on g.id = r.group_id and g.status = 'active'
     where r.week_key = p_week and r.submitted_at is not null
  ) then
    return false;
  end if;
  insert into public.pastor_digests (week_key, created_by) values (p_week, public.current_user_id())
    on conflict (week_key) do nothing;
  if found then return true; end if;
  select * into v_row from public.pastor_digests where week_key = p_week for update;
  if (v_row.status = 'pending' and v_row.updated_at < now() - interval '5 minutes')
     or (v_row.status = 'failed' and v_row.updated_at < now() - interval '10 minutes') then
    update public.pastor_digests
       set status = 'pending', fail_reason = null, created_by = public.current_user_id(), updated_at = now()
     where week_key = p_week;
    return true;
  end if;
  return false;
end;
$$;

-- 운영 카드도 이번 주까지 — 마감 전에 만든 이번 주 정리도 보이게
create or replace function public.digest_health()
returns table (
  week_key date, skipped boolean, status text, fail_reason text, dropped integer,
  report_count integer, group_count integer, generated_at timestamptz, regen_count integer
)
language sql stable security definer set search_path = '' as $$
  select w.week_key,
         exists (select 1 from public.skipped_weeks s where s.week_key = w.week_key),
         d.status, d.fail_reason,
         case when jsonb_typeof(d.content -> 'dropped') = 'number' then (d.content ->> 'dropped')::integer end,
         d.report_count, d.group_count, d.generated_at, coalesce(d.regen_count, 0)
    from (select (public.kst_current_week() - 7 * i)::date as week_key from generate_series(0, 3) as i) w
    left join public.pastor_digests d on d.week_key = w.week_key
   where public.is_admin()
   order by w.week_key desc
$$;
comment on function public.digest_health() is 'AI 정리 운영 카드(2026-11-08) — 운영자만, 이번 주부터 4주의 상태 · 실패 까닭 · 버린 수. 내용은 없다.';
