-- ===========================================================================
-- Ninetynine 시드 데이터 (개발·테스트용)
-- ===========================================================================
--
-- ⚠️  이 파일의 모든 이름은 가명이다. 실제 교인의 이름·생년월일·기도제목은
--     단 한 건도 들어 있지 않으며, 앞으로도 넣지 않는다. 이 파일은 GitHub 에 올라간다.
--
-- 규모 — 목장 12개, 사람 80명(리더 41 · 청년 39), 4주치 주간기록 320건
--
-- 주차는 실행 시점 기준이다. 가장 최근 일요일이 w3, 거슬러 w0(4주 전)까지.
--
-- 사각지대 테스트 케이스 (04-schema §4.4, 03-metrics §3)
--   · 서다온 (3목장)  — 4주간 1대1 접촉 0건. 예배·목장 출석은 완벽하다.
--   · 오시온 (7목장)  — 4주간 목장모임 참석 0회. 예배에는 계속 나온다.
--   · 차사랑 (11목장) — 접촉 2회가 전부 반석호 한 명. 단독 연결.
--   · 권다움 (3목장)  — w0 을 본인이 작성하며 자기 접촉을 체크했다 → 트리거가 false 로 만든다.
--
-- 모든 기도제목과 나눔은 목장 안에서만 다룬다. 목사님은 전체를 보신다. 민감 표시 같은 것은 없다.
--
-- 앱 계정
--   · 목사님 임찬양 · 운영자 정다슬 (명단 밖)
--   · 리더 40명 연결 (role = leader). 3목장 류지호만 계정 없음 — 신청 픽스처
--   · 청년은 앱 계정이 없다 (2026-09-27 — 앱은 리더·목사님·운영자만 쓴다)
--   · 미승인 2명 (role = pending, 명단 미연결): 박새벽 · 한이음
--   · 박새벽은 3목장 리더 류지호로 신청해둔 상태(승인 대기 — 운영자가 확인)
--
-- 재실행 가능하다. 기록·보고서·프로필·신청은 비우고 다시 넣는다.
--
-- ★ 계정(users)은 이 파일이 만들지도 지우지도 않는다 — seed_accounts.sql 이 따로 한다.
--   목장(groups)과 명단(persons)은 지우지 않고 upsert 한다. 명단의 id 는 이름에서
--   결정적으로 만들어지므로(md5) 몇 번을 돌려도 같은 사람은 같은 id 다.
--   실제 계정(auth_user_id 가 있는 users)에 연결된 명단 행의 user_id 는 보존한다.
--   그래서 개발 중 시드를 다시 돌려도 로그인·승인 상태가 유지된다.
--
-- 맨 끝의 DO 블록이 행 수를 단언한다. 기대와 다르면 예외로 실패한다 —
-- 조용히 안 돈 시드를 "Finished" 로 착각하지 않기 위해서다.
-- ===========================================================================

begin;

truncate table
  public.export_logs, public.events, public.comments, public.weekly_records,
  public.report_presence, public.reports, public.group_profiles,
  public.applications
restart identity cascade;

-- ---------------------------------------------------------------------------
-- 목장
-- ---------------------------------------------------------------------------

insert into public.groups (number, name, status) values
  (1, '가온', 'active'),
  (2, '나래', 'active'),
  (3, '다솜', 'active'),
  (4, '라온', 'active'),
  (5, '마루', 'active'),
  (6, '바다', 'active'),
  (7, '샘물', 'active'),
  (8, '아람', 'active'),
  (9, '자람', 'active'),
  (10, '초록', 'active'),
  (11, '하람', 'active'),
  (12, '해든', 'active')
on conflict (number) do update set name = excluded.name, status = excluded.status;
-- 가명 목장 이름. 화면에서는 "가온 목장" 으로 붙는다(groupLabel). 실명단의 이름과 겹치지 않는다.

-- ---------------------------------------------------------------------------
-- 명단 80명 — 리더와 청년을 한 테이블에
-- joined_at 이 최근 4주 안이면 '신규' 다. 표은총과 9목장의 한 명을 신규로 둔다.
-- ---------------------------------------------------------------------------

