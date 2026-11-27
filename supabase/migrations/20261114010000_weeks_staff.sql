-- ===========================================================================
-- 휴주는 운영자 · 목사님 · 임원진이 정한다(2026-11-14 사용자 결정).
--   보고서의 '이번 주 목장 모임 없음' 단추를 뺐다 — 쉬는 주는 목장마다가 아니라 휴주로 한 번에. 그래서 정할 사람을 넓힌다.
--   예전: 운영자만. 이번 주 · 앞으로만, 마감 지난 주는 못 바꾸는 규칙(skipped_weeks_guard)은 그대로.
-- ===========================================================================

create function public.can_manage_weeks()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or public.is_pastor() or public.is_officer()
$$;
comment on function public.can_manage_weeks() is '휴주를 정할 수 있는가 — 운영자 · 목사님 · 임원진(리더 겸 임원진 포함, 2026-11-14).';
revoke execute on function public.can_manage_weeks() from public, anon;
grant  execute on function public.can_manage_weeks() to authenticated;

drop policy skipped_weeks_insert on public.skipped_weeks;
drop policy skipped_weeks_update on public.skipped_weeks;
drop policy skipped_weeks_delete on public.skipped_weeks;

create policy skipped_weeks_insert on public.skipped_weeks for insert to authenticated
  with check (public.can_manage_weeks());
create policy skipped_weeks_update on public.skipped_weeks for update to authenticated
  using (public.can_manage_weeks()) with check (public.can_manage_weeks());
create policy skipped_weeks_delete on public.skipped_weeks for delete to authenticated
  using (public.can_manage_weeks());
