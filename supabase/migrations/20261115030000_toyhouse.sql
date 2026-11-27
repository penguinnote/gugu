-- 코드로 만든 집 한 채를 상점에(2026-11-15) — '살구 지붕 집'. 다른 집처럼 마을 자리에 놓고, 문으로 들어가 집 안을 꾸민다.
--   값은 같은 크기의 빨간 지붕 집(60)에 맞췄다. 놓는 규칙은 그대로(world_set_village · world_set_room 은 cat = 'house' 만 본다).
insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('toyhouse', '살구 지붕 집', 'house', null, 60, 5, '크림색 벽에 살구 지붕을 얹은 집');
