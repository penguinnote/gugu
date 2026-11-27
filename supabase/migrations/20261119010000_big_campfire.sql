-- 캠프파이어(2026-11-19 사용자) — 모닥불이 작다는 말에 아주 큰 불을 아주 비싸게. 코드로 만든 소품(props.js campfire), 마당에 놓는다.
--   값 500 — 지금까지 가장 비싼 꼬마 버스(120)의 네 배쯤, 제때 낸 보고서 여섯 주 치.
insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('bigbonfire', '캠프파이어', 'prop', null, 500, 154, '통나무를 높이 쌓아 피운 큰 불');
