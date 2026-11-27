-- ===========================================================================
-- Ninetynine 시드 — 계정 (개발·테스트용)
-- ===========================================================================
--
-- ⚠️  전부 가명·가짜 계정이다. auth_user_id 는 null — 실제 연결은 첫 로그인의
--     ensure_user() 가 한다.
--
-- seed.sql 과 분리한 이유: 명단·기록 시드를 다시 돌릴 때마다 계정이 지워지면
-- 재로그인·재승인이 필요하고, 계정 상태가 조용히 바뀌어 검증 결과를 믿을 수 없다.
-- 이 파일은 있는 계정을 건드리지 않는다 — (provider, provider_uid) 가 같으면 넘어간다.
-- seed.sql 보다 먼저 실행돼야 한다 (config.toml 의 sql_paths 순서).
-- ===========================================================================

insert into public.users (name, role, status, provider, provider_uid, email) values
  ('임찬양', 'pastor',  'active', 'google', 'seed-google-pastor', 'pastor@example.invalid'),
  ('정다슬', 'admin',   'active', 'google', 'seed-google-admin',  'admin@example.invalid'),
  ('박새벽', 'pending', 'active', 'google', 'seed-google-p1',     'p1@example.invalid'),
  ('한이음', 'pending', 'active', 'kakao',  'seed-kakao-p2',      null),
  ('진빛나', 'leader', 'active', 'google', 'seed-google-1', 'u1@example.invalid'),
  ('구소리', 'leader', 'active', 'google', 'seed-google-2', 'u2@example.invalid'),
  ('윤은결', 'leader', 'active', 'kakao', 'seed-kakao-3', null),
  ('신도담', 'leader', 'active', 'google', 'seed-google-4', 'u4@example.invalid'),
  ('양슬기', 'leader', 'active', 'kakao', 'seed-kakao-6', null),
  ('배자람', 'leader', 'active', 'google', 'seed-google-7', 'u7@example.invalid'),
  ('하여울', 'leader', 'active', 'google', 'seed-google-8', 'u8@example.invalid'),
  ('엄가람', 'leader', 'active', 'kakao', 'seed-kakao-9', null),
  ('권다움', 'leader', 'active', 'google', 'seed-google-10', 'u10@example.invalid'),
  ('김빛나', 'leader', 'active', 'google', 'seed-google-11', 'u11@example.invalid'),
  ('도하린', 'leader', 'active', 'kakao', 'seed-kakao-12', null),
  ('반하늘', 'leader', 'active', 'kakao', 'seed-kakao-15', null),
  ('엄나래', 'leader', 'active', 'google', 'seed-google-16', 'u16@example.invalid'),
  ('주보라', 'leader', 'active', 'google', 'seed-google-17', 'u17@example.invalid'),
  ('오나윤', 'leader', 'active', 'kakao', 'seed-kakao-18', null),
  ('명솔비', 'leader', 'active', 'google', 'seed-google-19', 'u19@example.invalid'),
  ('안해찬', 'leader', 'active', 'google', 'seed-google-20', 'u20@example.invalid'),
  ('배마루', 'leader', 'active', 'kakao', 'seed-kakao-21', null),
  ('안해솔', 'leader', 'active', 'google', 'seed-google-22', 'u22@example.invalid'),
  ('서시온', 'leader', 'active', 'google', 'seed-google-23', 'u23@example.invalid'),
  ('송해찬', 'leader', 'active', 'kakao', 'seed-kakao-24', null),
  ('노해찬', 'leader', 'active', 'google', 'seed-google-25', 'u25@example.invalid'),
  ('명슬아', 'leader', 'active', 'google', 'seed-google-26', 'u26@example.invalid'),
  ('신보람', 'leader', 'active', 'kakao', 'seed-kakao-27', null),
  ('윤겨레', 'leader', 'active', 'google', 'seed-google-28', 'u28@example.invalid'),
  ('전새롬', 'leader', 'active', 'kakao', 'seed-kakao-30', null),
  ('나가람', 'leader', 'active', 'google', 'seed-google-31', 'u31@example.invalid'),
  ('송가을', 'leader', 'active', 'google', 'seed-google-32', 'u32@example.invalid'),
  ('하도담', 'leader', 'active', 'kakao', 'seed-kakao-33', null),
  ('유바다', 'leader', 'active', 'google', 'seed-google-34', 'u34@example.invalid'),
  ('김여울', 'leader', 'active', 'google', 'seed-google-35', 'u35@example.invalid'),
  ('표희망', 'leader', 'active', 'kakao', 'seed-kakao-36', null),
  ('강보름', 'leader', 'active', 'google', 'seed-google-37', 'u37@example.invalid'),
  ('마샛별', 'leader', 'active', 'google', 'seed-google-38', 'u38@example.invalid'),
  ('주푸름', 'leader', 'active', 'kakao', 'seed-kakao-39', null),
  ('반석호', 'leader', 'active', 'google', 'seed-google-40', 'u40@example.invalid'),
  ('송지평', 'leader', 'active', 'google', 'seed-google-41', 'u41@example.invalid'),
  ('한하늘', 'leader', 'active', 'google', 'seed-google-43', 'u43@example.invalid'),
  ('조가람', 'leader', 'active', 'google', 'seed-google-44', 'u44@example.invalid'),
  ('민빛나', 'leader', 'active', 'kakao', 'seed-kakao-45', null)
on conflict (provider, provider_uid) where provider is not null do nothing;

-- 푸시 미등록자를 일부러 남긴다. 운영자 화면(A-1c)에서 식별해야 하는 대상이다. 가짜 계정만.
-- 구독은 기기별 테이블(push_subscriptions, Step 7)에 둔다. endpoint 가 가짜라 실제로 보내지는 않는다.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
select id, 'https://example.invalid/seed/' || id, 'seed-p256dh', 'seed-auth', 'seed', now() - interval '20 days'
from public.users
where auth_user_id is null and role in ('pastor', 'leader') and (length(name) + ascii(name)) % 3 <> 0
on conflict (endpoint) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.users where auth_user_id is null;
  if n < 44 then raise exception '계정 시드 실패: 가짜 계정 % 개 (기대 44 이상)', n; end if;
end $$;
