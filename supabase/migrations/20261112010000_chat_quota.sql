-- ===========================================================================
-- 구구 챗봇 질문 횟수(2026-11-12) — 리더 한 달 20번 · 추가 신청
-- ===========================================================================
--
--   리더     한 달(한국 시간 1일 0시 기준) 20번. 사용자 말 한 번 = 1번(그 안에서 도구를 여러 번 불러도 1번)
--   목사님   세지 않는다(행을 만들지 않는다)
--   추가     그달 첫 신청은 바로 +5(auto). 두 번째부터 운영자가 +5 · +10 · +20 으로 승인하거나 거절(pending)
--            다 썼을 때만 신청할 수 있다. 운영자 겸 리더는 자기 신청을 처리할 수 없다(운영자만 처리 — 사용자 결정)
--   넘기기   남은 횟수 · 추가분은 다음 달로 넘기지 않는다(달마다 행이 따로)
--
-- 세는 법 — 예약 → 확정 / 취소
--   답을 받은 뒤에만 1 을 더하면서 동시에 보내도 한도를 넘지 않게: AI 를 부르기 전에 chat_quota_reserve() 가
--   행을 잠그고 '쓴 횟수 + 진행 중 예약 < 한도' 일 때만 예약 한 칸을 만든다(확인과 예약이 한 함수 · 한 잠금 안).
--   답을 받으면 chat_quota_commit() 이 1 을 더하고, 못 받으면 chat_quota_release() 가 예약만 푼다.
--   서버가 죽어 둘 다 못 부른 예약은 3분 뒤 저절로 무효(응답 최대 60초).
--
-- 사유 보관 — 다음 달이 되면 지난달 신청의 사유 글을 지운다(신청 · 처리 함수가 돌 때 함께). 횟수 · 처리 기록은 남긴다.
-- 쓰기는 모두 아래 security definer 함수로만. 표에는 읽기 정책만 둔다.
-- ===========================================================================

-- 0. 달 · 한도 ----------------------------------------------------------------------

/** 그 시각이 속한 달의 1일(한국 시간) */
create function public.chat_month_of(p_at timestamptz)
returns date language sql immutable set search_path = '' as $$
  select date_trunc('month', p_at at time zone 'Asia/Seoul')::date
$$;

/** 기본 한도 — 한 곳에만 둔다 */
create function public.chat_quota_base()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

/** 예약이 살아 있는 시간 */
create function public.chat_quota_hold_ttl()
returns interval language sql immutable set search_path = '' as $$ select interval '3 minutes' $$;

/** 지금 사용자가 세는 대상인가 — 'pastor'(세지 않음) · 'leader'(셈) · null(챗봇을 못 씀) */
create function public.chat_quota_kind()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.is_pastor() then 'pastor'
    when public.current_app_role() in ('leader', 'admin') and exists (
      select 1 from public.persons p join public.users u on u.id = p.user_id
       where u.auth_user_id = (select auth.uid()) and u.status = 'active'
         and p.status = 'active' and p.group_role = 'leader'
    ) then 'leader'
    else null
  end
$$;

-- 1. 표 ------------------------------------------------------------------------------

create type public.chat_request_status as enum ('auto', 'pending', 'approved', 'rejected');

