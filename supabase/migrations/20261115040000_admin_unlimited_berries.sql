-- 운영자 집은 열매가 떨어지지 않게(2026-11-15) — 새 물건을 미리 사서 놓아 보는 자리라 값을 따지지 않는다.
--   규칙 · 함수는 그대로 두고, 운영자 집(특별 자리 102) 원장에 아주 큰 열매를 한 번 넣는다(이유 'grant').
--   화면은 열매가 100만 이상이면 숫자 대신 ∞ 로 그린다(src/lib/berries.ts berryText · 월드 syncBerries).
--   목장 · 목회자 집은 그대로다.
alter table public.world_ledger drop constraint if exists world_ledger_reason_check;
alter table public.world_ledger add constraint world_ledger_reason_check
  check (reason in ('start', 'report_on_time', 'report_late', 'streak_bonus', 'purchase', 'pastor_read', 'pastor_stamp', 'admin_approve', 'grant'));

insert into public.world_ledger (group_id, delta, reason)
select g.id, 9999999, 'grant'
from public.groups g
where g.status = 'special' and g.number = 102
  and not exists (select 1 from public.world_ledger l where l.group_id = g.id and l.reason = 'grant');
