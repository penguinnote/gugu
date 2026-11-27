# 외부 자산과 라이선스 (Third-Party Notices)

이 저장소의 코드에는 오픈소스 라이선스를 붙이지 않았다. 아래 외부 자산은 각자의 라이선스를 따른다.
npm 의존성은 `package-lock.json`에 적힌 각 패키지의 라이선스를 따른다.

## 저장소에 들어 있는 외부 자산

| 경로 | 내용 | 출처 | 라이선스 |
|---|---|---|---|
| `public/icons/tossface/*.svg` | 토스페이스 이모지 원본 SVG (v1.6.1, 고치지 않음) | 토스팀, https://toss.im/tossface | 토스페이스 저작권 안내 · 라이선스 (아래 전문) |
| `public/rodem-world/kaykit/` | KayKit Forest Nature Pack 모델 · 텍스처 (나무 · 바위) | Kay Lousberg, https://kaylousberg.com | CC0 1.0 |
| `public/rodem-world/furni/` (`fb_*`) | KayKit Furniture Bits 1.0 가구 모델 · 텍스처 | Kay Lousberg, https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 | CC0 1.0 |
| `public/rodem-world/furni/` (`tk_*`) | Tiny Treats Charming Kitchen 1.0 모델 | Isa Lousberg, https://opengameart.org/content/tiny-treats-charming-kitchen-set | CC0 1.0 |
| `public/rodem-world/tiny/` | Tiny Treats 모델 · 텍스처 (집 · 소품) | Isa Lousberg (Tiny Treats 시리즈). 어느 팩인지는 출처 확인 못 함 | CC0 1.0 (시리즈 표기 기준) |
| `public/rodem-world/motion/motion.json` | 사람 동작 방향 데이터 (원본 애니메이션에서 뽑음) | Quaternius Universal Animation Library, https://quaternius.com | CC0 1.0 |
| `public/rodem-world/village/T_UnevenBrick_BaseColor.jpg` | 길 · 분수 광장 바닥 텍스처 (원본 2048px PNG 를 512px JPG 로 줄임) | Quaternius Medieval Village MegaKit (Standard 무료판), https://quaternius.itch.io/medieval-village-megakit | CC0 1.0 |
| `public/rodem-world/sfx/lamb.m4a`, `public/rodem-world/sfx/lamb2.m4a` | baby lamb calling his mother2 — EduFigueres | Freesound, https://freesound.org/s/266688/ | CC0 1.0 |
| `public/rodem-world/sfx/duck.m4a` | single quack from a duck — Mikes-MultiMedia | Freesound, https://freesound.org/s/418509/ | CC0 1.0 |
| `public/rodem-world/sfx/duckling.m4a` | ducklings chirping — LantC | Freesound, https://freesound.org/s/678061/ | CC0 1.0 |
| `public/rodem-world/sfx/squirrel.m4a` | 44 Chillido Ardilla — checholio | Freesound, https://freesound.org/s/443826/ | CC0 1.0 |
| `public/rodem-world/sfx/squirrel2.m4a` | Ground Squirrel Second Chirp — burgersmoke | Freesound, https://freesound.org/s/640993/ | CC0 1.0 |
| `public/rodem-world/sfx/rabbit.m4a` | bunny sneeze — lucyve | Freesound, https://freesound.org/s/205576/ | CC0 1.0 |
| `public/rodem-world/sfx/pony.m4a` | horse neigh shortened — shadoWisp | Freesound, https://freesound.org/s/269571/ | CC0 1.0 |
| `public/rodem-world/sfx/snort.m4a` | Horse(snort)_3 — o_ciz | Freesound, https://freesound.org/s/475483/ | CC0 1.0 |

## 이 저장소에서 직접 만든 그림

