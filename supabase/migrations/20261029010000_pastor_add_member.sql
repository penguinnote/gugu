-- ===========================================================================
-- 목사님도 인원 추가 (2026-10-29)
--
-- 목장 명단의 '인원 추가' 를 목사님도 한다 — 어느 목장이든, 리더와 같은 꼴로(양 · 계정 없음 · 활동 · 목장장 아님).
-- 리더 · 목장장 · 계정 연결은 지금처럼 운영자가 한다. 섬김 부서 넣기(person_ministries_insert)는 원래 목사님도 된다.
-- ===========================================================================

drop policy persons_insert on public.persons;
create policy persons_insert on public.persons for insert to authenticated
  with check (
    public.is_admin()
    or (
      (public.is_leader_of(group_id) or (public.is_pastor() and group_id is not null))
      and group_role = 'member' and user_id is null and status = 'active' and not is_group_head
    )
  );
