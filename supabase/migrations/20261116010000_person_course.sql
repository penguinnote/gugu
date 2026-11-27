-- 교육과정(2026-11-16) — 사람마다 어디까지 배웠나: 새가족반 · 제자반 · 예비목자반 · 리더. 프로필 화면의 숫자 칸('식구' 자리)에 보인다.
--   적는 사람: 운영자(사람 고치기 화면). 비어 있으면 화면에는 '—'.
--   persons_public(전체 명단 · 프로필용 보기)에 칸을 하나 덧붙인다 — 승인된 사용자 모두가 프로필에서 본다.
alter table public.persons add column course text
  check (course is null or course in ('newcomer', 'disciple', 'pre_shepherd', 'leader'));
comment on column public.persons.course is '교육과정: newcomer 새가족반 · disciple 제자반 · pre_shepherd 예비목자반 · leader 리더. null 이면 아직 적지 않음(2026-11-16).';
grant update (course) on public.persons to authenticated; -- 누가 고칠 수 있는 줄인지는 RLS 가 본다(자기 목장 리더 · 목사님 · 운영자)

create or replace view public.persons_public
with (security_invoker = false) as
select p.id, p.name, p.gender, p.group_id, p.group_role, p.is_group_head, p.course
from public.persons p
where p.status <> 'left'
  and public.is_app_user();
