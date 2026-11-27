-- 판정 태그에 '교환 학생'(2026-11-17 사용자 요청). 돌봄 판정(사각지대)은 재적 · 장기 미출석만 보므로 여기서 빠지고,
-- 출석부에서는 결석을 세지 않는 사람('교환' 회색 칸, lib/attendance-book)이다.
alter type public.care_status add value if not exists 'exchange' after 'remote';
