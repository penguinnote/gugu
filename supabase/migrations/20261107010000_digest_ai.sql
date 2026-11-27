-- ===========================================================================
-- 목사님 주간 정리 v2 — AI 정리(2026-11-07)
--
--   저장     pastor_digests — 주마다 한 줄. 목사님만 읽는다(운영자 · 리더는 못 읽는다).
--            이름 · 목장은 {{p:<id>}} · {{g:<id>}} 자리표시로 저장하고 화면에서 RLS 로 이름을 붙인다.
--            근거 기록은 weekly_records id. 24개월 보관 정리에 함께 지운다
--   만들기   목사님이 그 주 화면을 열면 서버가 목사님 세션으로 자료를 읽어 만든다(관리자 키를 쓰지 않는다).
--            digest_claim 으로 한 번만 만들고, digest_save 로 결과를 남긴다. 실패하면 10분 뒤 다시 할 수 있다
--   피드백   pastor_digest_feedback — 항목마다 도움 됨 / 아님
--   빼기     persons.ai_excluded — AI 에 보내지 않는 사람(기록 제외 opted_out 과 같은 방식). 목사님 · 운영자만 바꾼다
-- ===========================================================================

alter table public.persons add column if not exists ai_excluded boolean not null default false;
grant update (ai_excluded) on public.persons to authenticated; -- 누가 바꾸는지는 아래 트리거가 본다
comment on column public.persons.ai_excluded is 'AI 주간 정리에 보내지 않는다(본인 요청). 목사님 · 운영자만 바꾼다(2026-11-07).';

create or replace function public.persons_staff_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 들어온 날은 오늘 — 지난 주 보고서에서 넣으면 그 주(이번 주 앞 3주까지)로 앞당길 수 있다(2026-11-06). 미래는 안 된다
    new.joined_at := least(greatest(coalesce(new.joined_at, (now() at time zone 'Asia/Seoul')::date), public.kst_current_week() - 21),
                           (now() at time zone 'Asia/Seoul')::date);
    new.care_status := 'active';
    if new.status = 'opted_out' then
      raise exception '기록 제외는 운영자만 정합니다.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and (new.status = 'opted_out' or old.status = 'opted_out') then
    raise exception '기록 제외는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- AI 정리에서 빼기는 목사님 · 운영자만(2026-11-07)
  if new.ai_excluded is distinct from old.ai_excluded and not public.is_pastor() then
    raise exception 'AI 정리에서 빼기는 목사님 · 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception '들어온 날은 운영자만 고칩니다.' using errcode = '42501';
  end if;
  if old.group_role = 'leader' and new.status is distinct from old.status then
    raise exception '리더의 상태는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- 리더를 양으로 내리기는 목사님 · 운영자만(2026-11-06) — 내린 뒤 '떠났어요' 로 리더 자리를 운영자 모르게 없앨 수 있었다
  if old.group_role = 'leader' and new.group_role = 'member' and not public.is_pastor() then
    raise exception '리더를 양으로 내리는 것은 목사님 · 운영자에게 부탁해 주세요.' using errcode = '42501';
  end if;
  -- 목장장은 정하는 것만 함수로(한 목장에 한 명). 푸는 것은 고치기 저장에 함께 실어도 된다(2026-11-06)
  if new.is_group_head and not old.is_group_head then
    raise exception '목장장은 명단 고치기의 목장장 칸으로 정합니다.' using errcode = '42501';
  end if;
  -- '떠났어요' 되돌리기는 30분 안에만(2026-11-06) — 떠났다고 해 두고 제출한 뒤 되돌려 출석 빈칸 검사를 비켜 가지 않게
  if old.status = 'left' and new.status = 'active' and (old.left_at is null or old.left_at < now() - interval '30 minutes') then
    raise exception '떠난 지 오래된 분은 운영자에게 되살려 달라고 해 주세요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create table public.pastor_digests (
  week_key      date primary key,
  status        text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  content       jsonb,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  ms            integer,
  fail_reason   text check (fail_reason is null or fail_reason ~ '^[a-z_]{1,40}$'),
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status <> 'ready' or content is not null)
);
comment on table public.pastor_digests is 'AI 주간 정리(2026-11-07). 목사님만 읽는다. 본문은 자리표시(이름 없음) · 근거 기록 id.';
comment on column public.pastor_digests.fail_reason is '실패 까닭 — 짧은 영문 코드만(본문 · 기도제목을 남기지 않는다).';

alter table public.pastor_digests enable row level security;
create policy pastor_digests_read on public.pastor_digests for select to authenticated using (public.is_pastor());
grant select on public.pastor_digests to authenticated;