-- 예전 시드가 남긴 행(무작위 id)을 결정적 id 로 다시 키를 매긴다. 같은 (목장, 이름)이면
-- 같은 사람이다. 기록·신청은 위에서 비웠으므로 참조가 없어 PK 를 바꿀 수 있다.
update public.persons p
   set id = md5('person:' || g.number || ':' || p.name)::uuid
  from public.groups g
 where g.id = p.group_id
   and p.id <> md5('person:' || g.number || ':' || p.name)::uuid;

insert into public.persons (id, group_id, name, gender, group_role, is_group_head, status, dormancy_request, joined_at, birth_date, phone, user_id)
select md5('person:' || v.group_number || ':' || v.name)::uuid,
       g.id, v.name, v.gender::public.gender, v.group_role::public.group_role, v.is_head,
       'active', v.dormancy::public.dormancy_request_status,
       (current_date - (v.joined_weeks_ago * 7)), v.birth_date::date, null,
       (select u.id from public.users u where u.name = v.name and u.role = 'leader' and u.auth_user_id is null limit 1)
from (values
  -- 1목장
  (1, '진빛나', 'female', 'leader', true, 'none', 33, '2004-06-12'),
  (1, '구소리', 'female', 'leader', false, 'none', 46, '2002-11-23'),
  (1, '윤은결', 'male', 'leader', false, 'none', 59, '2000-04-06'),
  (1, '신도담', 'male', 'leader', false, 'none', 72, '1998-09-17'),
  (1, '차바다', 'female', 'member', false, 'none', 25, '2005-02-28'),
  (1, '노온유', 'male', 'member', false, 'none', 38, '2003-07-11'),
  (1, '구온유', 'male', 'member', false, 'none', 51, '2001-12-22'),
  -- 2목장
  (2, '양슬기', 'female', 'leader', true, 'none', 64, '1999-05-05'),
  (2, '배자람', 'female', 'leader', false, 'none', 77, '1997-10-16'),
  (2, '하여울', 'female', 'leader', false, 'none', 30, '2004-03-27'),
  (2, '엄가람', 'female', 'leader', false, 'none', 43, '2002-08-10'),
  (2, '오하늘', 'male', 'member', false, 'none', 56, '2000-01-21'),
  (2, '남이슬', 'female', 'member', false, 'none', 69, '1998-06-04'),
  (2, '민소리', 'female', 'member', false, 'none', 22, '2005-11-15'),
  -- 3목장
  (3, '권다움', 'male', 'leader', true, 'none', 35, '2003-04-26'),
  (3, '김빛나', 'female', 'leader', false, 'none', 48, '2001-09-09'),
  (3, '도하린', 'female', 'leader', false, 'none', 61, '1999-02-20'),
  (3, '류지호', 'male', 'leader', false, 'none', 74, '1997-07-03'),
  (3, '고은결', 'female', 'member', false, 'none', 27, '2004-12-14'),
  (3, '남시현', 'male', 'member', false, 'none', 40, '2002-05-25'),
  (3, '서다온', 'female', 'member', false, 'none', 53, '2000-10-08'),
  -- 4목장
  (4, '반하늘', 'female', 'leader', true, 'none', 66, '1998-03-19'),
  (4, '엄나래', 'male', 'leader', false, 'none', 79, '2005-08-02'),
  (4, '주보라', 'male', 'leader', false, 'none', 32, '2003-01-13'),
  (4, '홍새롬', 'male', 'member', false, 'none', 45, '2001-06-24'),
  (4, '한다움', 'male', 'member', false, 'none', 58, '1999-11-07'),
  (4, '진이슬', 'male', 'member', false, 'none', 71, '1997-04-18'),
  (4, '차해오름', 'male', 'member', false, 'none', 24, '2004-09-01'),
  -- 5목장
  (5, '오나윤', 'male', 'leader', true, 'none', 37, '2002-02-12'),
  (5, '명솔비', 'male', 'leader', false, 'none', 50, '2000-07-23'),
  (5, '안해찬', 'female', 'leader', false, 'none', 63, '1998-12-06'),
  (5, '배마루', 'male', 'leader', false, 'none', 76, '2005-05-17'),
  (5, '구자람', 'male', 'member', false, 'none', 29, '2003-10-28'),
  (5, '양라온', 'male', 'member', false, 'none', 42, '2001-03-11'),
  (5, '반별하', 'female', 'member', false, 'none', 55, '1999-08-22'),
  -- 6목장
  (6, '안해솔', 'male', 'leader', true, 'none', 68, '1997-01-05'),
  (6, '서시온', 'female', 'leader', false, 'none', 21, '2004-06-16'),
  (6, '송해찬', 'male', 'leader', false, 'none', 34, '2002-11-27'),
  (6, '나한별', 'male', 'member', false, 'none', 47, '2000-04-10'),
  (6, '남가람', 'male', 'member', false, 'none', 60, '1998-09-21'),
  (6, '최다움', 'female', 'member', false, 'none', 73, '2005-02-04'),
  (6, '성은결', 'male', 'member', false, 'none', 26, '2003-07-15'),
  -- 7목장
  (7, '노해찬', 'male', 'leader', true, 'none', 39, '2001-12-26'),
  (7, '명슬아', 'female', 'leader', false, 'none', 52, '1999-05-09'),
  (7, '신보람', 'female', 'leader', false, 'none', 65, '1997-10-20'),
  (7, '윤겨레', 'male', 'leader', false, 'none', 78, '2004-03-03'),
  (7, '손예찬', 'male', 'member', false, 'none', 31, '2002-08-14'),
  (7, '오시온', 'male', 'member', false, 'none', 44, '2000-01-25'),
  (7, '양한별', 'female', 'member', false, 'pending', 57, '1998-06-08'),
  -- 8목장
  (8, '전새롬', 'female', 'leader', true, 'none', 70, '2005-11-19'),
  (8, '나가람', 'female', 'leader', false, 'none', 23, '2003-04-02'),
  (8, '송가을', 'male', 'leader', false, 'none', 36, '2001-09-13'),
  (8, '박빛나', 'male', 'member', false, 'none', 49, '1999-02-24'),
  (8, '구누리', 'female', 'member', false, 'none', 62, '1997-07-07'),
  (8, '문지평', 'female', 'member', false, 'none', 75, '2004-12-18'),
  (8, '도누리', 'male', 'member', false, 'none', 28, '2002-05-01'),
  -- 9목장
  (9, '하도담', 'female', 'leader', true, 'none', 41, '2000-10-12'),
  (9, '유바다', 'female', 'leader', false, 'none', 54, '1998-03-23'),
  (9, '김여울', 'female', 'leader', false, 'none', 67, '2005-08-06'),
  (9, '표희망', 'male', 'leader', false, 'none', 20, '2003-01-17'),
  (9, '차가을', 'female', 'member', false, 'none', 33, '2001-06-28'),
  (9, '신봄이', 'male', 'member', false, 'none', 2, '1999-11-11'),
  -- 10목장
  (10, '강보름', 'female', 'leader', true, 'none', 59, '1997-04-22'),
  (10, '마샛별', 'male', 'leader', false, 'none', 72, '2004-09-05'),
  (10, '주푸름', 'female', 'leader', false, 'none', 25, '2002-02-16'),
  (10, '반우리', 'male', 'member', false, 'none', 38, '2000-07-27'),
  (10, '배하람', 'male', 'member', false, 'none', 51, '1998-12-10'),
  (10, '류한결', 'female', 'member', false, 'none', 64, '2005-05-21'),
  -- 11목장
  (11, '반석호', 'male', 'leader', true, 'none', 77, '2003-10-04'),
  (11, '송지평', 'female', 'leader', false, 'none', 30, '2001-03-15'),
  (11, '차사랑', 'female', 'member', false, 'none', 43, '1999-08-26'),
  (11, '조미르', 'female', 'member', false, 'none', 56, '1997-01-09'),
  (11, '진하늘', 'male', 'member', false, 'none', 69, '2004-06-20'),
  (11, '표은총', 'male', 'member', false, 'none', 2, '2002-11-03'),
  -- 12목장
  (12, '한하늘', 'female', 'leader', true, 'none', 35, '2000-04-14'),
  (12, '조가람', 'male', 'leader', false, 'none', 48, '1998-09-25'),
  (12, '민빛나', 'male', 'leader', false, 'none', 61, '2005-02-08'),
  (12, '민이슬', 'male', 'member', false, 'none', 74, '2003-07-19'),
  (12, '신다움', 'female', 'member', false, 'none', 27, '2001-12-02'),
  (12, '송바다', 'male', 'member', false, 'none', 40, '1999-05-13')
) as v(group_number, name, gender, group_role, is_head, dormancy, joined_weeks_ago, birth_date)
join public.groups g on g.number = v.group_number
on conflict (id) do update set
  group_id = excluded.group_id, name = excluded.name, gender = excluded.gender,
  group_role = excluded.group_role, is_group_head = excluded.is_group_head,
  status = excluded.status, dormancy_request = excluded.dormancy_request,
  joined_at = excluded.joined_at, birth_date = excluded.birth_date,
  -- 실제 계정에 연결돼 있으면 그 연결을 지킨다. 가짜 계정 연결만 시드 값으로 바꾼다.
  user_id = case
    when persons.user_id is not null
     and exists (select 1 from public.users su where su.id = persons.user_id and su.auth_user_id is not null)
    then persons.user_id
    else excluded.user_id
  end;