create table public.chat_quota_months (
  user_id    uuid not null references public.users (id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  used       integer not null default 0 check (used >= 0),
  bonus      integer not null default 0 check (bonus >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
comment on table public.chat_quota_months is '구구 챗봇 — 리더의 달마다 쓴 횟수 · 추가분. 한도 = chat_quota_base() + bonus. 쓰기는 함수만';

create table public.chat_quota_holds (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  month      date not null,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index chat_quota_holds_open on public.chat_quota_holds (user_id, month) where done_at is null;
comment on table public.chat_quota_holds is '구구 챗봇 — 답을 기다리는 질문의 예약(확정 · 취소 · 3분 지나면 무효). 아무도 직접 읽지 않는다';

create table public.chat_quota_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  month       date not null,
  status      public.chat_request_status not null,
  amount      integer check (amount in (5, 10, 20)),
  reason      text check (char_length(reason) <= 100),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.users (id) on delete set null
);
create unique index chat_quota_requests_one_pending on public.chat_quota_requests (user_id, month) where status = 'pending';
create index chat_quota_requests_month on public.chat_quota_requests (month, status);
comment on table public.chat_quota_requests is '구구 챗봇 추가 신청 — auto(그달 첫 신청 +5) · pending · approved · rejected. 사유는 다음 달에 지운다';

alter table public.chat_quota_months   enable row level security;
alter table public.chat_quota_holds    enable row level security;
alter table public.chat_quota_requests enable row level security;

-- 읽기: 본인 것. 신청은 운영자도. 쓰기 정책은 없다(함수만)
create policy chat_quota_months_own on public.chat_quota_months
  for select to authenticated using (user_id = public.current_user_id());
create policy chat_quota_requests_own on public.chat_quota_requests
  for select to authenticated using (user_id = public.current_user_id() or public.is_admin());

revoke all on public.chat_quota_months, public.chat_quota_holds, public.chat_quota_requests from anon;
grant select on public.chat_quota_months, public.chat_quota_requests to authenticated;

-- 2. 상태 ----------------------------------------------------------------------------

/** 이번 달 내 횟수 — 목사님은 unlimited. last_status 는 이번 달 마지막 신청의 상태(신청됨 · 거절 표시) */
create function public.chat_quota_status()
returns table (
  unlimited    boolean,
  month        date,
  used         integer,
  quota        integer,
  can_auto     boolean,
  has_pending  boolean,
  last_status  public.chat_request_status
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_kind  text := public.chat_quota_kind();
  v_user  uuid := public.current_user_id();
  v_month date := public.chat_month_of(now());
  v_row   public.chat_quota_months;
begin
  if v_kind is null then raise exception '구구 챗봇을 쓸 수 없는 계정입니다.' using errcode = '42501'; end if;
  if v_kind = 'pastor' then
    return query select true, v_month, 0, 0, false, false, null::public.chat_request_status;
    return;
  end if;
  select * into v_row from public.chat_quota_months m where m.user_id = v_user and m.month = v_month;
  return query select
    false, v_month, coalesce(v_row.used, 0), public.chat_quota_base() + coalesce(v_row.bonus, 0),
    not exists (select 1 from public.chat_quota_requests r where r.user_id = v_user and r.month = v_month),
    exists (select 1 from public.chat_quota_requests r where r.user_id = v_user and r.month = v_month and r.status = 'pending'),
    (select r.status from public.chat_quota_requests r where r.user_id = v_user and r.month = v_month order by r.created_at desc limit 1);
end;
$$;

-- 3. 예약 · 확정 · 취소 ----------------------------------------------------------------

/**
 * 질문 하나 예약 — AI 를 부르기 전에. 목사님은 (true, null, …). 다 썼으면 hold_id null.
 * 행을 잠근 채로 '쓴 횟수 + 살아 있는 예약 < 한도' 를 보고 예약을 만든다 — 동시에 여러 번 보내도 한도를 넘지 않는다.
 */
create function public.chat_quota_reserve()
returns table (unlimited boolean, hold_id uuid, used integer, quota integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_kind  text := public.chat_quota_kind();
  v_user  uuid := public.current_user_id();
  v_month date := public.chat_month_of(now());
  v_row   public.chat_quota_months;
  v_open  integer;
  v_hold  uuid;
begin
  if v_kind is null then raise exception '구구 챗봇을 쓸 수 없는 계정입니다.' using errcode = '42501'; end if;
  if v_kind = 'pastor' then
    return query select true, null::uuid, 0, 0;
    return;
  end if;
  insert into public.chat_quota_months (user_id, month) values (v_user, v_month) on conflict do nothing;
  select * into v_row from public.chat_quota_months m where m.user_id = v_user and m.month = v_month for update;
  select count(*) into v_open from public.chat_quota_holds h
   where h.user_id = v_user and h.month = v_month and h.done_at is null and h.created_at > now() - public.chat_quota_hold_ttl();
  if v_row.used + v_open >= public.chat_quota_base() + v_row.bonus then
    return query select false, null::uuid, v_row.used, public.chat_quota_base() + v_row.bonus;
    return;
  end if;
  insert into public.chat_quota_holds (user_id, month) values (v_user, v_month) returning id into v_hold;
  return query select false, v_hold, v_row.used, public.chat_quota_base() + v_row.bonus;
end;
$$;

/** 답을 받았다 — 예약을 닫고 그 달 쓴 횟수 +1. 남의 예약 · 닫힌 예약 · 무효가 된 예약이면 아무 일 없음 */
create function public.chat_quota_commit(p_hold uuid)
returns table (used integer, quota integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_user uuid := public.current_user_id();
  v_hold public.chat_quota_holds;
  v_row  public.chat_quota_months;
begin
  update public.chat_quota_holds h set done_at = now()
   where h.id = p_hold and h.user_id = v_user and h.done_at is null and h.created_at > now() - public.chat_quota_hold_ttl()
  returning * into v_hold;
  if found then
    update public.chat_quota_months m set used = m.used + 1, updated_at = now()
     where m.user_id = v_user and m.month = v_hold.month
    returning * into v_row;
  else
    select * into v_row from public.chat_quota_months m where m.user_id = v_user and m.month = public.chat_month_of(now());
  end if;
  return query select coalesce(v_row.used, 0), public.chat_quota_base() + coalesce(v_row.bonus, 0);
end;
$$;

/** 답을 못 받았다(오류 · 거절 · 시간 초과) — 예약만 닫는다. 세지 않는다 */
create function public.chat_quota_release(p_hold uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.chat_quota_holds h set done_at = now()
   where h.id = p_hold and h.user_id = public.current_user_id() and h.done_at is null
$$;

-- 4. 추가 신청 · 처리 --------------------------------------------------------------

/** 지난달 신청의 사유 글을 지운다(보관하지 않는다) */
create function public.chat_quota_purge_reasons()
returns void language sql volatile security definer set search_path = '' as $$
  update public.chat_quota_requests r set reason = null
   where r.month < public.chat_month_of(now()) and r.reason is not null
$$;

/**
 * 추가 신청 — 리더만, 이번 달 다 썼을 때만. 그달 첫 신청이면 바로 +5(auto), 아니면 대기(pending, 사유 100자까지).
 * 돌려주는 것: 신청 상태 · 신청 id(대기면 운영자 알림에 쓴다)
 */
create function public.request_chat_quota(p_reason text default null)
returns table (status public.chat_request_status, request_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_user   uuid := public.current_user_id();
  v_month  date := public.chat_month_of(now());
  v_row    public.chat_quota_months;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if public.chat_quota_kind() is distinct from 'leader' then
    raise exception '목장 리더만 신청할 수 있습니다.' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 100 then
    raise exception '사유는 100자까지입니다.' using errcode = '22023';
  end if;
  perform public.chat_quota_purge_reasons();
  insert into public.chat_quota_months (user_id, month) values (v_user, v_month) on conflict do nothing;
  select * into v_row from public.chat_quota_months m where m.user_id = v_user and m.month = v_month for update;
  if v_row.used < public.chat_quota_base() + v_row.bonus then
    raise exception '이번 달 질문이 아직 남아 있습니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.chat_quota_requests r where r.user_id = v_user and r.month = v_month and r.status = 'pending') then
    raise exception '이미 신청했습니다. 운영자가 확인하면 알려 드려요.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.chat_quota_requests r where r.user_id = v_user and r.month = v_month) then
    insert into public.chat_quota_requests (user_id, month, status, amount, decided_at)
    values (v_user, v_month, 'auto', 5, now()) returning id into v_id;
    update public.chat_quota_months m set bonus = m.bonus + 5, updated_at = now() where m.user_id = v_user and m.month = v_month;
    return query select 'auto'::public.chat_request_status, v_id;
    return;
  end if;
  insert into public.chat_quota_requests (user_id, month, status, reason)
  values (v_user, v_month, 'pending', v_reason) returning id into v_id;
  return query select 'pending'::public.chat_request_status, v_id;
end;
$$;

/** 운영자 — 이번 달 대기 신청. 대화 내용은 없다(원래 폰에만 있다). mine 은 운영자 본인 신청(처리할 수 없다) */
create function public.list_chat_quota_requests()
returns table (
  id          uuid,
  user_id     uuid,
  name        text,
  group_name  text,
  used        integer,
  quota       integer,
  reason      text,
  created_at  timestamptz,
  mine        boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception '운영자만 볼 수 있습니다.' using errcode = '42501'; end if;
  return query
  select r.id, r.user_id, coalesce(p.name, u.name), g.name,
         coalesce(m.used, 0), public.chat_quota_base() + coalesce(m.bonus, 0),
         r.reason, r.created_at, r.user_id = public.current_user_id()
    from public.chat_quota_requests r
    join public.users u on u.id = r.user_id
    left join public.persons p on p.user_id = u.id and p.status = 'active'
    left join public.groups g on g.id = p.group_id
    left join public.chat_quota_months m on m.user_id = r.user_id and m.month = r.month
   where r.status = 'pending' and r.month = public.chat_month_of(now())
   order by r.created_at;
end;
$$;

/** 대기 신청 수(운영자 승인 배지) — 이번 달 것만 */
create function public.chat_quota_pending_count()
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then (
    select count(*)::integer from public.chat_quota_requests r
     where r.status = 'pending' and r.month = public.chat_month_of(now())
  ) else 0 end
$$;

/**
 * 운영자 처리 — p_amount 5 · 10 · 20 이면 승인(그 달 추가분 +), null 이면 거절. 본인 신청 · 지난달 신청 · 이미 처리한 신청은 못 한다.
 * 돌려주는 것: 신청자 users.id(웹 푸시)
 */
create function public.decide_chat_quota_request(p_id uuid, p_amount integer default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_admin uuid := public.current_user_id();
  v_req   public.chat_quota_requests;
begin
  if not public.is_admin() then raise exception '운영자만 처리할 수 있습니다.' using errcode = '42501'; end if;
  if p_amount is not null and p_amount not in (5, 10, 20) then
    raise exception '추가 수는 5 · 10 · 20 중 하나입니다.' using errcode = '22023';
  end if;
  perform public.chat_quota_purge_reasons();
  select * into v_req from public.chat_quota_requests r where r.id = p_id for update;
  if not found or v_req.status <> 'pending' then raise exception '처리할 신청이 없습니다.' using errcode = '22023'; end if;
  if v_req.user_id = v_admin then raise exception '본인 신청은 처리할 수 없습니다.' using errcode = '42501'; end if;
  if v_req.month <> public.chat_month_of(now()) then raise exception '지난달 신청입니다.' using errcode = '22023'; end if;
  update public.chat_quota_requests r
     set status = case when p_amount is null then 'rejected' else 'approved' end::public.chat_request_status,
         amount = p_amount, decided_at = now(), decided_by = v_admin
   where r.id = p_id;
  if p_amount is not null then
    insert into public.chat_quota_months (user_id, month) values (v_req.user_id, v_req.month) on conflict do nothing;
    update public.chat_quota_months m set bonus = m.bonus + p_amount, updated_at = now()
     where m.user_id = v_req.user_id and m.month = v_req.month;
  end if;
  return v_req.user_id;
end;
$$;

-- 5. 실행 권한 ------------------------------------------------------------------------

revoke execute on function
  public.chat_quota_kind(), public.chat_quota_status(), public.chat_quota_reserve(), public.chat_quota_commit(uuid),
  public.chat_quota_release(uuid), public.chat_quota_purge_reasons(), public.request_chat_quota(text),
  public.list_chat_quota_requests(), public.chat_quota_pending_count(), public.decide_chat_quota_request(uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.chat_quota_status(), public.chat_quota_reserve(), public.chat_quota_commit(uuid),
  public.chat_quota_release(uuid), public.request_chat_quota(text),
  public.list_chat_quota_requests(), public.chat_quota_pending_count(), public.decide_chat_quota_request(uuid, integer)
to authenticated;
