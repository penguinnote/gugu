-- ===========================================================================
-- 내 프로필 글(2026-11-11 사용자 요청 — 인스타처럼) — 소개(bio) · 좋아하는 말씀 · 관심사. 사진은 profile_photos(20261111010000).
--
--   user_profiles(user_id pk, bio ≤150자, verse ≤100자, interests 최대 5개 · 각 12자)
--   쓰기     set_my_profile(bio, verse, interests) — 승인된 앱 사용자 본인 칸만. 빈 글은 null, 관심사는 앞뒤 공백을 걷고 빈 것 · 겹치는 것을 뺀다
--   읽기     본인 행(내 정보) — RLS. 다른 사람은 명단 사람(person) 단위로 person_profile(id) — 승인된 앱 사용자 누구나
--            (목장 프로필의 '함께하는 사람' 을 누르면 그 사람 프로필). 계정이 없는 청년은 글이 없다(has_account = false)
-- ===========================================================================

create table public.user_profiles (
  user_id    uuid primary key references public.users (id) on delete cascade,
  bio        text check (bio is null or char_length(bio) between 1 and 150),
  verse      text check (verse is null or char_length(verse) between 1 and 100),
  interests  text[] not null default '{}' check (cardinality(interests) <= 5),
  updated_at timestamptz not null default now()
);
comment on table public.user_profiles is '내 프로필 글(2026-11-11) — 소개 · 좋아하는 말씀 · 관심사. set_my_profile 로만 쓴다.';

alter table public.user_profiles enable row level security;
create policy user_profiles_read_own on public.user_profiles for select to authenticated
  using (user_id = public.current_user_id() and public.is_app_user());
grant select on public.user_profiles to authenticated;

create function public.set_my_profile(p_bio text, p_verse text, p_interests text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me    uuid := public.current_user_id();
  v_bio   text := nullif(btrim(coalesce(p_bio, '')), '');
  v_verse text := nullif(btrim(coalesce(p_verse, '')), '');
  v_tags  text[];
begin
  if v_me is null or not public.is_app_user() then raise exception '승인된 사용자만 프로필을 고칠 수 있습니다.' using errcode = '42501'; end if;
  if v_bio is not null and char_length(v_bio) > 150 then raise exception '소개는 150자까지입니다.' using errcode = '22023'; end if;
  if v_verse is not null and char_length(v_verse) > 100 then raise exception '말씀은 100자까지입니다.' using errcode = '22023'; end if;
  select coalesce(array_agg(t order by o), '{}') into v_tags
  from (
    select distinct on (btrim(x)) btrim(x) as t, o
    from unnest(coalesce(p_interests, '{}')) with ordinality as u(x, o)
    where btrim(x) <> ''
    order by btrim(x), o
  ) d;
  if cardinality(v_tags) > 5 then raise exception '관심사는 5개까지입니다.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_tags) t where char_length(t) > 12) then raise exception '관심사는 하나에 12자까지입니다.' using errcode = '22023'; end if;
  insert into public.user_profiles as p (user_id, bio, verse, interests, updated_at)
  values (v_me, v_bio, v_verse, v_tags, now())
  on conflict (user_id) do update set bio = excluded.bio, verse = excluded.verse, interests = excluded.interests, updated_at = excluded.updated_at;
end;
$$;

-- 명단 사람의 프로필 글 · 사진 저장 시각 — 계정이 이어진 사람만 값이 있다
create function public.person_profile(p_person_id uuid)
returns table (has_account boolean, bio text, verse text, interests text[], photo_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id is not null, up.bio, up.verse, coalesce(up.interests, '{}'), ph.updated_at
  from public.persons p
  left join public.user_profiles up on up.user_id = p.user_id
  left join public.profile_photos ph on ph.user_id = p.user_id
  where public.is_app_user() and p.id = p_person_id and p.status <> 'left'
$$;

revoke execute on function public.set_my_profile(text, text, text[]) from public, anon;
revoke execute on function public.person_profile(uuid) from public, anon;
grant  execute on function public.set_my_profile(text, text, text[]) to authenticated;
grant  execute on function public.person_profile(uuid) to authenticated;