-- 승인 대기 신청 1건 — 박새벽이 3목장 남시현으로 신청했다. (남시현이 아직 미연결일 때만)
insert into public.applications (user_id, person_id, group_id)
select u.id, p.id, p.group_id
from public.users u, public.persons p
where u.name = '박새벽' and u.auth_user_id is null and p.name = '류지호' and p.user_id is null;

-- ---------------------------------------------------------------------------
-- 프로필
-- ---------------------------------------------------------------------------

insert into public.group_profiles (group_id, intro, free_text, ddays, theme_songs, updated_by)
select g.id,
       g.number || '목장입니다.',
       case g.number when 3 then '이번 달 목표는 전원 1대1 한 번씩!' when 7 then '질문 많이 해주세요.' else null end,
       case g.number when 3 then '[{"title": "목장 MT", "date": "2026-11-07"}]'::jsonb else '[]'::jsonb end,
       '[]'::jsonb,
       (select p.user_id from public.persons p where p.group_id = g.id and p.is_group_head limit 1)
from public.groups g
where g.status = 'active';

-- ---------------------------------------------------------------------------
-- 주차 — 가장 최근 일요일이 w3
-- ---------------------------------------------------------------------------

create temporary table seed_weeks on commit drop as
select idx, (current_date - (extract(dow from current_date)::int) - ((3 - idx) * 7))::date as week_key
from generate_series(0, 3) as s(idx);

