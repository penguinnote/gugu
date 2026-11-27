-- 열매를 더 넉넉하게(2026-11-16 사용자 결정) — 상점이 124종 · 4,174개어치로 커져 예전 값(주 20)으로는 다 사는 데 2년 반이 걸렸다.
--   시작 열매 60 → 300 · 정시 제출 20 → 80 · 연속 지키기 쿠폰 80 → 300.
--   지각(5) · 연속 보너스(한 칸 4, 최대 12)는 그대로.
--   이미 있는 목장의 시작 열매도 300 으로 맞춘다(목장만 — 목회자 · 운영자 집은 그대로). 원장의 시작 줄은 목장마다 하나다.
update public.world_rules set value = 300 where key = 'start_berries';
update public.world_rules set value = 80  where key = 'report_on_time';
update public.world_items set price = 300 where id = 'freeze';

update public.world_ledger l set delta = 300
from public.groups g
where g.id = l.group_id and g.status = 'active' and l.reason = 'start' and l.delta <> 300;
