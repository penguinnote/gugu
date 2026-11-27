-- ===========================================================================
-- 임원진 역할 값 (2026-10-30)
--
-- enum 값을 더한 트랜잭션 안에서는 그 값을 쓸 수 없다 — 쓰는 쪽은 다음 마이그레이션(20261030030000)에 둔다.
-- 'officer' 는 목장 리더가 아닌 임원진의 역할이다. 리더이면서 임원진이면 역할은 leader 그대로, users.is_officer 만 켠다.
-- ===========================================================================

alter type public.user_role add value if not exists 'officer';

comment on type public.user_role is
  '앱 계정의 역할. pending 미승인(신청 전·대기) · leader 리더 · pastor 목사님 · admin 운영자 · officer 임원진(목장 리더가 아닌). 청년은 앱을 쓰지 않는다 — persons.group_role 로만 존재한다.';
