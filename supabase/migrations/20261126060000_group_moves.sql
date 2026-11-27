-- 목장 이동 신청(2026-11-26 사용자 결정) — 리더가 신청하고 받는 쪽 목장 리더(또는 목사님)가 수락하면 명단이 저절로 바뀐다.
--
--   신청   지금 목장(A) 리더가 '보내기'(push). 새가족 추가에서 같은 이름이 다른 목장에 있을 때는 받을 목장(B) 리더가
--          '데려오기'(pull)도 건다. 한 사람에게 대기 중인 신청은 하나. 신청한 사람은 취소한다.
--   수락   신청하지 않은 쪽 목장 리더 누구나, 또는 목사님. 앱을 쓰는 리더가 없는 목장이어도 목사님이 처리한다.
--   옮기기 persons.group_id 를 바꾸고 목장장 표시 · 보고서 숨김 · 순서를 내린다. 리더는 리더 그대로.
--          계정이 연결된 리더도 된다 — 앱 계정 쪽에는 목장 정보가 없다(current_user_context 가 persons 에서 읽는다).
--          알림 구독 · 아바타는 사람(계정)에 붙어 있고, 열매 · 마을은 목장에 붙어 있어 옮긴 뒤에는 B 의 것을 쓴다.
--          이미 쓴 기록은 쓴 목장(group_id_at_write)에 그대로 남는다.
--   이번 주 그 주에 이미 어느 보고서에든 그 사람 기록이 있으면 그 주는 A 에 두고 B 에는 다음 주부터(persons.group_since).
--          기록이 아직 없으면 이번 주부터 B. 보고서 명단(submit_report · 화면)은 group_since 가 그 주보다 늦으면 넣지 않는다.
--   기한   2주 지난 대기 신청은 저절로 닫힌다(expired) — 쓰기 함수가 부를 때마다 정리하고, pg_cron 이 있으면 매일도.
--   목사님 · 운영자의 '바로 옮기기'(move_person_group)는 그대로 두고, 같은 group_since 규칙과 이동 기록만 더한다.

create type public.group_move_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired');

alter table public.persons add column group_since date;
comment on column public.persons.group_since is
  '지금 목장 보고서에 나오기 시작하는 주(목장 이동, 2026-11-26). null 이면 제한 없음. 목장 이동 처리만 적는다.';

create table public.group_moves (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.persons (id) on delete cascade,
  from_group_id  uuid not null references public.groups (id) on delete restrict,
  to_group_id    uuid not null references public.groups (id) on delete restrict,
  direction      text not null default 'push',
  status         public.group_move_status not null default 'pending',
  note           text,
  requested_by   uuid references public.users (id) on delete set null,
  requested_at   timestamptz not null default now(),
  decided_by     uuid references public.users (id) on delete set null,
  decided_at     timestamptz,
  constraint group_moves_direction_ck check (direction in ('push', 'pull', 'direct')),
  constraint group_moves_groups_ck check (from_group_id <> to_group_id),
  constraint group_moves_note_ck check (note is null or char_length(note) <= 100)
);
comment on table public.group_moves is
  '목장 이동 신청 · 이력(2026-11-26). push 지금 목장 리더가 보냄 · pull 받을 목장 리더가 데려오기 · direct 목사님 · 운영자가 바로 옮김.';

create unique index group_moves_one_pending on public.group_moves (person_id) where status = 'pending';
create index group_moves_to_idx on public.group_moves (to_group_id, status);
create index group_moves_from_idx on public.group_moves (from_group_id, status);

alter table public.group_moves enable row level security;
grant select on public.group_moves to authenticated;
-- 읽기 — 두 목장 리더 · 목사님 · 운영자. 쓰기는 아래 함수로만(정책 없음)
create policy group_moves_select on public.group_moves for select to authenticated
  using (public.is_leader_of(from_group_id) or public.is_leader_of(to_group_id) or public.is_pastor() or public.is_admin());

-- 2주 지난 대기 신청 닫기
create or replace function public._expire_group_moves()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.group_moves set status = 'expired', decided_at = now()
   where status = 'pending' and requested_at < now() - interval '14 days';