| 경로 | 내용 |
|---|---|
| `public/gugu/*.svg`, `public/icon-*.png`, `public/apple-touch-icon.png`, `public/launch-icon.svg`, `public/splash/*.png` | 마스코트 구구 · 앱 아이콘 · 시작 화면 (`scripts/gugu-assets.mjs`로 만듦) |
| `public/icons/dday.svg` | 디데이 아이콘 |
| `public/home/*.webp`, `public/rodem-world/thumbs/*.webp` | 로뎀 월드 화면과 물건을 앱이 직접 그려 찍은 그림 (모델은 위 CC0 자산과 코드로 만든 소품) |
| `public/rodem-world/index.html`, `public/rodem-world/props.js`, `public/rodem-world/lab/` | 로뎀 월드 코드 · 코드로 만든 소품 |

## 저장소에 들어 있지 않고 실행할 때 불러오는 것

| 이름 | 쓰는 곳 | 출처 | 라이선스 |
|---|---|---|---|
| Pretendard 1.3.9 | 본문 글꼴 (`src/app/layout.tsx`, 로뎀 월드) | jsDelivr CDN, https://github.com/orioncactus/pretendard | SIL Open Font License 1.1 |
| Jua | 제목 글꼴 (`next/font/google`, 로뎀 월드) | Google Fonts | SIL Open Font License 1.1 |
| Gowun Dodum | 로뎀 월드 글꼴 | Google Fonts | SIL Open Font License 1.1 |
| three.js r158 | 로뎀 월드 3D | jsDelivr CDN, https://github.com/mrdoob/three.js | MIT |
| Kiwi 형태소 분석기 모델 | 띄어쓰기 교정 (`scripts/fetch-kiwi-model.mjs`가 빌드 때 받음) | https://github.com/bab2min/Kiwi | Kiwi 저장소의 라이선스 표기를 따른다 (`kiwi-nlp` 패키지는 Apache-2.0) |

### Pretendard 저작권 표기

Copyright (c) 2021, Kil Hyung-jin (https://github.com/orioncactus/pretendard), with Reserved Font Name Pretendard.
This Font Software is licensed under the SIL Open Font License, Version 1.1. https://openfontlicense.org

## 토스페이스 출처 표시

이 저장소의 앱 화면에는 토스팀에서 제공한 토스페이스가 적용되어 있습니다.

토스페이스 원본 파일은 고치지 않고 그대로 두었다. 아래는 토스페이스 저작권 안내와 라이선스 전문이다. 최신 내용은 https://toss.im/tossface/copyright 에 있다.

토스페이스 저작권 안내
토스페이스는 누구나 자유롭게 무료로 이용할 수 있습니다.
토스팀은 모든 사용자에게 토스페이스를 무료로 제공합니다. 단, 아래와 같은 행위는 금지됩니다.
토스페이스를 변형ㆍ각색하여 작성한 창작물(이하 “2차적저작물”)을 만드는 행위
토스페이스 그 자체를 유료로 판매하는 행위
토스페이스 및 이를 활용한 2차적 저작물에 대하여 상표권, 디자인권 등 지식재산권등록을 진행하는 행위
토스페이스 및 이를 활용한 2차적 저작물을 전시회 ∙ 공모전에 출품하는 행위
토스페이스를 소스코드로 변환하여 이를 복제, 전송, 공중에 게재하는 행위
사회 미풍양속을 저해하는 방식으로 토스페이스를 이용하는 행위
기타 위와 유사한 행위로서 토스팀의 저작권 및 저작인격권을 침해하는 행위
토스페이스의 권리는 토스팀에게 있습니다.
토스페이스는 토스팀이 직접 창작한 저작물로서 저작권법 등 관계 법령에 따라 보호받고 있는 고유의 지식재산입니다. 따라서 이용하실 때에는 토스페이스가 토스팀의 저작물이라는 출처 표시를 해주세요(저작권법 제12조). 예) 이 페이지에는 토스팀에서 제공한 토스페이스가 적용되어 있습니다.
토스페이스를 이용하여 만들어진 인쇄물, 광고물(온라인 포함) 등의 이미지(이하 ‘이용물들’)는 원칙적으로 당사의 자료 수집, 연구 및 광고 등 프로모션 목적으로 활용될 수 있습니다. 만약 이를 원치 않으실 경우 이용물들 제작 사전에 당사에 요청 해 주시기 바랍니다.
본 가이드라인은 토스페이스 사용에 관한 토스팀 정책을 반영하고 있으며 토스페이스 사용에 대한 해석에 가장 우선합니다. 토스페이스의 저작권 관련 원칙 등 기타 궁금하신 사항은 토스페이스 라이선스 전문 도 참고하시기 바랍니다.
본 가이드라인은 토스팀 정책 변경에 따라 변경될 수 있으며, 가장 최신의 가이드라인에 따라 이용허락이 제한될 수 있습니다.


