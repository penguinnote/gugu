-- ===========================================================================
-- AI 주간 정리 허점 고치기(2026-11-08)
--
--   다시 만들기   pastor_digests 에 만든 시각(generated_at) · 넣은 보고서 수(report_count) · 그때 목장 수(group_count) ·
--                 다시 만든 횟수(regen_count, 한 주에 많아야 3번). digest_regen — 만든 뒤 새로 제출되거나 고친 보고서가 있을 때만.
--                 다시 만드는 동안과 실패했을 때는 앞의 정리를 그대로 둔다. 새 정리가 저장되면 그 주 피드백은 지운다(항목 번호가 바뀐다)
--   빈 정리       제출된 보고서가 없는 주는 차지하지 않는다(digest_claim false) — 빈 정리를 저장하지 않는다
--   틀린 내용     pastor_digest_feedback.wrong — 도움 됨 / 아님과 따로. helpful 은 비어 있을 수 있다
--   소급 빼기     persons.ai_excluded 를 켜거나 기록 제외(opted_out)가 되면, 그 사람이 들어간 주의 정리를 통째로 지운다
--                 (그 사람 기록이 그 주에 보내졌거나 정리에 그 사람이 나오면). 목사님이 그 주를 다시 열면 빼고 새로 만든다
--   운영 카드     digest_health() — 운영자만. 최근 4주 상태 · 실패 까닭 · 버린 수 · 보고서 수. 정리 내용은 돌려주지 않는다
-- ===========================================================================

-- 1. 칸 --------------------------------------------------------------------------

alter table public.pastor_digests
  add column generated_at timestamptz,
  add column report_count integer check (report_count is null or report_count >= 0),
  add column group_count  integer check (group_count is null or group_count >= 0),
  add column regen_count  integer not null default 0 check (regen_count between 0 and 3);
comment on column public.pastor_digests.generated_at is '정리를 만든(저장한) 시각. 이 뒤에 고치거나 낸 보고서가 다시 만들기 대상이다(2026-11-08).';
comment on column public.pastor_digests.report_count is '정리에 넣은 제출된 보고서 수(2026-11-08).';
comment on column public.pastor_digests.group_count is '만들 때 운영 중인 목장 수(2026-11-08).';
comment on column public.pastor_digests.regen_count is '다시 만든 횟수 — 한 주에 많아야 3(2026-11-08).';

alter table public.pastor_digest_feedback
  alter column helpful drop not null,
  add column wrong boolean not null default false;
comment on column public.pastor_digest_feedback.wrong is '틀린 내용 신고(2026-11-08). 도움 됨 / 아님(helpful)과 따로.';

-- 2. 차지 — 제출된 보고서가 없으면 넣지 않는다. 멈춘 줄을 다시 차지해도 앞의 정리(다시 만들던 것)는 지우지 않는다 -----

create or replace function public.digest_claim(p_week date)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.pastor_digests;
begin
  if not public.is_pastor() then raise exception '목사님만 만들 수 있습니다.' using errcode = '42501'; end if;
  if p_week is null or extract(isodow from p_week) <> 7 then raise exception '주 시작일(일요일)이 아닙니다.' using errcode = '22023'; end if;
  -- 마감(그 주 수요일 0시 KST)이 지난 주만
  if ((p_week + 3)::timestamp at time zone 'Asia/Seoul') > now() then raise exception '마감이 지난 주만 정리합니다.' using errcode = '22023'; end if;
  -- 제출된 보고서가 없는 주는 빈 정리를 남기지 않는다(2026-11-08)
  if not exists (
    select 1 from public.reports r join public.groups g on g.id = r.group_id and g.status = 'active'
     where r.week_key = p_week and r.submitted_at is not null
  ) then
    return false;
  end if;
  insert into public.pastor_digests (week_key, created_by) values (p_week, public.current_user_id())
    on conflict (week_key) do nothing;
  if found then return true; end if;
  select * into v_row from public.pastor_digests where week_key = p_week for update;
  if (v_row.status = 'pending' and v_row.updated_at < now() - interval '5 minutes')
     or (v_row.status = 'failed' and v_row.updated_at < now() - interval '10 minutes') then
    update public.pastor_digests
       set status = 'pending', fail_reason = null, created_by = public.current_user_id(), updated_at = now()
     where week_key = p_week;
    return true;
  end if;
  return false;
end;
$$;

-- 3. 다시 만들기 차지 ------------------------------------------------------------------

create function public.digest_regen(p_week date)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.pastor_digests;
begin
  if not public.is_pastor() then raise exception '목사님만 다시 만들 수 있습니다.' using errcode = '42501'; end if;
  select * into v_row from public.pastor_digests where week_key = p_week for update;
  if not found or v_row.content is null then raise exception '다시 만들 정리가 없습니다.' using errcode = '22023'; end if;
  -- 누가 만드는 중이면(5분 안) 그대로 둔다
  if v_row.status = 'pending' and v_row.updated_at >= now() - interval '5 minutes' then return false; end if;
  if v_row.regen_count >= 3 then raise exception '다시 만들기는 한 주에 세 번까지입니다.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.reports r join public.groups g on g.id = r.group_id and g.status = 'active'
     where r.week_key = p_week and r.submitted_at is not null
       and r.updated_at > coalesce(v_row.generated_at, v_row.updated_at)
  ) then
    raise exception '새로 들어온 보고서가 없습니다.' using errcode = '22023';
  end if;
  update public.pastor_digests
     set status = 'pending', regen_count = regen_count + 1, fail_reason = null, created_by = public.current_user_id(), updated_at = now()
   where week_key = p_week;
  return true;
