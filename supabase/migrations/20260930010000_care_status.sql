-- ===========================================================================
-- 명단 정제 + 상태 태그 — 사각지대 사전 작업 (2026-09-30)
--
-- 명단의 '청년대학부 회원'(O/빈칸)은 8주 연속 출석의 결과다. 사각지대의 **첫 기준점**으로 딱 한 번만
-- 쓴다. DB 에 회원 개념을 넣지 않는다. 학기·정산 개념도 넣지 않는다. import 시점에 상태 태그와
-- needs_check 로 변환하고 회원 컬럼은 버린다(scripts/lib/roster.mjs).
--
--   care_status   판정 대상/제외. 기존 persons.status(활동·휴면·기록 제외·이탈)와는 다른 축이다 —
--                 status 는 앱에서의 존재 여부, care_status 는 돌봄 판정에서의 위치.
--     active        재적 — 사각지대 판정 대상
--     military      군 복무 — 제외
--     remote        원거리·해외 — 제외
--     weekend_work  주말 근무 — 제외 (온라인 참여)
--     other_church  타 교회 출석 — 제외
--     long_absent   장기 미출석 — 판정 대상, 별도 표시
--   needs_check   1회성 플래그. 도입 시 (care_status ∈ {active, long_absent}) ∧ 회원 빈칸 → true.
--                 null 은 '아직 판정 안 함'. 재도입은 null 인 행에만 쓴다 — 리더가 확인해 내린 값은
--                 되돌리지 않는다. 사각지대(Step 6)가 이 플래그를 첫 화면의 출발점으로 쓴다.
-- ===========================================================================

create type public.care_status as enum ('active', 'military', 'remote', 'weekend_work', 'other_church', 'long_absent');

alter table public.persons
  add column care_status public.care_status not null default 'active',
  add column needs_check boolean;

comment on column public.persons.care_status is
  '돌봄 판정 축. active·long_absent 는 사각지대 판정 대상, military·remote·weekend_work·other_church 는 제외. 명단 도입 설정(data/roster.config.json)으로만 지정한다 — 비고 자동 파싱 없음.';
comment on column public.persons.needs_check is
  '1회성. 도입 시 회원 컬럼(8주 연속 출석)이 빈칸인 판정 대상에게 true. null = 아직 판정 안 함. 재도입은 null 인 행에만 쓴다 — 리더가 확인한 값을 되돌리지 않는다.';

create index persons_needs_check_idx on public.persons (group_id) where needs_check;
