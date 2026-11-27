-- 행 수준 보안(RLS) — 활성화 · 권한 · 헬퍼 함수 · 정책 · 공개 뷰
--
-- 명세: docs/04-schema.md §4, docs/02-ia-screens.md §4
--
-- 이 프로젝트의 정체성은 "누가 무엇을 볼 수 있는가" 다. 그래서 격리를
-- 애플리케이션이 아니라 데이터 계층에서 강제한다(04-schema §1 원칙 ①).
-- 쿼리에서 조건을 빼먹어도 다른 목장의 기도제목이 나오지 않아야 한다.
--
-- 역할 네 가지
--   anon          비로그인. 아무것도 못 읽는다. 권한 자체를 주지 않는다
--   leader        자기 목장 데이터만
--   pastor        전체 (민감 포함)
--   admin(운영자)  관리 기능만. 보고서 본문은 못 본다
--
-- RLS 활성화를 프로젝트 설정(automatic RLS)에 의존하지 않고 여기에 명시한다.
-- 설정은 마이그레이션에 남지 않으므로, 다른 환경에서 db reset 하면 RLS 없이
-- 테이블이 생긴다. 스키마가 자기완결적이어야 한다.

-- ===========================================================================
-- 1. anon 차단
-- ===========================================================================
--
-- 전부 로그인 기반이다. 비로그인 역할에는 테이블 권한을 주지 않는다.
-- RLS 정책 이전에 권한 단계에서 막히므로 정책 실수의 영향도 받지 않는다.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines  in schema public from anon;

grant usage on schema public to authenticated;

-- ===========================================================================
-- 2. 헬퍼 함수
-- ===========================================================================
--
-- 정책이 "지금 이 사람은 누구인가" 를 알려면 users·leaders 를 읽어야 하는데,
-- 그 두 테이블에도 RLS 가 걸려 있다. 정책 안에서 정책이 걸린 테이블을 읽으면
-- 무한 재귀가 된다.
--
-- 그래서 SECURITY DEFINER 로 만든다. 함수가 소유자(postgres) 권한으로 돌아
-- RLS 를 통과하므로 재귀가 끊긴다. 대신 SECURITY DEFINER 는 권한 상승 통로가
-- 될 수 있으므로 두 가지를 고정한다.
--   · search_path = ''  — 호출자가 스키마를 바꿔치기해 다른 테이블을 읽게
--                         만드는 공격을 막는다. 모든 이름을 완전수식한다
--   · 반환값은 식별자·불리언뿐 — 본문 데이터를 절대 반환하지 않는다
--
-- auth.uid() 를 (select ...) 로 감싸는 것은 Supabase 의 권장 사항이다.
-- 행마다 재평가되지 않고 한 번만 계산된다.

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
$$;

comment on function public.current_user_id() is
  '현재 로그인한 사용자의 public.users.id. 비로그인이거나 비활성이면 null.';

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users u
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
$$;

comment on function public.current_app_role() is
  '현재 사용자의 역할. 이름을 current_role 로 짓지 않은 것은 그것이 예약어이기 때문이다.';

create or replace function public.current_leader_group_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.group_id
  from public.leaders l
  join public.users u on u.id = l.user_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
    and l.status = 'active'
$$;

comment on function public.current_leader_group_id() is
  '현재 사용자가 활동 중인 리더라면 소속 목장 id. 휴직·사임 리더는 null 이 되어 접근이 끊긴다.';