-- ---------------------------------------------------------------------------
-- 보고서 48건. 네 건은 미제출(초안), 세 건은 지각. 제출률이 100% 면 대시보드를 못 믿는다.
-- ---------------------------------------------------------------------------

create temporary table seed_report_status on commit drop as
select * from (values
  (2, 0, 'draft'), (5, 2, 'draft'), (7, 1, 'draft'), (11, 3, 'draft'),
  (3, 2, 'late'),  (8, 0, 'late'),  (12, 1, 'late')
) as v(group_number, week_idx, status);

insert into public.reports (group_id, week_key, submitted_at, submitted_by, is_late)
select g.id, w.week_key,
  case coalesce(s.status, 'submitted')
    when 'submitted' then (w.week_key + 1)::timestamptz + interval '20 hours'
    when 'late'      then (w.week_key + 3)::timestamptz + interval '21 hours'
  end,
  case when coalesce(s.status, 'submitted') = 'draft' then null
       else (select p.user_id from public.persons p where p.group_id = g.id and p.group_role = 'leader' order by p.name limit 1)
  end,
  coalesce(s.status, '') = 'late'
from public.groups g
cross join seed_weeks w
left join seed_report_status s on s.group_number = g.number and s.week_idx = w.idx
where g.status = 'active';

-- ---------------------------------------------------------------------------
-- 주간기록 — 명단 전원 × 4주. 왼쪽이 오래된 주. 작성자는 그 목장 리더가 이름순으로 돌아가며 맡는다.
-- ---------------------------------------------------------------------------