create table public.pastor_digest_feedback (
  week_key   date not null references public.pastor_digests (week_key) on delete cascade,
  item_key   text not null check (item_key ~ '^[a-z]{1,3}:[0-9a-f-]{1,36}$'),
  user_id    uuid not null references public.users (id) on delete cascade default public.current_user_id(),
  helpful    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (week_key, item_key, user_id)
);
comment on table public.pastor_digest_feedback is 'AI 주간 정리 항목마다 도움 됨 / 아님(2026-11-07). 자기 것만.';

alter table public.pastor_digest_feedback enable row level security;
create policy pastor_digest_feedback_read on public.pastor_digest_feedback for select to authenticated
  using (public.is_pastor() and user_id = public.current_user_id());
create policy pastor_digest_feedback_insert on public.pastor_digest_feedback for insert to authenticated
  with check (public.is_pastor() and user_id = public.current_user_id());
create policy pastor_digest_feedback_update on public.pastor_digest_feedback for update to authenticated
  using (public.is_pastor() and user_id = public.current_user_id())
  with check (public.is_pastor() and user_id = public.current_user_id());
grant select, insert, update on public.pastor_digest_feedback to authenticated;

-- 만들기 차지 — 처음이면 pending 으로 넣고 true. 이미 있으면: 실패했거나 멈춘 지 오래(pending 5분 · failed 10분)면 다시 차지, 아니면 false
create function public.digest_claim(p_week date)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.pastor_digests;
begin
  if not public.is_pastor() then raise exception '목사님만 만들 수 있습니다.' using errcode = '42501'; end if;
  if p_week is null or extract(isodow from p_week) <> 7 then raise exception '주 시작일(일요일)이 아닙니다.' using errcode = '22023'; end if;
  -- 마감(그 주 수요일 0시 KST)이 지난 주만
  if ((p_week + 3)::timestamp at time zone 'Asia/Seoul') > now() then raise exception '마감이 지난 주만 정리합니다.' using errcode = '22023'; end if;
  insert into public.pastor_digests (week_key, created_by) values (p_week, public.current_user_id())
    on conflict (week_key) do nothing;
  if found then return true; end if;
  select * into v_row from public.pastor_digests where week_key = p_week for update;
  if (v_row.status = 'pending' and v_row.updated_at < now() - interval '5 minutes')
     or (v_row.status = 'failed' and v_row.updated_at < now() - interval '10 minutes') then
    update public.pastor_digests
       set status = 'pending', content = null, fail_reason = null, created_by = public.current_user_id(), updated_at = now()
     where week_key = p_week;
    return true;
  end if;
  return false;
end;
$$;

-- 결과 남기기 — 차지한 줄(pending)만
create function public.digest_save(
  p_week date, p_ok boolean, p_content jsonb, p_model text, p_input_tokens integer, p_output_tokens integer, p_ms integer, p_fail_reason text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_pastor() then raise exception '목사님만 남길 수 있습니다.' using errcode = '42501'; end if;
  if p_ok and (p_content is null or jsonb_typeof(p_content) <> 'object') then raise exception '정리 내용이 없습니다.' using errcode = '22023'; end if;
  update public.pastor_digests
     set status = case when p_ok then 'ready' else 'failed' end,
         content = case when p_ok then p_content else null end,
         model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens, ms = p_ms,
         fail_reason = case when p_ok then null else coalesce(p_fail_reason, 'unknown') end,
         updated_at = now()
   where week_key = p_week and status = 'pending';
  if not found then raise exception '만들기를 차지한 주가 아닙니다.' using errcode = '22023'; end if;
end;
$$;

revoke execute on function public.digest_claim(date), public.digest_save(date, boolean, jsonb, text, integer, integer, integer, text) from public, anon;
grant  execute on function public.digest_claim(date), public.digest_save(date, boolean, jsonb, text, integer, integer, integer, text) to authenticated;

create or replace function public.purge_expired_records()
returns table (deleted_records bigint, deleted_reports bigint)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_cutoff  date := public.retention_cutoff();
  v_records bigint;
  v_reports bigint;
begin
  -- 실행 권한을 거둬 두었지만, 앱 세션으로 들어온 호출은 이름이 무엇이든 한 번 더 막는다.
  if public.current_user_id() is not null then
    raise exception '보관 정리는 예약 작업만 실행합니다.' using errcode = '42501';
  end if;

  delete from public.weekly_records where week_key < v_cutoff;
  get diagnostics v_records = row_count;

  delete from public.reports where week_key < v_cutoff;
  get diagnostics v_reports = row_count;

  -- AI 주간 정리도 같은 기한(2026-11-07)
  delete from public.pastor_digests where week_key < v_cutoff;

  insert into public.app_meta (key, value) values
    ('retention_last_run', now()::text),
    ('retention_last_deleted', format('records=%s reports=%s', v_records, v_reports))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return query select v_records, v_reports;
end;
$$;