create or replace function public.is_pastor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() = 'pastor'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_leader_of(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_group_id is not null
     and public.current_leader_group_id() = target_group_id
$$;

comment on function public.is_leader_of(uuid) is
  '현재 사용자가 그 목장의 활동 리더인가. 리더의 열람 권한 판정은 전부 이 함수를 통한다.';

-- 헬퍼 함수도 anon 에게는 주지 않는다.
revoke execute on function
  public.current_user_id(),
  public.current_app_role(),
  public.current_leader_group_id(),
  public.is_pastor(),
  public.is_admin(),
  public.is_leader_of(uuid)
from public, anon;

grant execute on function
  public.current_user_id(),
  public.current_app_role(),
  public.current_leader_group_id(),
  public.is_pastor(),
  public.is_admin(),
  public.is_leader_of(uuid)
to authenticated;

-- ===========================================================================
-- 3. RLS 활성화 — 11개 테이블 전부
-- ===========================================================================
--
-- force row level security 는 걸지 않는다. 걸면 테이블 소유자에게도 정책이
-- 적용되어 아래 §6 의 공개 뷰(소유자 권한으로 도는 뷰)가 동작하지 않는다.

alter table public.groups          enable row level security;
alter table public.users           enable row level security;
alter table public.members         enable row level security;
alter table public.leaders         enable row level security;
alter table public.reports         enable row level security;
alter table public.weekly_records  enable row level security;
alter table public.group_profiles  enable row level security;
alter table public.org_profile     enable row level security;
alter table public.comments        enable row level security;
alter table public.events          enable row level security;
alter table public.export_logs     enable row level security;

-- ===========================================================================
-- 4. 권한 부여 — authenticated 에게 필요한 것만
-- ===========================================================================
--
-- RLS 정책만 쓰고 GRANT 를 빠뜨리면 정책이 맞아도 42501 로 거부된다.
-- 반대로 GRANT 만 주고 정책을 안 쓰면 아무 행도 안 나온다. 둘 다 필요하다.

grant select, insert, update, delete on public.groups         to authenticated;
grant select, insert, update, delete on public.users          to authenticated;
grant select, insert, update, delete on public.members        to authenticated;
grant select, insert, update, delete on public.leaders        to authenticated;
grant select, insert, update, delete on public.reports        to authenticated;
grant select, insert, update, delete on public.group_profiles to authenticated;
grant select, insert, update, delete on public.org_profile    to authenticated;
grant select, insert, update, delete on public.comments       to authenticated;
grant insert                         on public.events         to authenticated;
grant select                         on public.events         to authenticated;
grant insert                         on public.export_logs    to authenticated;
grant select                         on public.export_logs    to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- weekly_records 만 컬럼 단위로 준다. ★
--
-- RLS 는 행 단위라 컬럼을 가릴 수 없다. 그런데 민감 표시된 기록은
-- "행은 보이되 기도제목·특이사항만 안 보여야" 한다(04-schema §4.3,
-- IA §4). 행을 숨기면 출석 정보까지 사라지므로 그 방법은 쓸 수 없다.
--
-- 그래서 본문 컬럼은 아예 select 권한에서 뺀다. 읽기는 §6 의
-- weekly_records_visible 뷰로만 하고, 그 뷰가 열람자에 따라 컬럼을 가린다.
-- 이렇게 하면 앱이 실수로 원본 테이블을 조회해도 본문이 새지 않는다.
--
-- insert / update 는 전체 컬럼에 준다. 쓰는 것과 읽는 것은 다른 문제다 —
-- 리더는 자기 목장 기록에 기도제목을 쓸 수 있지만, 남이 민감 표시한
-- 기도제목을 읽을 수는 없다.
grant select (
  id, report_id, member_id, author_id, week_key, group_id_at_write,
  worship_attended, group_meeting_attended, one_on_one_contacted,
  prev_record_id, created_at, updated_at
) on public.weekly_records to authenticated;

grant insert, update, delete on public.weekly_records to authenticated;

-- ===========================================================================
-- 5. 정책
-- ===========================================================================
--
-- 모든 정책은 `to authenticated` 다. anon 용 정책은 하나도 만들지 않는다.

-- --------------------------------------------------------------------------
-- groups — 읽기 전원 / 쓰기 운영자
-- --------------------------------------------------------------------------

create policy groups_select on public.groups
  for select to authenticated using (true);

create policy groups_insert on public.groups
  for insert to authenticated with check (public.is_admin());

create policy groups_update on public.groups
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy groups_delete on public.groups
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- users — 본인 / 목사님 / 운영자
-- --------------------------------------------------------------------------
--
-- 리더가 다른 리더의 이름을 봐야 하는 경우는 §6 의 leaders_public 뷰로 푼다.
-- 원본 테이블에는 초대 토큰·푸시 구독 정보 같은 것이 들어 있어 열면 안 된다.

create policy users_select on public.users
  for select to authenticated
  using (
    id = public.current_user_id()
    or public.is_pastor()
    or public.is_admin()
  );

create policy users_insert on public.users
  for insert to authenticated with check (public.is_admin());

create policy users_update on public.users
  for update to authenticated
  using (id = public.current_user_id() or public.is_admin())
  with check (id = public.current_user_id() or public.is_admin());

create policy users_delete on public.users
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- members — 원본은 소속 목장 리더 + 목사님 + 운영자
-- --------------------------------------------------------------------------
--
-- 연락처·생년월일·상태가 들어 있으므로 범위를 좁힌다.
-- 이름·성별·소속까지만 필요한 화면(전체 인원표·목장 프로필)은
-- §6 의 members_public 뷰를 쓴다.

create policy members_select on public.members
  for select to authenticated
  using (
    public.is_leader_of(group_id)
    or public.is_pastor()
    or public.is_admin()
  );

create policy members_insert on public.members
  for insert to authenticated with check (public.is_admin());

-- 리더가 휴면을 신청하려면(L-4a) 자기 목장 양의 행을 갱신할 수 있어야 한다.
create policy members_update on public.members
  for update to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin())
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());

create policy members_delete on public.members
  for delete to authenticated
  using (public.is_pastor() or public.is_admin());

