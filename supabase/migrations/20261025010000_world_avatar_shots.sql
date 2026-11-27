-- ===========================================================================
-- 정보 탭 배경 — 내가 꾸민 아바타가 풀밭에 서 있는 사진(2026-10-25)
--   월드가 지금 생김새대로 아바타를 풀밭에 세워 한 장(1290×1092 WebP) 찍어 넘기면 껍데기가 서버 액션으로 저장한다.
--   사람마다 한 장 — 생김새를 저장할 때마다, 또 아직 사진이 없는 사람이 월드에 들어왔을 때 새로 찍는다.
--   쓰기     world_set_avatar_shot(p_image) — 승인된 앱 사용자 본인 칸에만. WebP 만, 1KB~600KB
--   읽기     본인 것만(정보 탭은 내 것만 그린다)
-- ===========================================================================

create table public.world_avatar_shots (
  user_id    uuid primary key references public.users (id) on delete cascade,
  image      bytea not null check (octet_length(image) between 1000 and 600000),
  updated_at timestamptz not null default now()
);
comment on table public.world_avatar_shots is '정보 탭 배경 — 월드가 찍은 내 아바타 사진(WebP). world_set_avatar_shot 으로만 쓴다.';

alter table public.world_avatar_shots enable row level security;
create policy world_avatar_shots_read_own on public.world_avatar_shots for select to authenticated
  using (user_id = public.current_user_id() and public.is_app_user());
grant select on public.world_avatar_shots to authenticated;

create function public.world_set_avatar_shot(p_image text)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := public.current_user_id();
  v_img bytea;
  v_at  timestamptz := now();
begin
  if v_me is null or not public.is_app_user() then raise exception '승인된 사용자만 저장할 수 있습니다.' using errcode = '42501'; end if;
  begin
    v_img := decode(p_image, 'base64');
  exception when others then
    raise exception '사진 값이 올바르지 않습니다.' using errcode = '22023';
  end;
  if v_img is null or octet_length(v_img) < 1000 or octet_length(v_img) > 600000 then
    raise exception '사진 크기가 맞지 않습니다.' using errcode = '22023';
  end if;
  -- WebP — 'RIFF' ···· 'WEBP'
  if substring(v_img from 1 for 4) <> '\x52494646'::bytea or substring(v_img from 9 for 4) <> '\x57454250'::bytea then
    raise exception 'WebP 사진만 저장할 수 있습니다.' using errcode = '22023';
  end if;
  insert into public.world_avatar_shots as s (user_id, image, updated_at)
  values (v_me, v_img, v_at)
  on conflict (user_id) do update set image = excluded.image, updated_at = excluded.updated_at;
  return v_at;
end;
$$;

revoke execute on function public.world_set_avatar_shot(text) from public, anon;
grant  execute on function public.world_set_avatar_shot(text) to authenticated;
