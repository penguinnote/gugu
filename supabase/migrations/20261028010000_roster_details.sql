-- ===========================================================================
-- 명단의 나머지 칸 · 섬김 부서 · 명단 엑셀 (2026-10-28)
--
-- 목표: 교회 명단 엑셀('명단_및_현황')을 앱에서 고치고, 내보내면 같은 모양의 최신 엑셀이 나온다.
-- 엑셀에는 있는데 앱에 없던 칸을 더하고, 각 목장 리더가 자기 목장 사람의 모든 칸을 고칠 수 있게 한다.
--
--   1) groups.village — 마을(믿음 · 소망 · 사랑 · 은혜). set_group_village 로 그 목장 리더 · 목사님 · 운영자가 바꾼다
--   2) persons 의 나머지 칸 — 직업(occupation) · 소속(affiliation) · 청년대학부 회원(youth_member) ·
--      공동의회 회원(assembly_member) · 비고(note). 훈련단계 · 출생년도도 이제 화면에서 고친다(컬럼 권한)
--      RLS persons_update 가 이미 '자기 목장 리더 · 목사님 · 운영자' 로 묶는다 — 다른 목장으로 옮기지는 못한다
--   3) 섬김 부서 — ministries(부서 목록, 엑셀 순서) · person_ministries(누가 어느 부서, 여럿 가능).
--      읽기 = 그 사람을 볼 수 있는 사람(persons RLS 를 그대로 탄다), 넣기 · 빼기 = 그 사람 목장 리더 · 목사님 · 운영자
--   4) 리더가 자기 목장에 새 양을 넣을 수 있다 — 양 · 계정 없음 · 활동으로만(목장을 떠나면 status = 'left')
--   5) 명단 엑셀 내보내기 로그 — export_format 'roster', log_roster_export() (목사님 · 운영자). 로그가 먼저다
-- 실명은 이 파일에 없다 — 기존 값은 npm run roster:details 가 원본 엑셀에서 옮긴다.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 마을
-- ---------------------------------------------------------------------------

alter table public.groups
  add column village text
    constraint groups_village_ck check (village is null or (char_length(village) between 1 and 20 and village = btrim(village)));

comment on column public.groups.village is '마을(믿음 · 소망 · 사랑 · 은혜). 명단 엑셀의 A열. set_group_village 로 바꾼다.';

