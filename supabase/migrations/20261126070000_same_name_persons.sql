-- 보고서 화면 새가족 추가(2026-11-26) — 저장 전에 같은 이름이 명단에 있는지(다른 목장 · 떠난 사람 포함) 알린다.
-- 이름 · 목장 · 상태만 돌려준다(이름 · 소속 목장은 앱 사용자 모두가 본다 — 처리방침). 앱 사용자만.
create or replace function public.same_name_persons(p_name text)
returns table (person_id uuid, group_id uuid, group_name text, status public.person_status)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.group_id, g.name, p.status
    from public.persons p
    left join public.groups g on g.id = p.group_id
   where public.is_app_user()
     and p.name = btrim(coalesce(p_name, ''))
     and btrim(coalesce(p_name, '')) <> ''
   order by (p.status = 'left'), g.name
   limit 20
$$;

comment on function public.same_name_persons(text) is
  '새가족 추가 전 같은 이름 확인 — 이름 · 목장 · 상태만. 2026-11-26.';

revoke execute on function public.same_name_persons(text) from public, anon;
grant  execute on function public.same_name_persons(text) to authenticated;