토스페이스 라이선스 전문
https://toss.im/tossface/copyright

정의
‘토스페이스’는 본 라이선스에 입거해 저작권자가 배포하고 명확하게 같은 표시가 된 파일들의 집합을 뜻하며, 여기에는 소스 파일, 빌드 스크립트와 문서가 이에 포함됩니다. 
‘원본’은 저작권자가 배포한 토스페이스 구성요소를 의미합니다. 
‘수정본’은 포맷의 변경이나 토스페이스를 새로운 운영체제에 맞추어 변경하거나, 원본의 일부 혹은 전체에 추가, 삭제 대체해 만든 2차적 저작물을 의미합니다.
‘저자’는 토스페이스에 기여한 디자이너, 엔지니어, 프로그래머, 기술 전문가 등을 의미합니다.

전문
토스페이스를 공개하는 목적은 연구를 지원하며, 협력을 통해 폰트가 공유되고 개선될 수 있는 자유롭고 개방된 환경을 만드는 것입니다. 
토스팀이 토스페이스를 자유롭게 이용하도록 허락하는 행위(이하 ‘이용허락’)는 토스팀이 저작권을 양도하거나 포기하는 행위로 해석되지 않습니다. 

허가 및 조건
1) 토스페이스는 그 자체를 판매하거나, 부정한 목적으로 이용하거나, 허용되지 않은 수정본을 만들지 않는 한 자유롭게 사용, 연구, 재배포 하실 수 있습니다.  
2) 토스페이스의 원본은 ’토스페이스 저작권 안내’와 본 라이선스 전문에 대한 내용을 포함하는 경우에는 다른 소프트웨어와 번들되거나 재배포가 가능합니다. 
이는 별도 텍스트 파일과 가독성이 있는 헤더, 또는 (사용자가 쉽게 읽을 수 있다면) 기계가 읽을 수 있는 텍스트나 바이너리 파일의 메타데이터 필드 형태로도 가능합니다. 
3) 토스페이스의 저작권자 혹은 저자의 이름은 그들의 명시적 서면 허가가 있거나 또는 그들의 공헌을 인정하기 위한 경우를 제외하고는 
수정본에 대한 사용을 유도, 추천 혹은 광고하기 위한 목적으로 사용할 수 없습니다.  

계약의 종료
토스페이스 저작권 안내와 본 라이선스를 일부라도 위반할 경우 토스페이스에 대한 사용허락이 무효가 될 수 있습니다. 

면책조항
토스페이스는 저작권, 특허권, 상표권 및 기타 권리를 침해하지 않는다거나, 특정 목적에 적합하다는 등의 명시적, 묵시적인 어떠한 종류의 보증 없이 “있는 그대로” 제공됩니다. 
어떠한 경우에도 저작권자는 토스페이스의 사용 또는 사용불가능 상태, 그 밖에 토스페이스의 취급과 관련하여 발생하는 모든 계약, 불법행위 
혹은 다른 일로 하여금 발생하는 일반적, 특수적, 간접적, 부차적 혹은 필연적 손해를 포함하는 소송, 손해 혹은 기타 책임에 대한 의무를 부담하지 않습니다.
