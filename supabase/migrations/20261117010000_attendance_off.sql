-- ===========================================================================
-- 출석 제외 사유(2026-11-17 사용자 요청) — 출석을 세지 않는 사람(교환학생 · 군 복무 …)을 두세 글자로.
--   출석부 엑셀에서 그 사람의 결석 · 빈 주를 회색 칸에 이 글자로 적고, 결석으로 세지 않는다(lib/attendance-book).
--   비어 있으면 돌봄 상태(군 복무 · 원거리 · 주말 근무 · 타 교회)로, 보고서 명단에서 숨긴 사람은 '제외' 로 적는다.
--   고치는 사람: 그 목장 리더 · 목사님 · 운영자(persons_update 정책 — 다른 명단 칸과 같다).
-- ===========================================================================

alter table public.persons
  add column attendance_off text
    constraint persons_attendance_off_ck check (attendance_off is null or (char_length(attendance_off) between 1 and 4 and attendance_off = btrim(attendance_off)));
comment on column public.persons.attendance_off is '출석 제외 사유(1~4자, 2026-11-17). 있으면 출석부에서 결석을 세지 않고 회색 칸에 이 글자.';
grant update (attendance_off) on public.persons to authenticated;

-- 출석부 사람들 — 숨김 여부 · 출석 제외 사유를 더한다(돌려주는 칸이 바뀌어 다시 만든다)
drop function public.attendance_people();
create function public.attendance_people()
returns table (id uuid, name text, group_id uuid, group_role public.group_role, is_group_head boolean, care_status public.care_status,
               assembly_member boolean, training_stage text, campus text, joined_at date, report_hidden boolean, attendance_off text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_user() then
    raise exception '출석부를 볼 수 없습니다.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.group_id, p.group_role, p.is_group_head, p.care_status, p.assembly_member, p.training_stage, p.campus, p.joined_at::date,
           p.report_hidden, p.attendance_off
      from public.persons p
     where p.status in ('active', 'dormant') and p.group_id is not null;
end;
$$;
comment on function public.attendance_people() is '출석부 · 캠퍼스 명단의 사람들. 앱을 쓰는 사람 모두. 연락처 · 생년 · 비고 없음. 숨김 · 출석 제외 사유 포함(2026-11-17).';
revoke execute on function public.attendance_people() from public, anon;
grant  execute on function public.attendance_people() to authenticated;
