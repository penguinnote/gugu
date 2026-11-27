-- 프로필의 '훈련 단계' 는 명단 값 그대로(2026-11-16) — 목자 · 목동 · 예비목자반 · 제자반 · 새가족반 · 양.
--   persons_public 에 training_stage 를 덧붙인다(승인된 사용자 모두가 프로필에서 본다). course 칸은 남겨 둔다(보기에서 칸은 뺄 수 없다 — 쓰지 않는다).
create or replace view public.persons_public
with (security_invoker = false) as
select p.id, p.name, p.gender, p.group_id, p.group_role, p.is_group_head,
  case p.training_stage
    when '새가족반' then 'newcomer' when '제자반' then 'disciple' when '예비목자반' then 'pre_shepherd'
    when '목자' then 'leader' when '목동' then 'leader'
  end::text as course,
  p.training_stage
from public.persons p
where p.status <> 'left'
  and public.is_app_user();