create temporary table seed_patterns on commit drop as
select * from (values
  (1, '진빛나', 'YYYY', 'YYYY', 'YNYN'),
  (1, '구소리', 'YNYY', 'YNYY', 'NNYY'),
  (1, '윤은결', 'YYNY', 'YYNY', 'YYNN'),
  (1, '신도담', 'NYYY', 'NYNY', 'NYYY'),
  (1, '차바다', 'YYYY', 'YYYY', 'NNYN'),
  (1, '노온유', 'YYYY', 'YYYY', 'NYNN'),
  (1, '구온유', 'YYYY', 'YYYN', 'NNNY'),
  (2, '양슬기', 'YYNY', 'YYNY', 'YNNN'),
  (2, '배자람', 'YYYN', 'YYNN', 'NYNN'),
  (2, '하여울', 'YYYY', 'YYNY', 'YNNY'),
  (2, '엄가람', 'NYYY', 'NYYY', 'NYNY'),
  (2, '오하늘', 'YYYN', 'NNYN', 'NNYN'),
  (2, '남이슬', 'YYYY', 'YNYY', 'NNNY'),
  (2, '민소리', 'YYYN', 'NNYN', 'NYNN'),
  (3, '권다움', 'YYYY', 'YYYY', 'YYNN'),
  (3, '김빛나', 'YYYY', 'YYYY', 'YYNN'),
  (3, '도하린', 'YYYY', 'YYNY', 'YNYN'),
  (3, '류지호', 'NYNY', 'NNNY', 'YNNY'),
  (3, '고은결', 'YYYY', 'YYYY', 'YYNN'),
  (3, '남시현', 'YYNY', 'YNNY', 'NNYN'),
  (3, '서다온', 'YYYY', 'YYYY', 'NNNN'),
  (4, '반하늘', 'YNYY', 'NNYN', 'NNYY'),
  (4, '엄나래', 'YYYY', 'YYYY', 'YYYN'),
  (4, '주보라', 'YYYY', 'YYYN', 'YYYN'),
  (4, '홍새롬', 'YYYY', 'YYNY', 'YYYN'),
  (4, '한다움', 'YYYY', 'YYYY', 'NNYN'),
  (4, '진이슬', 'YYYN', 'NYNN', 'YNYN'),
  (4, '차해오름', 'YYNN', 'NYNN', 'YNYN'),
  (5, '오나윤', 'YYYY', 'YYNY', 'YNNY'),
  (5, '명솔비', 'YYYY', 'YNNY', 'NNYN'),
  (5, '안해찬', 'YNYY', 'NNYY', 'YNNN'),
  (5, '배마루', 'YYYN', 'YYNN', 'YNYN'),
  (5, '구자람', 'YYYY', 'YYYY', 'YYNY'),
  (5, '양라온', 'YNYY', 'NNYY', 'NYNY'),
  (5, '반별하', 'YYYN', 'YYYN', 'NYNN'),
  (6, '안해솔', 'YYYY', 'YYYY', 'YNNN'),
  (6, '서시온', 'YYYY', 'YYYY', 'YYYN'),
  (6, '송해찬', 'YYYY', 'YYYY', 'YNNN'),
  (6, '나한별', 'YYNY', 'YYNY', 'NYNN'),
  (6, '남가람', 'YYYY', 'YYYY', 'YYYN'),
  (6, '최다움', 'YNYY', 'YNYY', 'NYYN'),
  (6, '성은결', 'YYYN', 'YYYN', 'NNYN'),
  (7, '노해찬', 'YYYY', 'YYYY', 'NYNN'),
  (7, '명슬아', 'YYYY', 'YYYN', 'NNYN'),
  (7, '신보람', 'YYYY', 'YYYY', 'YNNY'),
  (7, '윤겨레', 'YYNN', 'YYNN', 'YNNY'),
  (7, '손예찬', 'YYYY', 'YYYN', 'YNNY'),
  (7, '오시온', 'YYYY', 'NNNN', 'NYNN'),
  (7, '양한별', 'YNYY', 'YNYY', 'NNYY'),
  (8, '전새롬', 'YNYY', 'YNYY', 'NYYY'),
  (8, '나가람', 'YYYY', 'YYYY', 'NYYN'),
  (8, '송가을', 'NYYY', 'NYYY', 'NNYN'),
  (8, '박빛나', 'YYYY', 'YYYY', 'YYNN'),
  (8, '구누리', 'YNYY', 'YNNY', 'YNYY'),
  (8, '문지평', 'NYYY', 'NYNY', 'NYNY'),
  (8, '도누리', 'YYYY', 'YYYN', 'NYYN'),
  (9, '하도담', 'YNYY', 'YNYY', 'YNNY'),
  (9, '유바다', 'NYYN', 'NYYN', 'YNNY'),
  (9, '김여울', 'YNYY', 'YNYN', 'YNYN'),
  (9, '표희망', 'NNYY', 'NNNY', 'YNNN'),
  (9, '차가을', 'YYYY', 'YNYN', 'NNNY'),
  (9, '신봄이', 'YYYY', 'NNYY', 'NNYN'),
  (10, '강보름', 'YYYY', 'YYNY', 'NYNY'),
  (10, '마샛별', 'YYYY', 'YNNY', 'NYYN'),
  (10, '주푸름', 'YYYY', 'YYYY', 'YYNN'),
  (10, '반우리', 'YYYY', 'YYYY', 'NNYN'),
  (10, '배하람', 'NYNY', 'NYNY', 'YNNN'),
  (10, '류한결', 'YNYN', 'YNNN', 'NYNN'),
  (11, '반석호', 'YYYY', 'YYYY', 'NYNN'),
  (11, '송지평', 'YYYY', 'YYYY', 'YNNN'),
  (11, '차사랑', 'YYYY', 'YYYY', 'YNYN'),
  (11, '조미르', 'YYYY', 'YYYN', 'NYYN'),
  (11, '진하늘', 'YNYY', 'YNYY', 'NNYN'),
  (11, '표은총', 'NNYY', 'NNYY', 'NNNY'),
  (12, '한하늘', 'YYYY', 'YYYY', 'YNNN'),
  (12, '조가람', 'YYYN', 'YYYN', 'YYNN'),
  (12, '민빛나', 'YYYY', 'YYYY', 'YYYN'),
  (12, '민이슬', 'YYYY', 'NYYY', 'YNYN'),
  (12, '신다움', 'YYYY', 'YYYY', 'NNYN'),
  (12, '송바다', 'NYNY', 'NNNY', 'NNYY')
) as v(group_number, name, worship, meeting, contact);

