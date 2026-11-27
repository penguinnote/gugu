-- 운영 홈(Step 9a)이 명단 갱신일·데모 표시·보관 개월을 보여준다. app_meta 는 지금까지 authenticated 에게
-- 완전히 닫혀 있었다(스크립트만 읽었다). 운영자에게 읽기만 연다 — 쓰기는 여전히 스크립트·마이그레이션뿐.
grant select on public.app_meta to authenticated;

create policy app_meta_select on public.app_meta
  for select to authenticated
  using (public.is_admin());

comment on table public.app_meta is
  '앱 설정·상태 한 줄씩 (roster_source · roster_imported_at · demo_records · retention_months …). 읽기 운영자, 쓰기 스크립트·마이그레이션.';
