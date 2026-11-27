-- 코드로 만든 소품 12종 더(2026-11-15 둘째 묶음) — 마당 여덟(풍차 · 해먹 · 트램펄린 · 새집 · 꽃수레 · 과일 가게 · 버섯 · 열기구) · 집 안 가구 넷(텔레비전 · 책상 · 어항 · 괘종시계).
--   값은 비슷한 크기의 기존 물건에 맞췄다. 풍차 · 열기구는 큰 구경거리라 탈것 급(70 · 85). 놓는 규칙은 그대로.
insert into public.world_items (id, name, cat, slot, price, sort, blurb) values
  ('windmill',   '풍차',        'prop',      null,    70, 154, '빨간 고깔을 쓴 흰 풍차'),
  ('hammock',    '해먹',        'prop',      null,    35, 155, '기둥 둘 사이에 건 줄무늬 해먹'),
  ('trampoline', '트램펄린',    'prop',      null,    40, 156, '하늘빛 테를 두른 트램펄린'),
  ('birdhouse',  '새집',        'nature',    null,    15, 157, '장대 위 작은 새집'),
  ('flowercart', '꽃수레',      'nature',    null,    30, 158, '꽃을 가득 실은 손수레'),
  ('fruitstall', '과일 가게',   'prop',      null,    45, 159, '줄무늬 차양 아래 과일 상자'),
  ('mushrooms',  '버섯',        'nature',    null,    18, 160, '빨간 갓을 쓴 버섯 셋'),
  ('airballoon', '열기구',      'prop',      null,    85, 161, '땅에 내려앉은 살구색 열기구'),
  ('tvset',      '텔레비전',    'furniture', 'floor', 50, 162, '받침대 위 큰 텔레비전'),
  ('desk',       '책상',        'furniture', 'floor', 35, 163, '스탠드와 책이 놓인 책상'),
  ('fishtank',   '어항',        'furniture', 'floor', 30, 164, '금붕어 둘이 사는 어항'),
  ('tallclock',  '괘종시계',    'furniture', 'floor', 40, 165, '추가 달린 키 큰 시계');
