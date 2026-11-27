-- 코드로 만든 소품 22종을 상점에(2026-11-15) — 외부 모델 없이 three.js 도형만으로 그린 물건(public/rodem-world/props.js).
--   마당(나무·꽃 4 · 소품 6 · 탈것 6)은 마을 자리에, 가구 6은 집 안 바닥 자리에 놓는다. 놓는 규칙은 그대로(world_set_village · world_set_room).
--   값은 같은 종류의 기존 물건에 맞추고(둥근 나무 25 · 분수 40 · 그네 55 · 소파 60 …) 탈것만 새로 정했다(45~120, 가장 비싼 집 120 이 천장).
--   기존 물건은 그대로 둔다 — 이름이 겹치지 않게 새 이름을 붙였다.
insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('roundtree',  '열매 나무',       'nature',    null,    25, 120, '빨간 열매가 달린 몽글몽글한 나무'),
  ('pointtree',  '뾰족 나무',       'nature',    null,    15, 121, '세 단으로 쌓인 뾰족한 나무'),
  ('flowerbush', '꽃 덤불',         'nature',    null,    18, 122, '분홍 꽃이 핀 낮은 덤불'),
  ('tulipbed',   '튤립 꽃밭',       'nature',    null,    12, 123, '나무 테두리 안에 핀 튤립'),
  ('stonewell',  '돌 우물',         'prop',      null,    40, 124, '두레박이 달린 돌 우물'),
  ('slatbench',  '하늘빛 벤치',     'prop',      null,    15, 125, '하늘빛 다리의 나무 벤치'),
  ('streetlamp', '노란 가로등',     'prop',      null,    10, 126, '노란 불빛의 키 큰 가로등'),
  ('redmailbox', '빨간 우체통',     'prop',      null,    12, 127, '노란 깃발을 올린 우체통'),
  ('ropeswing',  '나무 그네',       'prop',      null,    55, 128, '줄에 매단 빨간 그네'),
  ('signpost',   '이정표',          'prop',      null,    12, 129, '화살표 둘이 달린 길잡이'),
  ('bicycle',    '자전거',          'prop',      null,    45, 130, '바구니 달린 연두색 자전거'),
  ('sailboat',   '돛단배',          'prop',      null,    60, 131, '흰 돛 두 장을 단 작은 배'),
  ('wagon',      '포장 수레',       'prop',      null,    70, 132, '흰 천 지붕을 씌운 나무 수레'),
  ('toycar',     '꼬마 자동차',     'prop',      null,    90, 133, '동글동글한 살구색 자동차'),
  ('truck',      '꼬마 트럭',       'prop',      null,   100, 134, '호박을 실은 하늘색 트럭'),
  ('bus',        '꼬마 버스',       'prop',      null,   120, 135, '창이 많은 노란 버스'),
  ('woodchair',  '방석 나무 의자',  'furniture', 'floor', 12, 136, '하늘빛 방석을 깐 의자'),
  ('roundtable', '둥근 찻상',       'furniture', 'floor', 22, 137, '찻잔이 놓인 외다리 탁자'),
  ('softsofa',   '살구색 소파',     'furniture', 'floor', 60, 138, '둘이 앉는 폭신한 소파'),
  ('cozybed',    '하늘 이불 침대',  'furniture', 'floor', 70, 139, '둥근 머리판의 포근한 침대'),
  ('bookcase',   '책장',            'furniture', 'floor', 40, 140, '알록달록 책이 꽂힌 책장'),
  ('floorlamp',  '갓 스탠드',       'furniture', 'floor', 18, 141, '갓을 쓴 키 큰 스탠드');
