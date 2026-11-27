-- 코드로 만든 소품 12종 더(2026-11-15) — 마당 여덟(텐트 · 모닥불 · 허수아비 · 강아지 집 · 연못 · 눈사람 · 꽃 아치 · 파라솔 탁자) · 집 안 가구 넷(피아노 · 옷장 · 벽난로 · 큰 화분).
--   값은 비슷한 크기의 기존 물건에 맞췄다(소풍 돗자리 22 · 분수 40 · 장식장 45 · 큰 침대 70). 놓는 규칙은 그대로.
insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('tent',       '줄무늬 텐트',   'prop',      null,    50, 142, '살구 줄무늬를 두른 세모 텐트'),
  ('bonfire',    '모닥불',        'prop',      null,    22, 143, '돌을 두르고 피운 모닥불'),
  ('scarecrow',  '허수아비',      'prop',      null,    20, 144, '밀짚모자를 쓴 허수아비'),
  ('doghouse',   '강아지 집',     'prop',      null,    30, 145, '빨간 지붕에 밥그릇 하나'),
  ('pond',       '연못',          'nature',    null,    45, 146, '연잎이 뜬 작은 연못'),
  ('snowman',    '눈사람',        'prop',      null,    20, 147, '빨간 목도리를 두른 눈사람'),
  ('flowerarch', '꽃 아치',       'nature',    null,    35, 148, '덩굴과 꽃을 감은 아치'),
  ('parasol',    '파라솔 탁자',   'prop',      null,    30, 149, '파라솔 아래 탁자와 의자 둘'),
  ('piano',      '피아노',        'furniture', 'floor', 65, 150, '긴 의자가 딸린 피아노'),
  ('wardrobe',   '옷장',          'furniture', 'floor', 45, 151, '문 두 짝 달린 나무 옷장'),
  ('fireplace',  '벽난로',        'furniture', 'floor', 55, 152, '불이 타는 벽돌 벽난로'),
  ('bigplant',   '큰 화분',       'furniture', 'floor', 12, 153, '잎이 넓은 큰 화분');
