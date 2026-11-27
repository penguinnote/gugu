-- ===========================================================================
-- 프로필 사진(2026-11-11 사용자 요청) — 각자 '내 정보' 에서 자기 사진을 정하고, 목장 프로필 '함께하는 사람' 의 동그라미에 들어간다.
--
--   사진은 계정마다 한 장(앱 계정이 있는 사람 — 리더 · 목사님 · 운영자 · 임원진). 계정이 없는 청년(양)은 사진이 없다 — 화면은 이름 첫 글자.
--   브라우저가 정사각으로 줄여(256px) WebP 로, 안 되면(아이폰 사파리) JPEG 로 보낸다. 200B 아래 · 300KB 위는 받지 않는다.
--
--   쓰기     set_profile_photo(p_image base64) — 승인된 앱 사용자 본인 칸에만. clear_profile_photo() — 본인 것 지우기
--   읽기     본인 행(내 정보) — RLS. 다른 사람 것은 명단 사람(person) 단위로만: person_photos(ids) 는 있는 사람과 저장 시각,
--            person_photo(id) 는 그 사람 사진. 승인된 앱 사용자 누구나(목장 프로필은 앱 사용자 모두가 본다 — 02 §4 격리의 예외)
-- ===========================================================================

create table public.profile_photos (
  user_id    uuid primary key references public.users (id) on delete cascade,
  image      bytea not null check (octet_length(image) between 200 and 300000),
  updated_at timestamptz not null default now()
);
comment on table public.profile_photos is '프로필 사진(2026-11-11) — 계정마다 한 장(WebP · JPEG). set_profile_photo · clear_profile_photo 로만 쓴다.';

alter table public.profile_photos enable row level security;
create policy profile_photos_read_own on public.profile_photos for select to authenticated
  using (user_id = public.current_user_id() and public.is_app_user());
grant select on public.profile_photos to authenticated;

create function public.set_profile_photo(p_image text)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := public.current_user_id();
  v_img bytea;
  v_at  timestamptz := now();
begin
  if v_me is null or not public.is_app_user() then raise exception '승인된 사용자만 사진을 정할 수 있습니다.' using errcode = '42501'; end if;
  begin
    v_img := decode(p_image, 'base64');
  exception when others then
    raise exception '사진 값이 올바르지 않습니다.' using errcode = '22023';
  end;
  if v_img is null or octet_length(v_img) < 200 or octet_length(v_img) > 300000 then
    raise exception '사진 크기가 맞지 않습니다.' using errcode = '22023';
  end if;
  -- WebP('RIFF' ···· 'WEBP') 또는 JPEG(FF D8 FF)
  if not ((substring(v_img from 1 for 4) = '\x52494646'::bytea and substring(v_img from 9 for 4) = '\x57454250'::bytea)
          or substring(v_img from 1 for 3) = '\xffd8ff'::bytea) then
    raise exception 'WebP · JPEG 사진만 저장할 수 있습니다.' using errcode = '22023';
  end if;
  insert into public.profile_photos as s (user_id, image, updated_at)
  values (v_me, v_img, v_at)
  on conflict (user_id) do update set image = excluded.image, updated_at = excluded.updated_at;
  return v_at;
end;
$$;

create function public.clear_profile_photo()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if public.current_user_id() is null or not public.is_app_user() then raise exception '승인된 사용자만 지울 수 있습니다.' using errcode = '42501'; end if;
  delete from public.profile_photos where user_id = public.current_user_id();
end;
$$;

-- 명단 사람 중 사진이 있는 사람과 저장 시각 — 목장 프로필 '함께하는 사람'
create function public.person_photos(p_person_ids uuid[])
returns table (person_id uuid, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, ph.updated_at
  from public.persons p
  join public.profile_photos ph on ph.user_id = p.user_id
  where public.is_app_user() and p.id = any(p_person_ids) and p.status = 'active'
$$;

-- 그 사람 사진 한 장
create function public.person_photo(p_person_id uuid)
returns bytea
language sql stable security definer set search_path = '' as $$
  select ph.image
  from public.persons p
  join public.profile_photos ph on ph.user_id = p.user_id
  where public.is_app_user() and p.id = p_person_id and p.status = 'active'
$$;

revoke execute on function public.set_profile_photo(text) from public, anon;
revoke execute on function public.clear_profile_photo() from public, anon;
revoke execute on function public.person_photos(uuid[]) from public, anon;
revoke execute on function public.person_photo(uuid) from public, anon;
grant  execute on function public.set_profile_photo(text) to authenticated;
grant  execute on function public.clear_profile_photo() to authenticated;
grant  execute on function public.person_photos(uuid[]) to authenticated;
grant  execute on function public.person_photo(uuid) to authenticated;