end;
$$;

-- 4. 결과 남기기 — 보고서 수 · 목장 수를 받는다. 다시 만들다 실패하면 앞의 정리를 그대로 둔다 -----------------

drop function public.digest_save(date, boolean, jsonb, text, integer, integer, integer, text);

create function public.digest_save(
  p_week date, p_ok boolean, p_content jsonb, p_model text, p_input_tokens integer, p_output_tokens integer, p_ms integer, p_fail_reason text,
  p_report_count integer default null, p_group_count integer default null
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.pastor_digests;
begin
  if not public.is_pastor() then raise exception '목사님만 남길 수 있습니다.' using errcode = '42501'; end if;
  if p_ok and (p_content is null or jsonb_typeof(p_content) <> 'object') then raise exception '정리 내용이 없습니다.' using errcode = '22023'; end if;
  select * into v_row from public.pastor_digests where week_key = p_week and status = 'pending' for update;
  if not found then raise exception '만들기를 차지한 주가 아닙니다.' using errcode = '22023'; end if;

  if p_ok then
    update public.pastor_digests
       set status = 'ready', content = p_content, model = p_model,
           input_tokens = p_input_tokens, output_tokens = p_output_tokens, ms = p_ms, fail_reason = null,
           generated_at = now(), report_count = p_report_count, group_count = p_group_count, updated_at = now()
     where week_key = p_week;
    -- 다시 만든 것이면 항목 번호가 바뀌었다 — 앞 정리에 단 피드백은 지운다
    if v_row.content is not null then
      delete from public.pastor_digest_feedback where week_key = p_week;
    end if;
  elsif v_row.content is not null then
    -- 다시 만들다 실패 — 앞의 정리를 그대로 보여 준다. 까닭만 남긴다(운영 카드)
    update public.pastor_digests
       set status = 'ready', fail_reason = coalesce(p_fail_reason, 'unknown'), updated_at = now()
     where week_key = p_week;
  else
    update public.pastor_digests
       set status = 'failed', content = null, model = p_model,
           input_tokens = p_input_tokens, output_tokens = p_output_tokens, ms = p_ms,
           fail_reason = coalesce(p_fail_reason, 'unknown'), updated_at = now()
     where week_key = p_week;
  end if;
end;
$$;

revoke execute on function public.digest_regen(date),
  public.digest_save(date, boolean, jsonb, text, integer, integer, integer, text, integer, integer) from public, anon;
grant  execute on function public.digest_regen(date),
  public.digest_save(date, boolean, jsonb, text, integer, integer, integer, text, integer, integer) to authenticated;

-- 5. AI 에서 빼기 · 기록 제외 소급 — 그 사람이 들어간 주의 정리를 지운다 ---------------------------------------

create function public.digest_forget_person()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.ai_excluded and not old.ai_excluded)
     or (new.status = 'opted_out' and old.status is distinct from 'opted_out') then
    delete from public.pastor_digests d
     where d.content::text like '%' || new.id::text || '%'
        or exists (
          select 1 from public.weekly_records wr
           where wr.person_id = new.id and wr.week_key = d.week_key
             and (nullif(btrim(coalesce(wr.prayer_request, '')), '') is not null
                  or nullif(btrim(coalesce(wr.absent_reason, '')), '') is not null
                  or nullif(btrim(coalesce(wr.meeting_absent_reason, '')), '') is not null
                  or nullif(btrim(coalesce(wr.online_reason, '')), '') is not null
                  or nullif(btrim(coalesce(wr.note, '')), '') is not null)
        );
  end if;
  return new;
end;
$$;
comment on function public.digest_forget_person() is
  'AI 에서 빼기 · 기록 제외가 켜지면 그 사람의 글이 보내졌거나 그 사람이 나오는 주의 AI 정리를 지운다(2026-11-08). 피드백은 cascade.';
revoke execute on function public.digest_forget_person() from public, anon, authenticated;

create trigger persons_digest_forget
  after update of ai_excluded, status on public.persons
  for each row execute function public.digest_forget_person();

-- 6. 운영 카드 — 최근 4주(마감 지난 주). 운영자만. 정리 내용 · 기도제목은 돌려주지 않는다 --------------------------

create function public.digest_health()
returns table (
  week_key date, skipped boolean, status text, fail_reason text, dropped integer,
  report_count integer, group_count integer, generated_at timestamptz, regen_count integer
)
language sql stable security definer set search_path = '' as $$
  select w.week_key,
         exists (select 1 from public.skipped_weeks s where s.week_key = w.week_key),
         d.status, d.fail_reason,
         case when jsonb_typeof(d.content -> 'dropped') = 'number' then (d.content ->> 'dropped')::integer end,
         d.report_count, d.group_count, d.generated_at, coalesce(d.regen_count, 0)
    from (select (public.kst_current_week() - 7 * i)::date as week_key from generate_series(0, 4) as i) w
    left join public.pastor_digests d on d.week_key = w.week_key
   where public.is_admin()
     and ((w.week_key + 3)::timestamp at time zone 'Asia/Seoul') <= now()
   order by w.week_key desc
   limit 4
$$;
comment on function public.digest_health() is 'AI 정리 운영 카드(2026-11-08) — 운영자만, 최근 4주의 상태 · 실패 까닭 · 버린 수. 내용은 없다.';
revoke execute on function public.digest_health() from public, anon;
grant  execute on function public.digest_health() to authenticated;
