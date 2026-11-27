-- ===========================================================================
-- 목사님 한마디 (2026-11-10)
--
--   사용자 요청 — 확인(자동) · '기도하겠습니다' 도장(한 탭)에 더해, 목사님이 원할 때만 리더에게 짧은 한마디를 남긴다.
--   Step 5 의 원칙("매주 12개에 글을 쓰는 설계는 0 이 된다")은 그대로 — 한마디는 **선택**이다. 확인 · 도장만으로도 충분하다.
--
--   report_reviews.note      200자까지. 비우면(빈 글 · 공백만) 지워진다(null). 고쳐 쓸 수 있다.
--   report_reviews.note_at   마지막으로 쓰거나 지운 시각.
--   set_report_note(p_report_id, p_note)  목사님만. 제출된 보고서만. 읽음 행이 없으면 만든다(상세 안에서만 쓴다). 돌려주는 값 = 지금 한마디.
--   읽기     report_reviews 의 기존 정책 그대로 — 목사님 · 그 목장 리더만. 운영자는 0행(본문을 못 보는 원칙).
--   지우기   보고서가 지워지면 함께(cascade) — 보관 기간 정리도 그대로.
-- ===========================================================================

alter table public.report_reviews
  add column note    text check (note is null or char_length(note) between 1 and 200),
  add column note_at timestamptz;

comment on column public.report_reviews.note is '목사님 한마디(선택, 200자까지). set_report_note 로만 쓴다. 그 목장 리더 · 목사님만 읽는다.';
comment on column public.report_reviews.note_at is '한마디를 마지막으로 쓰거나 지운 시각.';

create function public.set_report_note(p_report_id uuid, p_note text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me   uuid := public.current_user_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_pastor() then
    raise exception '목사님만 한마디를 남길 수 있습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and r.submitted_at is not null) then
    raise exception '제출된 보고서가 아닙니다.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception '한마디는 200자까지입니다.' using errcode = '22023';
  end if;

  insert into public.report_reviews (report_id, reviewer_id)
  values (p_report_id, v_me)
  on conflict (report_id) do nothing;

  update public.report_reviews
     set note = v_note, note_at = now()
   where report_id = p_report_id;

  return v_note;
end;
$$;

revoke execute on function public.set_report_note(uuid, text) from public, anon, authenticated;
grant  execute on function public.set_report_note(uuid, text) to authenticated;
comment on function public.set_report_note(uuid, text) is '목사님 한마디 쓰기 · 고치기 · 지우기(빈 글). 목사님만, 제출된 보고서만, 200자까지(2026-11-10).';
