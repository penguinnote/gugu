-- ===========================================================================
-- Step 7 — 웹 푸시 (2026-10-03, PRD §6.4 · 06 §4.2)
--
-- 알림 셋: 월요일 미제출(마감 전날 오후 8시) · 제출 완료(같은 목장 다른 리더) · 목사님 스탬프(목장 리더).
-- 발송은 서버(Next 라우트·서버 액션, web-push + VAPID)가 서버 전용 키(service_role)로 한다.
-- 이 마이그레이션은 그 서버가 쓰는 저장소와 "누구에게" 를 정한다.
--
--   push_subscriptions  기기 하나 = endpoint 하나. 한 사람이 폰·PC 둘 다 받을 수 있다 —
--                       users.push_subscription(한 칸)을 대신한다. 그 두 컬럼은 지운다
--   쓰기                save_push_subscription · remove_push_subscription 함수로만. 같은 endpoint 를
--                       다른 사람이 저장하면 그 사람에게 옮긴다 — 한 기기에서 계정을 바꾸면 이전 사람의
--                       알림이 계속 오면 안 된다. 읽기는 내 구독만(남의 endpoint·키는 발송 비밀이다)
--   push_log            같은 알림을 두 번 보내지 않는다 — (dedupe_key, user_id) 유일. 크론이 두 번 돌거나
--                       다시 제출해도 한 번. claim_push 가 처음 잡은 사람만 돌려준다
--   받는 사람 함수      service_role 만 실행한다. 리더는 명단 기준(persons.group_role = leader, active)
--                       이고 계정이 있어야 받는다. 운영자 겸 리더도 리더다
-- ===========================================================================

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer not null default 0
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  '웹 푸시 구독. 기기 하나 = endpoint 하나. 쓰기는 save/remove 함수로만, 읽기는 본인 것만. 발송은 서버(service_role).';

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = public.current_user_id());

grant select on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- 한 칸짜리 옛 컬럼은 쓰지 않는다. 남겨 두면 "등록됐나" 의 출처가 둘이 된다.
alter table public.users drop column push_subscription, drop column push_registered_at;

create function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := public.current_user_id();
begin
  if v_me is null or not public.is_app_user() then
    raise exception '승인된 사용자만 알림을 켤 수 있습니다.' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception '구독 정보가 올바르지 않습니다.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now(), failure_count = 0;
end;
$$;

create function public.remove_push_subscription(p_endpoint text)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = public.current_user_id();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant  execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant  execute on function public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 발송 기록 — 같은 알림은 한 번
-- ---------------------------------------------------------------------------

create table public.push_log (
  id         bigint generated always as identity primary key,
  dedupe_key text not null,          -- reminder:<week> · submitted:<report> · stamped:<report>:<stamp> · test:<ts>
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (dedupe_key, user_id)
);

comment on table public.push_log is
  '알림 발송 기록. (dedupe_key, user_id) 유일 — 크론 중복·재제출에도 한 번만. 서버 전용.';

alter table public.push_log enable row level security;
-- 정책 없음 — authenticated 는 아무것도 못 한다. 서버(service_role)만.
revoke all on public.push_log from anon, authenticated;
grant select, insert, delete on public.push_log to service_role;

create function public.claim_push(p_key text, p_users uuid[])
returns setof uuid
language sql volatile security definer set search_path = ''
as $$
  insert into public.push_log (dedupe_key, user_id)
  select p_key, u from unnest(p_users) as u
  on conflict (dedupe_key, user_id) do nothing
  returning user_id;
$$;

-- ---------------------------------------------------------------------------
-- 받는 사람
-- ---------------------------------------------------------------------------

-- 그 주 보고서를 아직 제출하지 않은 목장의 리더 전원. 휴주면 없다.
create function public.push_reminder_targets(p_week_key date)
returns table (user_id uuid, group_id uuid, group_name text)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, g.id, g.name
  from public.groups g
  join public.persons p on p.group_id = g.id
  join public.users u on u.id = p.user_id
  where g.status = 'active'
    and p.group_role = 'leader' and p.status = 'active'
    and u.role in ('leader', 'admin') and u.status = 'active'
    and not exists (select 1 from public.skipped_weeks s where s.week_key = p_week_key)
    and not exists (
      select 1 from public.reports r
      where r.group_id = g.id and r.week_key = p_week_key and r.submitted_at is not null
    )
  order by g.number, p.name;
$$;

-- 그 보고서 목장의 리더 전원, 한 명 제외(제출한 사람). 스탬프는 제외 없이.
create function public.push_group_targets(p_report_id uuid, p_exclude uuid default null)
returns table (user_id uuid, group_id uuid, group_name text, week_key date)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, g.id, g.name, r.week_key
  from public.reports r
  join public.groups g on g.id = r.group_id
  join public.persons p on p.group_id = g.id
  join public.users u on u.id = p.user_id
  where r.id = p_report_id
    and p.group_role = 'leader' and p.status = 'active'
    and u.role in ('leader', 'admin') and u.status = 'active'
    and (p_exclude is null or p.user_id <> p_exclude)
  order by p.name;
$$;

revoke execute on function public.claim_push(text, uuid[]) from public, anon, authenticated;
revoke execute on function public.push_reminder_targets(date) from public, anon, authenticated;
revoke execute on function public.push_group_targets(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.claim_push(text, uuid[]) to service_role;
grant  execute on function public.push_reminder_targets(date) to service_role;
grant  execute on function public.push_group_targets(uuid, uuid) to service_role;
