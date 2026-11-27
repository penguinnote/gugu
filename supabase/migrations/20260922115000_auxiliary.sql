-- 부가 — comments, events, export_logs
--
-- 문서 04-schema.md §3.10·3.11, 03-metrics.md §6.2 기준.

create type public.event_type as enum (
  'report_opened',
  'report_submitted',
  'comment_created'
);

create type public.export_format as enum ('xlsx', 'print');

-- ---------------------------------------------------------------------------
-- comments — 목사님 코멘트
-- ---------------------------------------------------------------------------

create table public.comments (
  id          uuid primary key default gen_random_uuid(),

  -- 보고서 단위에만 달린다. 양 단위 코멘트는 두지 않는다 —
  -- 목사님이 12건을 빠르게 훑는 것이 목적이고, 양 단위로 내려가면
  -- 부담이 급증해 반응 루프가 끊긴다(04-schema §3.10).
  report_id   uuid not null references public.reports (id) on delete cascade,
  author_id   uuid not null references public.users (id) on delete restrict,

  body        text not null check (length(btrim(body)) > 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.comments is
  '목사님 코멘트. 보고서 단위. 반응률 지표의 분자다.';

create index comments_report_idx on public.comments (report_id);
create index comments_created_at_idx on public.comments (created_at);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events — 행동 로그
-- ---------------------------------------------------------------------------

create table public.events (
  id           bigint generated always as identity primary key,

  -- 사용자가 지워져도 로그는 남긴다.
  user_id      uuid references public.users (id) on delete set null,

  type         public.event_type not null,

  group_id     uuid references public.groups (id) on delete set null,
  report_id    uuid references public.reports (id) on delete set null,
  week_key     date,

  -- report_submitted 에만 채워진다.
  is_late      boolean,

  occurred_at  timestamptz not null default now()
);

comment on table public.events is
  '행동 로그. 작성 소요시간·정시율·반응률 계산에 쓴다. 12개월 후 삭제(04-schema §7).';
comment on column public.events.is_late is
  'report_submitted 에만 채워진다. 그 외 유형에서는 null.';

create index events_type_occurred_idx on public.events (type, occurred_at);
create index events_user_occurred_idx on public.events (user_id, occurred_at);
create index events_group_week_idx
  on public.events (group_id, week_key)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- export_logs — 내보내기 로그
-- ---------------------------------------------------------------------------

create table public.export_logs (
  id           bigint generated always as identity primary key,

  -- 유출 추적 근거이므로 사용자가 지워져도 로그 자체는 남는다.
  user_id      uuid references public.users (id) on delete set null,

  format       public.export_format not null,

  -- 내보낸 범위. group_ids 가 null 이면 전체 목장이다.
  range_start  date,
  range_end    date,
  group_ids    uuid[],

  created_at   timestamptz not null default now(),

  constraint export_logs_range_order_ck
    check (range_start is null or range_end is null or range_start <= range_end)
);

comment on table public.export_logs is
  '내보내기 로그. 지표가 아니라 데이터 거버넌스 장치다(PRD §10). 영구 보존 — 삭제하지 않는다.';
comment on column public.export_logs.group_ids is
  '내보낸 목장 목록. null 이면 전체.';

create index export_logs_user_created_idx on public.export_logs (user_id, created_at);
create index export_logs_created_at_idx on public.export_logs (created_at);
