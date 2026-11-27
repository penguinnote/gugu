-- 초대 기반 가입 — 자유가입 차단
--
-- 명세: docs/04-schema.md §3.1
--
-- 문제
--   Supabase Auth 는 기본적으로 누구나 OAuth 로 가입할 수 있다. 초대받지 않은
--   사람이 구글 로그인 버튼을 누르면 auth.users 에 행이 생긴다. 그것 자체를
--   막는 설정은 없다.
--
-- 이 파일이 세우는 방어선
--   ① 앱 계정은 초대로만 생긴다 — public.users 에 INSERT 할 수 있는 것은
--      운영자뿐이다(Step 2 정책). 그리고 auth 계정을 앱 계정에 연결하는 경로는
--      accept_invite() 하나뿐이다. 신원 컬럼을 일반 권한에서 빼서 강제한다.
--   ② 연결되지 않은 auth 계정은 아무것도 읽지 못한다 — Step 2 의 헬퍼 함수가
--      전부 null 을 돌려주므로 모든 정책이 거짓이 된다. 세션은 있으나 무력하다.
--
--   즉 "가입을 막는다" 가 아니라 **"가입해도 앱 계정이 될 수 없다"** 로 푼다.
--   auth.users 에 남는 고아 행은 열람 권한이 전혀 없으므로 무해하고, 나중에
--   그 사람이 정식으로 초대되면 같은 행이 그대로 연결된다.
--
-- 앱 계층 방어는 src/lib/auth/ 에 있다. 세션은 있는데 앱 계정이 없으면
-- 즉시 로그아웃시키고 C-1a 안내 화면으로 보낸다.

-- ===========================================================================
-- 1. 신원 컬럼 잠그기
-- ===========================================================================
--
-- Step 2 에서 users 에 update 를 통째로 줬다. 그러면 로그인한 사용자가
-- 자기 행의 auth_user_id·provider·invite_status 를 직접 고칠 수 있다.
-- 그건 곧 초대 절차를 건너뛸 수 있다는 뜻이다.
--
-- 본인이 바꿔도 되는 것만 남긴다. 나머지는 accept_invite() 를 통해서만 바뀐다.

revoke update on public.users from authenticated;

grant update (name, push_subscription, push_registered_at)
  on public.users to authenticated;

-- 운영자가 pre-linked 행을 만드는 경로도 막는다. 연결은 언제나 초대 수락
-- 시점에만 일어나야 한다.
create or replace function public.users_block_prelinked_insert()
returns trigger
language plpgsql
as $$
begin
  if new.auth_user_id is not null then
    raise exception
      'auth_user_id 는 직접 넣을 수 없습니다. 초대 수락(accept_invite)으로만 연결됩니다.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_block_prelinked_insert
  before insert on public.users
  for each row execute function public.users_block_prelinked_insert();

comment on function public.users_block_prelinked_insert() is
  '초대를 거치지 않은 계정 연결을 막는다. accept_invite() 는 UPDATE 를 쓰므로 이 트리거에 걸리지 않는다.';

-- ===========================================================================
-- 2. peek_invite — 초대 링크를 연 사람에게 보여줄 최소 정보
-- ===========================================================================
--
-- 초대 페이지는 로그인 전에 열리므로 anon 이 호출한다. users 테이블을 열어줄
-- 수는 없으니 이름 하나만 돌려준다. 토큰이 유효하지 않으면 빈 결과다.
--
-- 토큰을 모르면 아무것도 나오지 않고, 토큰은 추측할 수 없는 난수다.

