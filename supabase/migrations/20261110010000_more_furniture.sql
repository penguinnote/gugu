-- ===========================================================================
-- 로뎀 월드 집 안 가구 더하기 (2026-11-10)
--
--   사용자 요청 — 꾸미기 재료가 적다. KayKit Furniture Bits(CC0)의 다른 색 · 모양 22가지(바닥 18 · 벽 4)를 더한다.
--   값은 처음 제안한 값에서 모두 10씩 내렸다(사용자 결정, 가장 싼 것은 5). 놓는 규칙 · 사기는 그대로(world_buy · world_set_room).
--   월드는 DB 에 있는 가구만 상점 · 꾸미기에 내놓으므로 이 migration 이 들어가야 새 가구가 보인다.
-- ===========================================================================

insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('sofablue',    '파란 소파',        'furniture', 'floor', 50,  90, '하늘빛 천을 씌운 세 자리 소파'),
  ('armblue',     '파란 안락의자',    'furniture', 'floor', 25,  91, '하늘빛 푹신한 안락의자'),
  ('bedwood',     '나무 큰 침대',     'furniture', 'floor', 60,  92, '나무 머리판에 파란 이불'),
  ('bedsmall',    '나무 작은 침대',   'furniture', 'floor', 35,  93, '나무 틀의 한 사람 침대'),
  ('chaircush',   '방석 의자',        'furniture', 'floor',  6,  94, '파란 방석을 깐 나무 의자'),
  ('chairblue',   '파란 의자',        'furniture', 'floor',  6,  95, '하늘빛으로 칠한 의자'),
  ('chaircurve',  '둥근 의자',        'furniture', 'floor',  8,  96, '등이 둥근 파란 의자'),
  ('stool',       '나무 스툴',        'furniture', 'floor',  5,  97, '등받이 없는 나무 걸상'),
  ('drawer',      '서랍장',           'furniture', 'floor', 20,  98, '서랍 넷 달린 낮은 장'),
  ('nightstand',  '협탁',             'furniture', 'floor', 12,  99, '침대 곁 작은 서랍'),
  ('longtable',   '긴 식탁',          'furniture', 'floor', 28, 100, '여럿이 둘러앉는 긴 식탁'),
  ('sidetable',   '작은 탁자',        'furniture', 'floor',  5, 101, '네모난 작은 탁자'),
  ('tablelamp',   '작은 스탠드',      'furniture', 'floor',  5, 102, '갓이 큰 작은 등'),
  ('cactusbig',   '큰 선인장 화분',   'furniture', 'floor',  5, 103, '세 갈래로 자란 큰 선인장'),
  ('cactussmall', '작은 선인장',      'furniture', 'floor',  5, 104, '손바닥만 한 선인장'),
  ('rugblue',     '파란 둥근 깔개',   'furniture', 'floor',  6, 105, '하늘빛 둥근 깔개'),
  ('rugyellow',   '노란 깔개',        'furniture', 'floor',  6, 106, '햇살빛 네모 깔개'),
  ('rugsblue',    '파란 줄무늬 깔개', 'furniture', 'floor',  6, 107, '하늘빛 줄무늬 깔개'),
  ('bookshelf',   '책 선반',          'furniture', 'wall',  25, 108, '책과 액자를 올린 벽 선반'),
  ('plantshelf',  '화분 선반',        'furniture', 'wall',  15, 109, '작은 화분을 올린 벽 선반'),
  ('framewide',   '가로 액자',        'furniture', 'wall',   5, 110, '옆으로 긴 작은 액자'),
  ('frametall',   '세로 큰 액자',     'furniture', 'wall',  12, 111, '세로로 긴 큰 액자');