-- --------------------------------------------------------------------------
-- leaders — 원본은 소속 목장 리더 + 목사님 + 운영자
-- --------------------------------------------------------------------------

create policy leaders_select on public.leaders
  for select to authenticated
  using (
    public.is_leader_of(group_id)
    or public.is_pastor()
    or public.is_admin()
  );

create policy leaders_insert on public.leaders
  for insert to authenticated with check (public.is_admin());

create policy leaders_update on public.leaders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy leaders_delete on public.leaders
  for delete to authenticated
  using (public.is_pastor() or public.is_admin());

-- --------------------------------------------------------------------------
-- group_profiles — 격리의 예외 구역
-- --------------------------------------------------------------------------
--
-- 모든 리더가 12개 목장 프로필을 읽는다(IA §4). 쓰기는 자기 목장만.
-- 부적절한 내용은 목사님·운영자가 내릴 수 있어야 한다.

create policy group_profiles_select on public.group_profiles
  for select to authenticated using (true);

create policy group_profiles_insert on public.group_profiles
  for insert to authenticated
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());

create policy group_profiles_update on public.group_profiles
  for update to authenticated
  using (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin())
  with check (public.is_leader_of(group_id) or public.is_pastor() or public.is_admin());

create policy group_profiles_delete on public.group_profiles
  for delete to authenticated
  using (public.is_pastor() or public.is_admin());

-- --------------------------------------------------------------------------
-- org_profile — 읽기 전원 / 쓰기 운영자
-- --------------------------------------------------------------------------

create policy org_profile_select on public.org_profile
  for select to authenticated using (true);

create policy org_profile_insert on public.org_profile
  for insert to authenticated with check (public.is_admin());

create policy org_profile_update on public.org_profile
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy org_profile_delete on public.org_profile
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- reports — 리더는 자기 목장, 목사님 전체, 운영자 접근 불가 ★
-- --------------------------------------------------------------------------

create policy reports_select on public.reports
  for select to authenticated
  using (public.is_pastor() or public.is_leader_of(group_id));

create policy reports_insert on public.reports
  for insert to authenticated with check (public.is_leader_of(group_id));

create policy reports_update on public.reports
  for update to authenticated
  using (public.is_leader_of(group_id))
  with check (public.is_leader_of(group_id));

create policy reports_delete on public.reports
  for delete to authenticated using (public.is_pastor());

-- --------------------------------------------------------------------------
-- weekly_records — 판정 기준은 '작성 시점 목장' ★
-- --------------------------------------------------------------------------
--
-- group_id_at_write 로 판정한다(04-schema §4.2). members.group_id 가 아니다.
-- 양이 목장을 옮기면 새 목장 리더는 이전 목장 시절 기록을 보지 못하고,
-- 리더 본인이 옮기면 이전 목장 기록 접근이 즉시 끊긴다.
--
-- 본문 컬럼은 §4 의 컬럼 단위 GRANT 로 이미 막혀 있다. 이 정책은 행만 고른다.

create policy weekly_records_select on public.weekly_records
  for select to authenticated
  using (public.is_pastor() or public.is_leader_of(group_id_at_write));

create policy weekly_records_insert on public.weekly_records
  for insert to authenticated
  with check (public.is_leader_of(group_id_at_write));

create policy weekly_records_update on public.weekly_records
  for update to authenticated
  using (public.is_leader_of(group_id_at_write))
  with check (public.is_leader_of(group_id_at_write));

create policy weekly_records_delete on public.weekly_records
  for delete to authenticated
  using (public.is_leader_of(group_id_at_write) or public.is_pastor());

-- --------------------------------------------------------------------------
-- comments — 읽기는 해당 목장 리더 + 목사님 / 쓰기는 목사님
-- --------------------------------------------------------------------------

create policy comments_select on public.comments
  for select to authenticated
  using (
    public.is_pastor()
    or exists (
      select 1 from public.reports r
      where r.id = comments.report_id
        and public.is_leader_of(r.group_id)
    )
  );

create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.is_pastor() and author_id = public.current_user_id());

create policy comments_update on public.comments
  for update to authenticated
  using (public.is_pastor() and author_id = public.current_user_id())
  with check (public.is_pastor() and author_id = public.current_user_id());

create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_pastor() and author_id = public.current_user_id());

-- --------------------------------------------------------------------------
-- events / export_logs — 본인 기록 삽입, 읽기는 목사님·운영자
-- --------------------------------------------------------------------------
--
-- 리더는 자기 행동 로그도 읽지 못한다. 로그는 지표와 거버넌스를 위한 것이지
-- 사용자에게 보여줄 것이 아니다.

create policy events_insert on public.events
  for insert to authenticated
  with check (user_id = public.current_user_id());

create policy events_select on public.events
  for select to authenticated
  using (public.is_pastor() or public.is_admin());

