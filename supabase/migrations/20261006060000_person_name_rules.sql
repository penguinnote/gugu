-- ===========================================================================
-- Step 11 새 사람 등록 — 이름 규칙을 DB 가 지킨다 (2026-10-06)
--
-- 명단 도입(scripts/lib/roster.mjs)은 같은 목장 동명이인과 빈 이름을 거부했다. 앱이 명단의 진실이 된 뒤
-- (08 Step 9 결정 ②) 사람은 운영자 화면에서 등록·이동된다 — 같은 규칙을 DB 에 둔다.
--
--   persons_unique_name_in_group  같은 목장 안에 같은 이름은 하나. 이탈(left)은 빼고 센다 — 떠난 사람과 같은
--                                 이름은 다시 등록할 수 있다. 출생년도가 달라도 거부한다(2026-10-06 결정) —
--                                 정말 같은 이름이면 구분 표시를 붙여 등록한다. 등록과 9b 의 목장 이동 둘 다 걸린다.
--   persons_name_ck               앞뒤 공백 없이 1~20자.
-- 2026-10-06 원격 확인: 같은 목장 안 중복 0건, 앞뒤 공백 0건, 최장 10자.
-- ===========================================================================

create unique index persons_unique_name_in_group
  on public.persons (group_id, name)
  where status <> 'left';

alter table public.persons
  add constraint persons_name_ck check (name = btrim(name) and char_length(name) between 1 and 20);

comment on column public.persons.name is
  '이름. 앞뒤 공백 없이 1~20자(persons_name_ck). 같은 목장 안에서 유일 — 이탈자 제외(persons_unique_name_in_group).';