create or replace function public.peek_invite(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.name
  from public.users u
  where u.invite_token = p_token
    and u.invite_status = 'sent'
    and u.status = 'active'
    and u.auth_user_id is null
$$;

comment on function public.peek_invite(text) is
  '초대 토큰이 유효하면 초대받은 사람의 이름을, 아니면 null 을 돌려준다. 이름 외에는 아무것도 노출하지 않는다.';

-- ===========================================================================
-- 3. accept_invite — 계정 연결의 유일한 경로 ★
-- ===========================================================================
--
-- 제공자 정보를 클라이언트에서 받지 않는다. auth.identities 에서 직접 읽는다.
-- 클라이언트가 "나는 구글로 로그인했다" 고 주장할 수 있으면 잠금장치가 아니다.
--
-- 토큰 검증과 소멸을 조건부 UPDATE 한 번으로 처리한다. 두 요청이 같은 토큰을
-- 동시에 들고 와도 한쪽만 성공한다 — 1회용이 경쟁 조건에서도 지켜진다.

create or replace function public.accept_invite(p_token text)
returns public.user_role
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth_id      uuid := (select auth.uid());
  v_provider     text;
  v_provider_uid text;
  v_role         public.user_role;
begin
  if v_auth_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  -- 이미 앱 계정을 가진 사람은 초대를 또 쓸 수 없다.
  if exists (select 1 from public.users u where u.auth_user_id = v_auth_id) then
    raise exception '이미 연결된 계정입니다.' using errcode = '23505';
  end if;

  select i.provider, i.provider_id
    into v_provider, v_provider_uid
  from auth.identities i
  where i.user_id = v_auth_id
  order by i.last_sign_in_at desc nulls last
  limit 1;

  if v_provider is null then
    raise exception '로그인 제공자를 확인할 수 없습니다.' using errcode = '28000';
  end if;

  if v_provider not in ('kakao', 'google') then
    raise exception '지원하지 않는 로그인 제공자입니다: %', v_provider
      using errcode = '28000';
  end if;

  update public.users u
     set auth_user_id  = v_auth_id,
         provider      = v_provider::public.auth_provider,
         provider_uid  = v_provider_uid,
         invite_status = 'accepted',
         invite_token  = null            -- 토큰 소멸. 재사용 불가
   where u.invite_token  = p_token
     and u.invite_status = 'sent'
     and u.status        = 'active'
     and u.auth_user_id is null
  returning u.role into v_role;

  if v_role is null then
    raise exception '유효하지 않거나 이미 사용된 초대입니다.' using errcode = '22023';
  end if;

  return v_role;
end;
$$;

comment on function public.accept_invite(text) is
  '초대 토큰으로 현재 auth 계정을 앱 계정에 연결한다. 계정 연결의 유일한 경로다. 토큰은 소멸한다.';

-- ===========================================================================
-- 4. current_user_context — 로그인한 본인의 역할·소속
-- ===========================================================================
--
-- 화면마다 users·leaders·groups 를 각각 조회하면 왕복이 늘고 정책도 여러 번
-- 탄다. 본인 정보만 한 번에 돌려준다.
--
-- SECURITY DEFINER 지만 auth.uid() 로 자기 행만 고르므로 남의 정보가 나올 수
-- 없다. 앱 계정이 없으면 0행이 나오고, 그것이 "초대받지 않은 사람" 의 신호다.

create or replace function public.current_user_context()
returns table (
  user_id      uuid,
  name         text,
  role         public.user_role,
  provider     public.auth_provider,
  group_id     uuid,
  group_number integer,
  group_name   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.name,
    u.role,
    u.provider,
    l.group_id,
    g.number,
    g.name
  from public.users u
  left join public.leaders l
    on l.user_id = u.id and l.status = 'active'
  left join public.groups g
    on g.id = l.group_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
$$;

comment on function public.current_user_context() is
  '로그인한 본인의 역할·소속 목장. 0행이면 초대받지 않은 계정이다.';

-- ===========================================================================
-- 5. 실행 권한
-- ===========================================================================

revoke execute on function
  public.peek_invite(text),
  public.accept_invite(text),
  public.current_user_context()
from public, anon, authenticated;

-- 초대 페이지는 로그인 전에 열린다.
grant execute on function public.peek_invite(text) to anon, authenticated;

-- 나머지는 로그인 후에만.
grant execute on function public.accept_invite(text)      to authenticated;
grant execute on function public.current_user_context()   to authenticated;

-- ===========================================================================
-- 6. "로그인한 전원" 의 뜻을 좁힌다 ★
-- ===========================================================================
--
-- Step 2 에서 groups·group_profiles·org_profile 의 열람을 `using (true)` 로,
-- 공개 뷰 3종을 `grant select ... to authenticated` 로 열어뒀다. 그때는
-- authenticated = 우리 앱 사용자였으므로 맞는 표현이었다.
--
-- Step 3 에서 전제가 깨진다. **초대받지 않은 사람도 구글 로그인만 하면
-- authenticated 가 된다.** 그 상태로 목장 목록과 목장 프로필 자유 글,
-- 전체 인원 이름까지 읽을 수 있다. 자유 글은 리더들이 쓰는 공간이므로
-- 외부인에게 열려서는 안 된다.
--
-- 그래서 판정을 "auth 세션이 있는가" 에서 **"앱 계정이 있는가"** 로 바꾼다.
-- current_user_id() 는 public.users 와 연결되지 않았으면 null 을 돌려주므로
-- 이 한 줄이 초대받지 않은 세션을 전부 걸러낸다.

drop policy groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (public.current_user_id() is not null);

drop policy group_profiles_select on public.group_profiles;
create policy group_profiles_select on public.group_profiles
  for select to authenticated
  using (public.current_user_id() is not null);

drop policy org_profile_select on public.org_profile;
create policy org_profile_select on public.org_profile
  for select to authenticated
  using (public.current_user_id() is not null);

-- 공개 뷰는 소유자 권한으로 돌아 RLS 를 통과하므로 정책이 걸리지 않는다.
-- 같은 조건을 뷰 정의 안에 직접 넣는다.

create or replace view public.members_public
with (security_invoker = false) as
select
  m.id,
  m.name,
  m.gender,
  m.group_id
from public.members m
where m.status <> 'left'
  and public.current_user_id() is not null;

create or replace view public.leaders_public
with (security_invoker = false) as
select
  l.id,
  l.user_id,
  u.name,
  l.gender,
  l.group_id,
  l.title
from public.leaders l
join public.users u on u.id = l.user_id
where l.status = 'active'
  and public.current_user_id() is not null;