create policy export_logs_insert on public.export_logs
  for insert to authenticated
  with check (user_id = public.current_user_id());

create policy export_logs_select on public.export_logs
  for select to authenticated
  using (public.is_pastor() or public.is_admin());

-- ===========================================================================
-- 6. 공개 뷰 ★
-- ===========================================================================
--
-- RLS 는 행 단위라 컬럼을 가릴 수 없다. 노출 범위가 컬럼마다 다른 두 곳을
-- 뷰로 푼다.
--
-- 세 뷰 모두 security_invoker = false 다. 즉 뷰는 **소유자 권한**으로 돌아
-- 원본 테이블의 RLS 를 통과한다. 그래서 뷰 정의 안에 필요한 제한을 직접 쓴다.
-- 접근 통제는 뷰에 대한 GRANT 로 한다 — authenticated 에게만 주고
-- anon 에게는 주지 않는다.

-- --------------------------------------------------------------------------
-- 6.1 members_public / leaders_public — 이름·성별·소속까지만
-- --------------------------------------------------------------------------
--
-- 전체 인원표(P-4)와 목장 프로필(L-5a)에는 모든 리더가 12개 목장의 인원을
-- 볼 수 있어야 한다. 그러나 연락처·생년월일·상태는 소속 목장 리더와
-- 목사님·운영자만 본다. 원본 테이블은 위 정책으로 좁혀두고, 공개 범위는
-- 이 뷰가 담당한다.
--
-- IA §4 — "노출 범위는 멤버 이름과 목장 소속까지로 제한한다."

create view public.members_public
with (security_invoker = false) as
select
  m.id,
  m.name,
  m.gender,
  m.group_id
from public.members m
-- 이탈한 청년은 목장 프로필 멤버 목록에 남기지 않는다.
where m.status <> 'left';

comment on view public.members_public is
  '전체 인원표·목장 프로필용. 이름·성별·소속 목장까지만. 로그인한 전원이 읽는다.';

create view public.leaders_public
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
where l.status = 'active';

comment on view public.leaders_public is
  '목장별 리더 표시용. 이름·성별·소속·호칭까지만. 로그인한 전원이 읽는다.';

-- --------------------------------------------------------------------------
-- 6.2 weekly_records_visible — 민감 항목 가리기 ★
-- --------------------------------------------------------------------------
--
-- 민감 표시된 기록의 기도제목·특이사항은 작성자 본인과 목사님만 본다.
-- 같은 목장의 다른 리더에게는 **존재 표시조차 남기지 않는다**(04-schema §4.3).
--
-- 그래서 행을 숨기지 않고 컬럼을 null 로 치환한다. 출석 세 축은 그대로
-- 보이므로 "이번 주에 뭘 했는지" 는 알 수 있고, 본문만 사라진다.
--
-- is_sensitive 도 함께 가린다. 이 값을 true 로 내보내면 그것이 곧
-- "민감 기록 있음" 표시가 되어 §4.3 이 금지한 바로 그 상태가 된다.
-- prayer_status 도 같은 이유로 가린다 — 본문 없이 '진행 중' 만 떠도
-- 무언가 적혀 있다는 사실이 드러난다.
--
-- 행 범위(어느 목장까지 보이는가)는 원본 테이블 정책과 같은 헬퍼 함수를
-- 쓴다. 규칙이 두 군데로 갈라지지 않게 하기 위함이다.

create view public.weekly_records_visible
with (security_invoker = false) as
select
  wr.id,
  wr.report_id,
  wr.member_id,
  wr.author_id,
  wr.week_key,
  wr.group_id_at_write,

  wr.worship_attended,
  wr.group_meeting_attended,
  wr.one_on_one_contacted,

  case when v.may_read_body then wr.prayer_request end as prayer_request,
  case when v.may_read_body then wr.prayer_status  end as prayer_status,
  case when v.may_read_body then wr.note           end as note,
  case when v.may_read_body then wr.is_sensitive else false end as is_sensitive,

  wr.prev_record_id,
  wr.created_at,
  wr.updated_at
from public.weekly_records wr
cross join lateral (
  select (
    not wr.is_sensitive
    or wr.author_id = public.current_user_id()
    or public.is_pastor()
  ) as may_read_body
) v
where public.is_pastor() or public.is_leader_of(wr.group_id_at_write);

comment on view public.weekly_records_visible is
  '주간기록 읽기 경로. 민감 표시된 기록의 본문은 작성자와 목사님에게만 보이고, 그 외에는 민감 표시 자체가 드러나지 않는다.';

grant select on public.members_public          to authenticated;
grant select on public.leaders_public          to authenticated;
grant select on public.weekly_records_visible  to authenticated;

revoke all on public.members_public          from anon;
revoke all on public.leaders_public          from anon;
revoke all on public.weekly_records_visible  from anon;