-- 목장별 리더 순번 (이름순). 작성자 배정에 쓴다.
create temporary table seed_leaders on commit drop as
select p.group_id, p.user_id, row_number() over (partition by p.group_id order by p.name) - 1 as slot,
       count(*) over (partition by p.group_id) as n
from public.persons p where p.group_role = 'leader' and p.user_id is not null;   -- 계정 없는 리더(류지호)는 작성자가 못 된다

insert into public.weekly_records (
  report_id, person_id, author_id, week_key, group_id_at_write,
  worship_attended, group_meeting_attended, one_on_one_contacted,
  prayer_request, prayer_status, note
)
select
  r.id, p.id, l.user_id, w.week_key, g.id,
  substr(t.worship, w.idx + 1, 1) = 'Y',
  substr(t.meeting, w.idx + 1, 1) = 'Y',
  substr(t.contact, w.idx + 1, 1) = 'Y',
  case when substr(t.meeting, w.idx + 1, 1) = 'Y'
       then (array['학업과 진로를 놓고 기도 중','가족의 건강','새로운 공동체에 적응하는 것','시험 준비',
                   '마음의 평안','직장 면접','관계 회복','규칙적인 생활'])
            [1 + ((length(t.name) * 7 + w.idx * 3 + t.group_number) % 8)] end,
  case when substr(t.meeting, w.idx + 1, 1) = 'Y' then 'new'::public.prayer_status end,
  case when w.idx = 2 and t.name in ('남시현', '오시온') then '최근 연락이 잘 닿지 않음' end
