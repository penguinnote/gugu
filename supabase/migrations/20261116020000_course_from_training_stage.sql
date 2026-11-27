-- 교육과정은 명단의 훈련단계에서(2026-11-16) — 어제 넣은 persons.course 는 이미 있던 훈련단계(persons.training_stage:
--   목자 · 목동 · 예비목자반 · 제자반 · 새가족반 · 양, 목장 명단 화면에서 고친다)와 같은 정보라 한 곳으로 모은다.
--   프로필이 읽는 persons_public.course 는 이름 · 형(text)을 그대로 두고 훈련단계에서 셈한다: 목자 · 목동 → leader(리더), 양 · 빈칸 → null.
--   그런 뒤 persons.course 를 지운다(아무도 쓰지 않는다 — 운영 화면의 칸은 코드에서 먼저 뺐다).
create or replace view public.persons_public
with (security_invoker = false) as
select p.id, p.name, p.gender, p.group_id, p.group_role, p.is_group_head,
  case p.training_stage
    when '새가족반' then 'newcomer' when '제자반' then 'disciple' when '예비목자반' then 'pre_shepherd'
    when '목자' then 'leader' when '목동' then 'leader'
  end::text as course
from public.persons p
where p.status <> 'left'
  and public.is_app_user();

alter table public.persons drop column course;
