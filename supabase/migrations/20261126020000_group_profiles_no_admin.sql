-- 운영자의 목장 프로필 고치기 없애기(2026-11-26 사용자 결정) — 화면(canEditProfile)과 같게 쓰기 정책에서 운영자를 뺀다.
-- 운영자 겸 리더는 is_leader_of 로 자기 목장만 고친다. 목사님은 그대로. 지우기(delete) 정책은 손대지 않는다.
-- 내보내기 기록(export_logs) 읽기는 처음부터 목사님 · 운영자라 고칠 것이 없다(화면만 목사님에게 연다).
drop policy if exists group_profiles_insert on public.group_profiles;
create policy group_profiles_insert on public.group_profiles for insert to authenticated
  with check (public.is_leader_of(group_id) or public.is_pastor());

drop policy if exists group_profiles_update on public.group_profiles;
create policy group_profiles_update on public.group_profiles for update to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor())
  with check (public.is_leader_of(group_id) or public.is_pastor());