from seed_patterns t
join public.groups g on g.number = t.group_number
join public.persons p on p.name = t.name and p.group_id = g.id
cross join seed_weeks w
join public.reports r on r.group_id = g.id and r.week_key = w.week_key
join seed_leaders l on l.group_id = g.id and l.slot = (w.idx % l.n);

-- 지난주 기록과 잇는다 — 지난 기도제목 리마인드가 이 연결을 탄다.
update public.weekly_records wr set prev_record_id = prev.id
from public.weekly_records prev
where prev.person_id = wr.person_id and prev.week_key = wr.week_key - 7
  and wr.prayer_request is not null and prev.prayer_request is not null;

update public.weekly_records set prayer_status = 'ongoing' where prev_record_id is not null;

update public.weekly_records wr set prayer_status = 'answered'
from public.persons p, seed_weeks w
where wr.person_id = p.id and wr.week_key = w.week_key and w.idx = 3
  and p.name in ('고은결', '양한별', '조미르') and wr.prayer_request is not null;

-- ---------------------------------------------------------------------------
-- 목사님 코멘트 — 제출된 보고서 절반쯤에
-- ---------------------------------------------------------------------------

insert into public.comments (report_id, author_id, body, created_at)
select r.id, (select id from public.users where name = '임찬양'),
       (array['한 주간 수고 많으셨습니다.','기도제목 잘 읽었습니다.','따로 한번 만나보면 좋겠습니다.','함께 기도합시다.'])
         [1 + (g.number % 4)],
       r.submitted_at + interval '1 day'
from public.reports r join public.groups g on g.id = r.group_id
where r.submitted_at is not null and (g.number + extract(day from r.week_key)::int) % 2 = 0;

-- ---------------------------------------------------------------------------
-- 행동 로그 · 내보내기 로그
-- ---------------------------------------------------------------------------

insert into public.events (user_id, type, group_id, week_key, occurred_at)
select coalesce(r.submitted_by, (select l.user_id from seed_leaders l where l.group_id = r.group_id and l.slot = 0)),
       'report_opened', r.group_id, r.week_key, (r.week_key + 1)::timestamptz + interval '19 hours'
from public.reports r;

insert into public.events (user_id, type, group_id, report_id, week_key, is_late, occurred_at)
select r.submitted_by, 'report_submitted', r.group_id, r.id, r.week_key, r.is_late, r.submitted_at
from public.reports r where r.submitted_at is not null;

insert into public.events (user_id, type, group_id, report_id, week_key, occurred_at)
select c.author_id, 'comment_created', r.group_id, r.id, r.week_key, c.created_at
from public.comments c join public.reports r on r.id = c.report_id;

insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
select (select id from public.users where name = '임찬양'), 'xlsx',
       (select min(week_key) from seed_weeks), (select max(week_key) from seed_weeks), null;

-- ---------------------------------------------------------------------------
-- 행 수 단언 — 기대와 다르면 실패한다
-- ---------------------------------------------------------------------------

do $$
declare g int; p int; l int; w int; r int;
begin
  select count(*) into g from public.groups where status = 'active';
  select count(*) into p from public.persons where status <> 'left';
  select count(*) into l from public.persons where group_role = 'leader' and status = 'active';
  select count(*) into w from public.weekly_records;
  select count(*) into r from public.reports;
  if (g, p, l, w, r) <> (12, 80, 41, 320, 48) then
    raise exception '시드 행 수 불일치: groups=% persons=% leaders=% weekly_records=% reports=% (기대 12/80/41/320/48)', g, p, l, w, r;
  end if;
end $$;


-- AI 동의(2026-11-13 옵트인) — 시드의 가짜 사람은 모두 동의한 것으로 둔다. AI 경로 테스트가 기본으로 글을 보낼 수 있게.
-- 동의 전 · 철회 경로는 tests/rls/ai-consent.test.mjs 가 따로 본다.
update public.persons set ai_consented_at = timestamptz '2026-10-01 00:00:00+09';

commit;