$$;
revoke execute on function public._expire_group_moves() from public, anon, authenticated;

-- 신청
create or replace function public.request_group_move(p_person_id uuid, p_to_group_id uuid, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me     uuid := public.current_user_id();
  v_person public.persons%rowtype;
  v_dir    text;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_id     uuid;
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  perform public._expire_group_moves();
  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found or v_person.group_id is null or v_person.status not in ('active', 'dormant') then
    raise exception '옮길 수 있는 사람이 아닙니다.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_to_group_id and g.status = 'active') or p_to_group_id = v_person.group_id then
    raise exception '옮길 목장을 다시 골라 주세요.' using errcode = '22023';
  end if;
  if public.is_leader_of(v_person.group_id) then
    v_dir := 'push';
  elsif public.is_leader_of(p_to_group_id) then
    v_dir := 'pull';
  else
    raise exception '목장 이동은 그 목장 리더가 신청합니다.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 100 then
    raise exception '메모는 100자까지입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.persons p where p.group_id = p_to_group_id and p.name = v_person.name and p.status <> 'left') then
    raise exception '옮길 목장에 같은 이름이 이미 있습니다.' using errcode = '23505';
  end if;
  if exists (select 1 from public.group_moves m where m.person_id = p_person_id and m.status = 'pending') then
    raise exception '이미 대기 중인 목장 이동 신청이 있습니다.' using errcode = '23505';
  end if;
  insert into public.group_moves (person_id, from_group_id, to_group_id, direction, note, requested_by)
  values (p_person_id, v_person.group_id, p_to_group_id, v_dir, v_note, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- 취소 — 신청한 사람만
create or replace function public.cancel_group_move(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public._expire_group_moves();
  update public.group_moves m set status = 'cancelled', decided_by = public.current_user_id(), decided_at = now()
   where m.id = p_id and m.status = 'pending' and m.requested_by = public.current_user_id();
  if not found then
    raise exception '취소할 수 있는 신청이 아닙니다.' using errcode = '22023';
  end if;
end;
$$;

-- 수락 · 거절 — 신청하지 않은 쪽 목장 리더 또는 목사님
create or replace function public.decide_group_move(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_move   public.group_moves%rowtype;
  v_person public.persons%rowtype;
  v_week   date := public.kst_current_week();
  v_since  date;
begin
  perform public._expire_group_moves();
  select * into v_move from public.group_moves m where m.id = p_id for update;
  if not found then
    raise exception '없는 신청입니다.' using errcode = '22023';
  end if;
  -- 기한(2주)이 지나 방금 닫힌 신청 — 닫힌 것은 남기고 알린다(예외로 되돌리지 않는다)
  if v_move.status = 'expired' then
    return jsonb_build_object('status', 'expired', 'person_id', v_move.person_id);
  end if;
  if v_move.status <> 'pending' then
    raise exception '이미 처리된 신청입니다.' using errcode = '22023';
  end if;
  if not (public.is_pastor()
          or (v_move.direction = 'push' and public.is_leader_of(v_move.to_group_id))
          or (v_move.direction = 'pull' and public.is_leader_of(v_move.from_group_id))) then
    raise exception '받는 목장 리더나 목사님이 처리합니다.' using errcode = '42501';
  end if;

  if not p_accept then
    update public.group_moves set status = 'rejected', decided_by = public.current_user_id(), decided_at = now() where id = p_id;
    return jsonb_build_object('status', 'rejected', 'person_id', v_move.person_id, 'requested_by', v_move.requested_by,
                              'from_group_id', v_move.from_group_id, 'to_group_id', v_move.to_group_id);
  end if;

  select * into v_person from public.persons p where p.id = v_move.person_id for update;
  if v_person.group_id is distinct from v_move.from_group_id or v_person.status not in ('active', 'dormant') then
    update public.group_moves set status = 'cancelled', decided_by = public.current_user_id(), decided_at = now() where id = p_id;
    raise exception '그 사이 다른 목장으로 옮겼거나 떠난 분입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.persons p where p.group_id = v_move.to_group_id and p.name = v_person.name and p.status <> 'left' and p.id <> v_person.id) then
    raise exception '옮길 목장에 같은 이름이 이미 있습니다.' using errcode = '23505';
  end if;
  -- 그 주에 이미 기록이 있으면(어느 보고서든) 그 주는 A 에 두고 B 에는 다음 주부터
  v_since := case when exists (select 1 from public.weekly_records w where w.person_id = v_person.id and w.week_key = v_week)
                  then v_week + 7 else v_week end;

  perform set_config('gg.staff_rpc', '1', true);
  update public.persons
     set group_id = v_move.to_group_id, is_group_head = false, group_since = v_since, report_hidden = false, report_order = null
   where id = v_person.id;
  perform set_config('gg.staff_rpc', '', true);

  update public.group_moves set status = 'accepted', decided_by = public.current_user_id(), decided_at = now() where id = p_id;
  return jsonb_build_object('status', 'accepted', 'person_id', v_move.person_id, 'requested_by', v_move.requested_by,
                            'from_group_id', v_move.from_group_id, 'to_group_id', v_move.to_group_id, 'since', v_since);
end;
$$;

-- 화면용 목록 — 내가 볼 수 있는 대기 신청(이름 · 목장 이름 · 내가 처리할 수 있나 · 내가 걸었나). 2주 지난 것은 빼고 보인다
create or replace function public.list_group_moves()
returns table (id uuid, person_id uuid, person_name text, from_group_id uuid, from_group_name text, to_group_id uuid, to_group_name text,
               direction text, note text, requested_by uuid, requester_name text, requested_at timestamptz, can_decide boolean, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.person_id, p.name, m.from_group_id, gf.name, m.to_group_id, gt.name, m.direction, m.note, m.requested_by,
         coalesce(rp.name, u.name), m.requested_at,
         (public.is_pastor()
          or (m.direction = 'push' and public.is_leader_of(m.to_group_id))
          or (m.direction = 'pull' and public.is_leader_of(m.from_group_id))),
         m.requested_by = public.current_user_id()
    from public.group_moves m
    join public.persons p on p.id = m.person_id
    join public.groups gf on gf.id = m.from_group_id
    join public.groups gt on gt.id = m.to_group_id
    left join public.users u on u.id = m.requested_by
    left join public.persons rp on rp.user_id = m.requested_by
   where m.status = 'pending'
     and m.requested_at >= now() - interval '14 days'
     and (public.is_leader_of(m.from_group_id) or public.is_leader_of(m.to_group_id) or public.is_pastor() or public.is_admin())
   order by m.requested_at
$$;

-- 알림 대상 — 그 목장의 앱 쓰는 리더(서버만)
create or replace function public.push_group_leader_targets(p_group_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id from public.persons p join public.users u on u.id = p.user_id
   where p.group_id = p_group_id and p.group_role = 'leader' and p.status = 'active'
     and u.role in ('leader', 'admin') and u.status = 'active'
   order by p.name
$$;

revoke execute on function public.request_group_move(uuid, uuid, text) from public, anon;
revoke execute on function public.cancel_group_move(uuid) from public, anon;
revoke execute on function public.decide_group_move(uuid, boolean) from public, anon;
revoke execute on function public.list_group_moves() from public, anon;
revoke execute on function public.push_group_leader_targets(uuid) from public, anon, authenticated;
grant execute on function public.request_group_move(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_group_move(uuid) to authenticated;
grant execute on function public.decide_group_move(uuid, boolean) to authenticated;
grant execute on function public.list_group_moves() to authenticated;
grant execute on function public.push_group_leader_targets(uuid) to service_role;

-- 목사님 · 운영자의 바로 옮기기 — 그대로 두고 같은 '이번 주' 규칙과 이동 기록만 더한다
create or replace function public.move_person_group(p_person_id uuid, p_group_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person public.persons%rowtype;
  v_week   date := public.kst_current_week();
begin
  if not (public.is_pastor() or public.is_admin()) then
    raise exception '목장 옮기기는 목사님 · 운영자가 합니다.' using errcode = '42501';
  end if;
  select * into v_person from public.persons p where p.id = p_person_id for update;
  if not found then raise exception '명단에 없는 사람입니다.' using errcode = '22023'; end if;
  if v_person.user_id is not null then
    raise exception '앱 계정이 연결된 리더는 운영자 화면에서 옮겨 주세요.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.status = 'active') then
    raise exception '없는 목장입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.persons p where p.group_id = p_group_id and p.name = v_person.name and p.status <> 'left' and p.id <> p_person_id) then
    raise exception '옮길 목장에 같은 이름이 이미 있습니다.' using errcode = '23505';
  end if;
  perform set_config('gg.staff_rpc', '1', true);
  update public.persons
     set group_id = p_group_id, is_group_head = false,
         group_since = case when exists (select 1 from public.weekly_records w where w.person_id = p_person_id and w.week_key = v_week)
                            then v_week + 7 else v_week end
   where id = p_person_id;
  perform set_config('gg.staff_rpc', '', true);
  -- 대기 중인 신청은 닫고, 이력을 남긴다(기록 화면의 '어느 목장에서 왔는지')
  update public.group_moves set status = 'cancelled', decided_by = public.current_user_id(), decided_at = now()
   where person_id = p_person_id and status = 'pending';
  if v_person.group_id is not null and v_person.group_id <> p_group_id then
    insert into public.group_moves (person_id, from_group_id, to_group_id, direction, status, requested_by, decided_by, decided_at)
    values (p_person_id, v_person.group_id, p_group_id, 'direct', 'accepted', public.current_user_id(), public.current_user_id(), now());
  end if;
end;
$$;

-- 명단 가드 — 목장 옮긴 주는 목장 이동 처리만 적는다(2026-11-26)
create or replace function public.persons_staff_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.current_user_id() is null or public.is_admin() or current_setting('gg.staff_rpc', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 들어온 날은 오늘 — 지난 주 보고서에서 넣으면 그 주(이번 주 앞 3주까지)로 앞당길 수 있다(2026-11-06). 미래는 안 된다
    new.joined_at := least(greatest(coalesce(new.joined_at, (now() at time zone 'Asia/Seoul')::date), public.kst_current_week() - 21),
                           (now() at time zone 'Asia/Seoul')::date);
    new.care_status := 'active';
    new.group_since := null;  -- 목장 옮긴 주(2026-11-26)는 목장 이동 처리만 적는다
    if new.status = 'opted_out' then
      raise exception '기록 제외는 운영자만 정합니다.' using errcode = '42501';
    end if;
    -- AI 동의는 목사님 · 운영자가 동의서를 받고 적는다(2026-11-13) — 리더가 넣는 사람은 동의 전으로
    if new.ai_consented_at is not null and not public.is_pastor() then
      raise exception 'AI 동의는 목사님 · 운영자만 적습니다.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and (new.status = 'opted_out' or old.status = 'opted_out') then
    raise exception '기록 제외는 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- AI 동의 · 철회는 목사님 · 운영자만(2026-11-13, 예전 'AI 정리에서 빼기')
  if (new.ai_consented_at is distinct from old.ai_consented_at or new.ai_excluded is distinct from old.ai_excluded) and not public.is_pastor() then
    raise exception 'AI 동의는 목사님 · 운영자만 바꿉니다.' using errcode = '42501';
  end if;
  -- 목장 옮긴 주(2026-11-26)는 목장 이동 처리(decide_group_move · move_person_group)만 적는다
  if new.group_since is distinct from old.group_since then
    raise exception '목장 옮긴 주는 목장 이동 처리로만 바뀝니다.' using errcode = '42501';
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
  -- 양을 리더로 올리기도 목사님 · 운영자만(2026-11-26 사용자 결정) — 리더 추가는 운영자와 목사님이 한다
  if old.group_role = 'member' and new.group_role = 'leader' and not public.is_pastor() then
    raise exception '리더로 바꾸는 것은 목사님 · 운영자에게 부탁해 주세요.' using errcode = '42501';
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
$function$;

-- 보고서 제출 — 그 주 명단에 '옮겨 온 사람은 옮긴 주부터' 를 더한다(나머지는 그대로)
create or replace function public.submit_report(p_report_id uuid, p_rows jsonb, p_note text DEFAULT NULL::text, p_note_dirty boolean DEFAULT false, p_note_base text DEFAULT NULL::text, p_note_check boolean DEFAULT false, p_submit boolean DEFAULT true, p_no_meeting boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_report   public.reports%rowtype;
  v_me       uuid := public.current_user_id();
  v_row      jsonb;
  v_fields   jsonb;
  v_person   uuid;
  v_expected timestamptz;
  v_set      text;
  v_key      text;
  v_n        integer;
  v_exists   boolean;
  v_prev     uuid;
  v_prayer   text;
  v_conflicts uuid[] := '{}';
  v_missing_attendance text[];
  v_missing_prayer     text[];
  v_deadline timestamptz;
  v_is_late  boolean;
  v_allowed  text[] := array['worship_attended','group_meeting_attended',
                             'one_on_one_contacted','prayer_request',
                             'worship_online','online_reason','meeting_absent_reason','absent_reason'];
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_report from public.reports r where r.id = p_report_id for update;
  -- 소유자 권한으로 돈다 — 예전엔 RLS 가 막던 것을 여기서 직접 본다. 다른 목장 보고서는 '없는 것' 으로 답한다
  if not found or not public.is_leader_of(v_report.group_id) then
    raise exception '보고서를 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if v_report.week_key > public.kst_current_week() then
    raise exception '아직 오지 않은 주차입니다.' using errcode = '22023';
  end if;
  -- 처음 제출은 이번 주와 그 앞 3주만(2026-11-04) — 몇 달 전 주를 거슬러 제출해 열매 · 기록을 만들지 못하게.
  -- 이미 낸 보고서를 고치는 건 막지 않는다
  -- 휴주가 된 주는 처음 제출하지 않는다(2026-11-06) — 열어 둔 사이 휴주로 바뀌어도 열매 · 제출 기록이 생기지 않게
  if p_submit and v_report.submitted_at is null and exists (select 1 from public.skipped_weeks s where s.week_key = v_report.week_key) then
    raise exception '휴주입니다. 이 주는 작성 대상이 아닙니다.' using errcode = '22023';
  end if;
  if v_report.submitted_at is null and v_report.week_key < public.kst_current_week() - 21 then
    raise exception '너무 지난 주차는 제출할 수 없습니다.' using errcode = '22023';
  end if;

  v_deadline := ((v_report.week_key + 3)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_prayer := null;
    v_prev   := null;

    v_person   := (v_row ->> 'person_id')::uuid;
    v_fields   := coalesce(v_row -> 'fields', '{}'::jsonb);
    v_expected := nullif(v_row ->> 'expected_updated_at', '')::timestamptz;

    for v_key in select jsonb_object_keys(v_fields) loop
      if not (v_key = any (v_allowed)) then
        raise exception '허용되지 않은 필드: %', v_key using errcode = '22023';
      end if;
    end loop;

    -- 그 주 명단(2026-11-05) — 이 보고서에 이미 기록이 있는 사람(그 뒤 떠났거나 옮겼어도 고칠 수 있다),
    -- 또는 지금 이 목장에서 활동 중이고 그 주가 끝나기 전에 들어온 사람
    if not exists (
      select 1 from public.weekly_records w
      join public.persons p on p.id = w.person_id
      where w.report_id = p_report_id and w.person_id = v_person
        and p.status <> 'opted_out'   -- 기록 제외가 된 사람의 지난 기록은 더 고치지 않는다(2026-11-06)
    ) and not exists (
      select 1 from public.persons p
      where p.id = v_person and p.group_id = v_report.group_id
        and p.joined_at <= v_report.week_key + 6
        and (p.group_since is null or p.group_since <= v_report.week_key)  -- 옮겨 온 사람은 옮긴 주부터(2026-11-26)
        and (p.status = 'active'
             -- 그 주가 끝난 뒤에 떠난 사람도 그 주 명단이다(2026-11-06)
             or (p.status = 'left' and p.left_at >= ((v_report.week_key + 7)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul'))
    ) then
      raise exception '이 목장의 명단에 없는 사람입니다.' using errcode = '22023';
    end if;

    select exists (
      select 1 from public.weekly_records w
      where w.report_id = p_report_id and w.person_id = v_person
    ) into v_exists;

    if v_fields ? 'prayer_request' then
      v_prayer := nullif(btrim(v_fields ->> 'prayer_request'), '');
      if v_prayer is not null then
        select v.id into v_prev
        from public.weekly_records_visible v
        where v.person_id = v_person and v.week_key < v_report.week_key
          and v.prayer_request is not null
        order by v.week_key desc limit 1;
      end if;
    end if;

    if v_exists then
      if v_fields = '{}'::jsonb then continue; end if;

      v_set := format('author_id = %L', v_me);
      for v_key in select jsonb_object_keys(v_fields) loop
        if v_key = 'prayer_request' then
          v_set := v_set || format(', prayer_request = %L, prayer_status = %L, prev_record_id = %L',
            v_prayer,
            case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end,
            v_prev);
        elsif v_key in ('online_reason', 'meeting_absent_reason', 'absent_reason') then
          v_set := v_set || format(', %I = %L', v_key, nullif(btrim(v_fields ->> v_key), ''));
        else
          v_set := v_set || format(', %I = %L', v_key, v_fields ->> v_key);
        end if;
      end loop;

      execute format(
        'update public.weekly_records set %s
          where report_id = $1 and person_id = $2 and updated_at = $3',
        v_set
      ) using p_report_id, v_person, v_expected;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        v_conflicts := v_conflicts || v_person;
      end if;
    else
      if not (v_fields ? 'worship_attended' and v_fields ? 'group_meeting_attended') then
        -- 임시 저장(2026-11-06)이면 출석을 아직 안 고른 사람은 건너뛴다 — 제출할 때는 그대로 막는다
        if not p_submit then continue; end if;
        raise exception '출석 상태 없이 기록을 만들 수 없습니다.' using errcode = '22023';
      end if;

      begin
        insert into public.weekly_records (
          report_id, person_id, author_id, week_key, group_id_at_write,
          worship_attended, group_meeting_attended, one_on_one_contacted,
          prayer_request, prayer_status, prev_record_id,
          worship_online, online_reason, meeting_absent_reason, absent_reason
        ) values (
          p_report_id, v_person, v_me, v_report.week_key, v_report.group_id,
          (v_fields ->> 'worship_attended')::boolean,
          (v_fields ->> 'group_meeting_attended')::boolean,
          coalesce((v_fields ->> 'one_on_one_contacted')::boolean, false),
          v_prayer,
          (case when v_prayer is null then null when v_prev is null then 'new' else 'ongoing' end)::public.prayer_status,
          v_prev,
          coalesce((v_fields ->> 'worship_online')::boolean, false),
          nullif(btrim(v_fields ->> 'online_reason'), ''),
          nullif(btrim(v_fields ->> 'meeting_absent_reason'), ''),
          nullif(btrim(v_fields ->> 'absent_reason'), '')
        );
      exception when unique_violation then
        v_conflicts := v_conflicts || v_person;
      end;
    end if;
  end loop;

  -- 특이사항은 연 뒤에 다른 리더가 바꿨으면 덮어쓰지 않는다(2026-11-06) — 나중에 낸 쪽이 앞의 것을 말없이 지웠다.
  -- p_note_check 는 새 화면만 보낸다(옛 화면은 예전처럼 쓴다)
  if p_note_dirty and p_note_check and v_report.note is distinct from p_note_base then
    return jsonb_build_object(
      'submitted', false,
      'conflicts', to_jsonb(v_conflicts),
      'note_conflict', true,
      'note', v_report.note,
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
  end if;
  if p_note_dirty then
    update public.reports set note = p_note where id = p_report_id;
  end if;
  -- 이번 주 목장 모임 없음(2026-11-06) — 그 주는 4주 목장 불참 판정에서 빠진다
  if p_no_meeting is not null then
    update public.reports set no_meeting = p_no_meeting where id = p_report_id and no_meeting is distinct from p_no_meeting;
  end if;

  -- 임시 저장 — 쓴 만큼만 남기고 제출은 하지 않는다(공동 리더가 나눠 쓴다)
  if not p_submit then
    return jsonb_build_object(
      'submitted', false,
      'saved', array_length(v_conflicts, 1) is null,
      'conflicts', to_jsonb(v_conflicts),
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
  end if;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object(
      'submitted', false,
      'conflicts', to_jsonb(v_conflicts),
      'deadline', v_deadline,
      'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                 from public.weekly_records_visible v where v.report_id = p_report_id)
    );
  end if;

  -- 출석 빈칸 — 처음 제출할 때만 본다. 이미 낸 보고서를 고칠 때 그 뒤에 들어온 사람을 채우라고 하지 않는다(2026-11-05).
  -- 그 주가 끝난 뒤 들어온 사람도 그 주 명단이 아니다
  select array_agg(p.name order by p.name) into v_missing_attendance
  from public.persons p
  where v_report.submitted_at is null
    and p.group_id = v_report.group_id
    and (p.status = 'active'
         or (p.status = 'left' and p.left_at >= ((v_report.week_key + 7)::text || ' 00:00')::timestamp at time zone 'Asia/Seoul'))
    and p.joined_at <= v_report.week_key + 6
        and (p.group_since is null or p.group_since <= v_report.week_key)  -- 옮겨 온 사람은 옮긴 주부터(2026-11-26)
    and not p.report_hidden  -- 보고서에서 숨긴 사람(2026-11-14)은 빈칸으로 치지 않는다
    and not exists (
      select 1 from public.weekly_records w
      where w.report_id = p_report_id and w.person_id = p.id
    );

  select array_agg(p.name order by p.name) into v_missing_prayer
  from public.weekly_records_visible v
  join public.persons p on p.id = v.person_id
  where v.report_id = p_report_id
    and v.group_meeting_attended
    and coalesce(btrim(v.prayer_request), '') = '';

  if v_missing_attendance is not null or v_missing_prayer is not null then
    raise exception using
      errcode = '23514',
      message = '제출 조건을 만족하지 않습니다.',
      detail  = jsonb_build_object(
        'missing_attendance', coalesce(to_jsonb(v_missing_attendance), '[]'::jsonb),
        'missing_prayer',     coalesce(to_jsonb(v_missing_prayer), '[]'::jsonb)
      )::text;
  end if;

  if v_report.submitted_at is null then
    v_is_late := now() >= v_deadline;
    update public.reports
       set submitted_at = now(), submitted_by = v_me, is_late = v_is_late
     where id = p_report_id;
    insert into public.events (user_id, type, group_id, report_id, week_key, is_late)
    values (v_me, 'report_submitted', v_report.group_id, p_report_id, v_report.week_key, v_is_late);
  else
    v_is_late := v_report.is_late;
    update public.reports set submitted_by = v_me where id = p_report_id;
  end if;

  return jsonb_build_object(
    'submitted', true,
    'conflicts', '[]'::jsonb,
    'is_late', v_is_late,
    'late_now', now() >= v_deadline,
    'deadline', v_deadline,
    'rows', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
               from public.weekly_records_visible v where v.report_id = p_report_id)
  );
end;
$function$;

-- 매일 2주 지난 대기 신청 닫기(pg_cron 이 있을 때만)
-- 운영 DB 는 pg_cron 이 이미 깔려 있다 — 확장을 새로 만들지 않고(만들면 'dependent privileges exist' 로 막혔다, 2026-11-26) 있으면 일정만 건다
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('expire-group-moves', '10 18 * * *', 'select public._expire_group_moves()')$q$;
    raise notice 'pg_cron: expire-group-moves 일정을 걸었다';
  else
    raise notice 'pg_cron 없음: expire-group-moves 일정을 걸지 못했다';
  end if;
end
$do$;
