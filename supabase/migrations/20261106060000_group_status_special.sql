-- 목회자 집 · 운영자 집(2026-11-06) — 로뎀 월드에만 있는 '특별 자리'. 목장이 아니라 활동 목장 목록(status = 'active')에는 나오지 않는다.
-- enum 값은 쓰기 전에 커밋돼야 해서 파일을 나눈다(다음 파일 20261106070000 이 쓴다)
alter type public.group_status add value if not exists 'special';