create function public.set_group_village(p_group_id uuid, p_village text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := nullif(btrim(coalesce(p_village, '')), '');
begin
  if not (public.is_leader_of(p_group_id) or public.is_pastor() or public.is_admin()) then
    raise exception '그 목장의 리더 · 목사님 · 운영자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if v is not null and char_length(v) > 20 then
    raise exception '마을 이름은 20자까지입니다.' using errcode = '22023';
  end if;
  update public.groups set village = v where id = p_group_id and status = 'active';
  if not found then
    raise exception '운영 중인 목장이 아닙니다.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.set_group_village(uuid, text) from public, anon;
grant execute on function public.set_group_village(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 사람의 나머지 칸
-- ---------------------------------------------------------------------------

alter table public.persons
  add column occupation text
    constraint persons_occupation_ck check (occupation is null or (char_length(occupation) between 1 and 30 and occupation = btrim(occupation))),
  add column affiliation text
    constraint persons_affiliation_ck check (affiliation is null or (char_length(affiliation) between 1 and 40 and affiliation = btrim(affiliation))),
  add column youth_member boolean not null default false,
  add column assembly_member boolean not null default false,
  add column note text
    constraint persons_note_ck check (note is null or (char_length(note) between 1 and 200 and note = btrim(note)));

alter table public.persons
  add constraint persons_training_stage_ck
    check (training_stage is null or (char_length(training_stage) between 1 and 20 and training_stage = btrim(training_stage)));

comment on column public.persons.occupation is '직업(대학생 · 직장인 · 취준생 …). 명단 엑셀의 H열.';
comment on column public.persons.affiliation is '소속(학교 · 회사). 명단 엑셀의 I열.';
comment on column public.persons.youth_member is '청년대학부 회원. 명단 엑셀의 J열(O). 기준은 교회가 정한다.';
comment on column public.persons.assembly_member is '공동의회 회원. 명단 엑셀의 K열(O).';
comment on column public.persons.note is '비고. 명단 엑셀의 L열. 그 목장 리더 · 목사님 · 운영자가 본다.';

-- 화면에서 고치는 칸 — 행은 RLS(persons_update: 자기 목장 리더 · 목사님 · 운영자)가 거른다
grant update (training_stage, birth_year, occupation, affiliation, youth_member, assembly_member, note)
  on public.persons to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 섬김 부서
-- ---------------------------------------------------------------------------

create table public.ministries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique
    constraint ministries_name_ck check (char_length(name) between 1 and 20 and name = btrim(name)),
  sort       integer not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.ministries is '섬김 부서 목록. sort 는 명단 엑셀 오른쪽 표의 순서(세 칸씩 한 줄).';

insert into public.ministries (name, sort) values
  ('찬양팀', 1), ('임원진', 2), ('수찬기', 3),
  ('국제사역부', 4), ('주일학교', 5), ('사회자', 6),
  ('교회 안내', 7), ('통역', 8), ('방송실', 9),
  ('예배 반주', 10), ('홈페이지', 11), ('동아리', 12),
  ('새가족 안내', 13);

create table public.person_ministries (
  person_id   uuid not null references public.persons (id) on delete cascade,
  ministry_id uuid not null references public.ministries (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (person_id, ministry_id)
);
create index person_ministries_ministry_idx on public.person_ministries (ministry_id);
comment on table public.person_ministries is '누가 어느 섬김 부서인가 — 한 사람이 여러 부서. 명단 엑셀의 섬김(M) · 부서(N) 열과 오른쪽 표가 여기서 나온다.';

alter table public.ministries enable row level security;
alter table public.person_ministries enable row level security;

create policy ministries_select on public.ministries for select to authenticated using (public.is_app_user());
grant select on public.ministries to authenticated;

-- 그 사람을 볼 수 있으면 부서도 본다 — 안쪽 persons 조회에 persons RLS 가 그대로 걸린다
create policy person_ministries_select on public.person_ministries for select to authenticated
  using (exists (select 1 from public.persons p where p.id = person_id));
create policy person_ministries_insert on public.person_ministries for insert to authenticated
  with check (exists (
    select 1 from public.persons p
     where p.id = person_id and (public.is_leader_of(p.group_id) or public.is_pastor() or public.is_admin())
  ));
create policy person_ministries_delete on public.person_ministries for delete to authenticated
  using (exists (
    select 1 from public.persons p
     where p.id = person_id and (public.is_leader_of(p.group_id) or public.is_pastor() or public.is_admin())
  ));
grant select, insert, delete on public.person_ministries to authenticated;
revoke all on public.ministries, public.person_ministries from anon;

-- ---------------------------------------------------------------------------
-- 4. 리더가 자기 목장에 새 양을 넣는다
-- ---------------------------------------------------------------------------

drop policy persons_insert on public.persons;
create policy persons_insert on public.persons for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_leader_of(group_id) and group_role = 'member' and user_id is null and status = 'active' and not is_group_head)
  );

-- ---------------------------------------------------------------------------
-- 5. 명단 엑셀 내보내기 로그
-- ---------------------------------------------------------------------------

alter type public.export_format add value if not exists 'roster';

create function public.log_roster_export()
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not (public.is_pastor() or public.is_admin()) then
    raise exception '전체 명단은 목사님 · 운영자만 내보냅니다.' using errcode = '42501';
  end if;
  insert into public.export_logs (user_id, format, range_start, range_end, group_ids)
  values (public.current_user_id(), 'roster', null, null, null)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_roster_export() from public, anon;
grant execute on function public.log_roster_export() to authenticated;
