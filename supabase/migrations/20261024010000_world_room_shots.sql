-- ===========================================================================
-- 목장 탭 배경 — 우리 목장 집 안 사진(2026-10-24)
--   월드가 우리 목장 집 안을 한 장 찍어(1290×1092 WebP) 앱에 넘기면 껍데기가 서버 액션으로 저장한다.
--   목장마다 한 장 — 리더가 집 안 배치를 저장할 때마다, 또 아직 사진이 없는 목장 리더가 월드에 들어왔을 때 새로 찍는다.
--   쓰기     world_set_room_shot(p_image) — 목장 리더만(_world_my_group), WebP 만, 1KB~600KB
--   읽기     승인된 앱 사용자(is_app_user) — 목장 탭이 /api/room-shot/<목장 id> 로 받아 그린다
-- ===========================================================================

create table public.world_room_shots (
  group_id   uuid primary key references public.groups (id) on delete cascade,
  image      bytea not null check (octet_length(image) between 1000 and 600000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);
comment on table public.world_room_shots is '목장 탭 배경 — 월드가 찍은 우리 목장 집 안 사진(WebP). world_set_room_shot 으로만 쓴다.';

alter table public.world_room_shots enable row level security;
create policy world_room_shots_read on public.world_room_shots for select to authenticated using (public.is_app_user());
grant select on public.world_room_shots to authenticated;

create function public.world_set_room_shot(p_image text)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group uuid := public._world_my_group();
  v_img   bytea;
  v_at    timestamptz := now();
begin
  if v_group is null then raise exception '목장 리더만 저장할 수 있습니다.' using errcode = '42501'; end if;
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
  insert into public.world_room_shots as s (group_id, image, updated_at, updated_by)
  values (v_group, v_img, v_at, public.current_user_id())
  on conflict (group_id) do update set image = excluded.image, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end;
$$;

revoke execute on function public.world_set_room_shot(text) from public, anon;
grant  execute on function public.world_set_room_shot(text) to authenticated;
